import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './CasesPage.css';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

function formatMoney(n) {
  if (n == null) return '$0';
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return '$' + (n / 1_000_000_000).toFixed(2) + 'B';
  if (abs >= 1_000_000)     return '$' + (n / 1_000_000).toFixed(2) + 'M';
  if (abs >= 1_000)         return '$' + (n / 1_000).toFixed(1) + 'K';
  return '$' + n.toLocaleString();
}

function formatDuration(ms) {
  if (ms <= 0) return 'Ready!';
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function rarityStyle(rarities, rarity) {
  const r = rarities?.[rarity];
  if (!r) return { color: '#94a3b8', glow: 'rgba(148,163,184,0.4)', label: 'Common' };
  return r;
}

export default function CasesPage() {
  const { token, user, balance } = useAuth();
  const [cases, setCases]             = useState([]);
  const [rarities, setRarities]       = useState({});
  const [recent, setRecent]           = useState([]);
  const [freeCooldownMs, setFreeCooldownMs] = useState(0);
  const [loading, setLoading]         = useState(true);
  const [selectedCase, setSelectedCase] = useState(null);
  const [spinning, setSpinning]       = useState(false);
  const [result, setResult]           = useState(null);
  const [reel, setReel]               = useState([]);
  const [reelOffset, setReelOffset]   = useState(0);
  const [error, setError]             = useState('');

  const reelRef = useRef(null);

  // ── Initial fetch ─────────────────────────────────────────────────────────
  useEffect(() => {
    fetchCases();
  }, [token]);

  async function fetchCases() {
    try {
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      const res = await fetch(`${SERVER_URL}/api/cases`, { headers });
      const d   = await res.json();
      if (d.ok) {
        setCases(d.cases);
        setRarities(d.rarities);
        setRecent(d.recent || []);
        setFreeCooldownMs(d.freeCooldownMs || 0);
      }
    } catch (e) {
      console.error('cases fetch failed', e);
    }
    setLoading(false);
  }

  // ── Free cooldown ticker ──────────────────────────────────────────────────
  useEffect(() => {
    if (freeCooldownMs <= 0) return;
    const iv = setInterval(() => {
      setFreeCooldownMs(x => Math.max(0, x - 1000));
    }, 1000);
    return () => clearInterval(iv);
  }, [freeCooldownMs]);

  // ── Live feed socket ──────────────────────────────────────────────────────
  useEffect(() => {
    const sock = window.__gameSocket;
    if (!sock) return;
    function onOpen(entry) {
      setRecent(r => [entry, ...r].slice(0, 40));
    }
    sock.on('caseOpen', onOpen);
    return () => sock.off('caseOpen', onOpen);
  }, []);

  // ── Open case (reel animation) ────────────────────────────────────────────
  const openCase = useCallback(async (caseDef, isFree = false) => {
    if (spinning) return;
    setError('');
    setResult(null);

    if (!token) {
      setError('Please log in to open cases');
      return;
    }

    if (!isFree && caseDef.price > (balance || 0)) {
      setError(`Need ${formatMoney(caseDef.price)} to open this case`);
      return;
    }

    setSpinning(true);
    try {
      const res = await fetch(`${SERVER_URL}/api/cases/open`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body:    JSON.stringify({ caseId: caseDef.id, free: isFree }),
      });
      const d = await res.json();
      if (!d.ok) {
        setError(d.error || 'Failed to open case');
        setSpinning(false);
        if (d.cooldownMs) setFreeCooldownMs(d.cooldownMs);
        return;
      }

      setReel(d.reel);
      setReelOffset(0);

      // Animate the reel: slide so that item index 50 lands under the cursor.
      // We MEASURE the actual rendered cell instead of hard-coding a width —
      // each cell has border + padding + margin, and the mobile breakpoint
      // changes the cell size. A hardcoded CELL_W drifts by ~8 cells over 50
      // cells, which made the cursor land on a different item than the modal.
      const WINNING = 50;

      // Wait two frames so React renders the reel cells, then measure.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const container = reelRef.current;
          if (!container) return;
          const containerW = container.offsetWidth;
          const cells = container.querySelectorAll('.cases-reel-cell');
          const winCell = cells[WINNING];
          if (!winCell) {
            // Fallback (shouldn't happen): rough estimate
            setReelOffset(WINNING * 144 + 72 - containerW / 2);
            return;
          }
          // Centre of winning cell relative to the track's left edge.
          // offsetLeft is relative to the positioned container; at translate=0
          // the track's left edge aligns with the container's left edge, so
          // this is the correct absolute position within the reel.
          const cellCenter = winCell.offsetLeft + winCell.offsetWidth / 2;
          // Jitter up to ±35% of cell width so the cursor doesn't always land
          // dead-centre, but stays comfortably within the winning cell.
          const jitter = (Math.random() - 0.5) * winCell.offsetWidth * 0.7;
          const finalX = cellCenter - containerW / 2 + jitter;
          setReelOffset(finalX);
        });
      });

      // Reveal after ~6s (matches CSS transition duration)
      setTimeout(() => {
        setResult({ item: d.item, caseName: caseDef.name, caseEmoji: caseDef.emoji, profit: d.item.value - (isFree ? 0 : caseDef.price) });
        setSpinning(false);
        if (d.cooldownMs) setFreeCooldownMs(d.cooldownMs);
        // Confetti burst for rare+
        const tier = d.item.rarity;
        if (tier === 'legendary' || tier === 'mythic' || tier === 'epic') {
          burstConfetti(tier);
        }
      }, 6100);
    } catch (e) {
      console.error(e);
      setError('Network error');
      setSpinning(false);
    }
  }, [token, balance, spinning]);

  function closeResult() {
    setResult(null);
    setReel([]);
    setReelOffset(0);
  }

  if (loading) return <div className="cases-loading">Loading cases…</div>;

  return (
    <div className="cases-page">
      <div className="cases-header">
        <Link to="/" className="cases-back">← Home</Link>
        <div className="cases-title">
          <span className="cases-title-emoji">📦</span>
          <h1>Case Opening</h1>
        </div>
        <div className="cases-balance">💰 {formatMoney(balance)}</div>
      </div>

      <div className="cases-hero">
        <div className="cases-hero-text">
          <h2>Unbox the hype.</h2>
          <p>CSGO-style unboxing. Spin the reel. Pull mythics worth <strong>millions</strong>.</p>
        </div>
        {selectedCase === null && (
          <div className="cases-hero-note">👇 Pick a case to open</div>
        )}
      </div>

      <div className="cases-grid">
        {cases.map(c => (
          <CaseCard
            key={c.id}
            caseDef={c}
            rarities={rarities}
            balance={balance}
            selected={selectedCase?.id === c.id}
            onSelect={() => setSelectedCase(c)}
            onOpen={(isFree) => openCase(c, isFree)}
            freeCooldownMs={c.freeOnly ? freeCooldownMs : 0}
            spinning={spinning}
          />
        ))}
      </div>

      {error && <div className="cases-error">{error}</div>}

      {/* Reel + Result modal */}
      {(spinning || result) && (
        <div className="cases-reel-overlay">
          <div className="cases-reel-card">
            {spinning && !result && (
              <>
                <div className="cases-reel-title">🎰 Opening…</div>
                <div className="cases-reel-container" ref={reelRef}>
                  <div className="cases-reel-cursor" />
                  <div
                    className="cases-reel-track"
                    style={{ transform: `translateX(${-reelOffset}px)` }}
                  >
                    {reel.map((it, i) => {
                      const rs = rarityStyle(rarities, it.rarity);
                      return (
                        <div
                          key={i}
                          className="cases-reel-cell"
                          style={{
                            borderColor: rs.color,
                            boxShadow: `0 0 16px ${rs.glow}`,
                            background: `linear-gradient(180deg, rgba(0,0,0,0.4) 0%, ${rs.glow} 180%)`,
                          }}
                        >
                          <div className="cases-reel-emoji">{it.emoji}</div>
                          <div className="cases-reel-name" style={{ color: rs.color }}>{it.name}</div>
                          <div className="cases-reel-value">{formatMoney(it.value)}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {result && (() => {
              const rs = rarityStyle(rarities, result.item.rarity);
              const profitClass = result.profit >= 0 ? 'profit-pos' : 'profit-neg';
              return (
                <div className="cases-result" style={{ boxShadow: `0 0 60px ${rs.glow}` }}>
                  <div className="cases-result-rarity" style={{ color: rs.color, textShadow: `0 0 12px ${rs.glow}` }}>
                    {rs.label}
                  </div>
                  <div className="cases-result-emoji">{result.item.emoji}</div>
                  <div className="cases-result-name" style={{ color: rs.color }}>{result.item.name}</div>
                  <div className="cases-result-value">{formatMoney(result.item.value)}</div>
                  <div className={`cases-result-profit ${profitClass}`}>
                    {result.profit >= 0 ? '+' : ''}{formatMoney(result.profit)}
                  </div>
                  <div className="cases-result-from">from {result.caseEmoji} {result.caseName}</div>
                  <button className="cases-result-close" onClick={closeResult}>Continue</button>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Live feed of recent opens */}
      <div className="cases-live-feed">
        <h3>🔴 Live Unboxings</h3>
        {recent.length === 0 && <div className="cases-live-empty">No opens yet — be the first!</div>}
        <div className="cases-live-list">
          {recent.map((e, i) => {
            const rs = rarityStyle(rarities, e.item.rarity);
            return (
              <div key={i} className="cases-live-row" style={{ borderLeftColor: rs.color }}>
                <div className="cases-live-emoji" style={{ background: rs.glow }}>{e.item.emoji}</div>
                <div className="cases-live-details">
                  <div className="cases-live-user">
                    <strong>{e.username}</strong> pulled
                  </div>
                  <div className="cases-live-item" style={{ color: rs.color }}>
                    {e.item.name} <span style={{ color:'#fff' }}>({formatMoney(e.item.value)})</span>
                  </div>
                  <div className="cases-live-case">from {e.caseName}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Case card ───────────────────────────────────────────────────────────────
function CaseCard({ caseDef, rarities, balance, selected, onSelect, onOpen, freeCooldownMs, spinning }) {
  const [showItems, setShowItems] = useState(false);
  const canAfford = caseDef.freeOnly ? freeCooldownMs <= 0 : (balance || 0) >= caseDef.price;
  const topItem   = caseDef.items[0]; // pre-sorted by value desc

  return (
    <div
      className={`case-card ${selected ? 'case-card-selected' : ''}`}
      style={{ background: caseDef.bg, borderColor: caseDef.color }}
      onClick={onSelect}
    >
      <div className="case-card-emoji">{caseDef.emoji}</div>
      <div className="case-card-name" style={{ color: caseDef.color }}>{caseDef.name}</div>
      <div className="case-card-subtitle">{caseDef.subtitle}</div>

      <div className="case-card-top-prize">
        <div className="case-card-top-label">Top prize</div>
        <div className="case-card-top-value">
          <span className="case-card-top-emoji">{topItem.emoji}</span>
          {formatMoney(topItem.value)}
        </div>
      </div>

      <div className="case-card-price">
        {caseDef.freeOnly ? (
          freeCooldownMs > 0 ? (
            <span className="case-card-cooldown">⏳ {formatDuration(freeCooldownMs)}</span>
          ) : (
            <span className="case-card-free">FREE</span>
          )
        ) : (
          <span>{formatMoney(caseDef.price)}</span>
        )}
      </div>

      <button
        className="case-card-open-btn"
        style={{ background: caseDef.color, color: '#0a0a0f' }}
        disabled={!canAfford || spinning}
        onClick={(e) => { e.stopPropagation(); onOpen(caseDef.freeOnly); }}
      >
        {spinning ? 'Opening…' : caseDef.freeOnly ? (freeCooldownMs > 0 ? 'On Cooldown' : 'Open FREE') : 'Open Case'}
      </button>

      <button
        className="case-card-items-toggle"
        onClick={(e) => { e.stopPropagation(); setShowItems(s => !s); }}
      >
        {showItems ? 'Hide items ▲' : 'Show items ▼'}
      </button>

      {showItems && (
        <div className="case-card-items">
          {caseDef.items.map((it, i) => {
            const rs = rarityStyle(rarities, it.rarity);
            return (
              <div key={i} className="case-card-item-row" style={{ borderLeftColor: rs.color }}>
                <span className="case-card-item-emoji">{it.emoji}</span>
                <span className="case-card-item-name" style={{ color: rs.color }}>{it.name}</span>
                <span className="case-card-item-value">{formatMoney(it.value)}</span>
                <span className="case-card-item-odds">{(it.odds * 100).toFixed(it.odds < 0.005 ? 3 : 1)}%</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Confetti burst ──────────────────────────────────────────────────────────
function burstConfetti(tier) {
  const colors = tier === 'mythic'
    ? ['#f472b6', '#fbbf24', '#c084fc', '#60a5fa', '#fff']
    : tier === 'legendary'
      ? ['#fbbf24', '#fde047', '#fff', '#f59e0b']
      : ['#c084fc', '#a78bfa', '#fff'];

  const container = document.createElement('div');
  container.className = 'cases-confetti';
  document.body.appendChild(container);

  const count = tier === 'mythic' ? 160 : tier === 'legendary' ? 100 : 60;
  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    p.className = 'cases-confetti-piece';
    p.style.background = colors[Math.floor(Math.random() * colors.length)];
    p.style.left = Math.random() * 100 + '%';
    p.style.animationDuration = (1.8 + Math.random() * 2.4) + 's';
    p.style.animationDelay = (Math.random() * 0.6) + 's';
    p.style.transform = `rotate(${Math.random() * 360}deg)`;
    container.appendChild(p);
  }
  setTimeout(() => container.remove(), 5000);
}
