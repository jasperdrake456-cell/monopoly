import React, { useMemo, useEffect, useRef, useState } from 'react';
import Tile from './Tile';
import { BOARD, TOKEN_COLORS, TOKENS, getGridPos } from '../boardData';
import './Board.css';

const HOP_MS = 650; // ms per space — slow, deliberate hop
const JAIL_ANIM_MS = 3200; // how long the police car animation shows

export default function Board({ gameState, myId, board: boardProp }) {
  const { players, propertyStates, currentPlayerIndex, freeParking, freeParkingEnabled } = gameState;
  // Use prop if provided (world board), fall back to imported BOARD
  const boardData = boardProp || BOARD;
  const currentPlayer = players[currentPlayerIndex];

  // ── Animated positions ───────────────────────────────────────────────────
  const prevPosRef   = useRef({});   // last known actual position per player
  const prevJailRef  = useRef({});   // last known jailTurns per player
  const timerRef     = useRef([]);   // all pending timers (cleared on unmount)
  const [displayPos, setDisplayPos]   = useState({});   // where to render each player
  const [hoppingIds, setHoppingIds]   = useState({});   // players currently mid-hop
  const [jailAnim,   setJailAnim]     = useState(null); // { name, token, color } when police car plays

  // Clean up timers on unmount
  useEffect(() => () => timerRef.current.forEach(clearTimeout), []);

  useEffect(() => {
    players.forEach(p => {
      // ── Jail detection ────────────────────────────────────────────────
      const prevJail = prevJailRef.current[p.id] ?? 0;
      if (p.jailTurns > 0 && prevJail === 0) {
        // Player was just sent to jail — trigger police car animation
        setJailAnim({ name: p.name, token: TOKENS[p.token], color: TOKEN_COLORS[p.token] });
        const tj = setTimeout(() => setJailAnim(null), JAIL_ANIM_MS);
        timerRef.current.push(tj);
      }
      prevJailRef.current[p.id] = p.jailTurns;

      // ── Position animation ────────────────────────────────────────────
      const prev = prevPosRef.current[p.id];

      if (prev === undefined) {
        // First time seeing this player — just place them, no animation
        prevPosRef.current[p.id] = p.position;
        setDisplayPos(dp => ({ ...dp, [p.id]: p.position }));
        return;
      }

      if (prev === p.position) return; // no change

      prevPosRef.current[p.id] = p.position;

      if (p.bankrupt) {
        setDisplayPos(dp => ({ ...dp, [p.id]: p.position }));
        return;
      }

      // Build the list of spaces to step through
      const steps = [];
      let cur = prev;
      while (cur !== p.position) {
        cur = (cur + 1) % 40;
        steps.push(cur);
      }

      // If it's a teleport (>12 spaces — jail card, advance card, Go to Jail)
      // skip the walk animation and jump directly
      if (steps.length > 12) {
        setDisplayPos(dp => ({ ...dp, [p.id]: p.position }));
        return;
      }

      // Animate step by step
      steps.forEach((pos, i) => {
        const t1 = setTimeout(() => {
          setDisplayPos(dp => ({ ...dp, [p.id]: pos }));
          setHoppingIds(h => ({ ...h, [p.id]: true }));
          // Clear hop class shortly before next step lands
          const t2 = setTimeout(() => {
            setHoppingIds(h => { const nh = { ...h }; delete nh[p.id]; return nh; });
          }, HOP_MS - 80);
          timerRef.current.push(t2);
        }, i * HOP_MS);
        timerRef.current.push(t1);
      });
    });
  }, [players]); // eslint-disable-line

  // ── Build position map from animated positions ───────────────────────────
  const playersByPosition = useMemo(() => {
    const map = {};
    players.forEach(p => {
      if (!p.bankrupt) {
        const pos = displayPos[p.id] ?? p.position;
        if (!map[pos]) map[pos] = [];
        map[pos].push({ ...p, isHopping: !!hoppingIds[p.id] });
      }
    });
    return map;
  }, [players, displayPos, hoppingIds]);

  const enrichedStates = useMemo(() => {
    const result = {};
    Object.entries(propertyStates).forEach(([id, ps]) => {
      const owner = ps.owner ? players.find(p => p.id === ps.owner) : null;
      result[id] = { ...ps, ownerColor: owner ? TOKEN_COLORS[owner.token] : null };
    });
    return result;
  }, [propertyStates, players]);

  return (
    <div className="board-wrap">
      <div className="board">
        {boardData.map(space => {
          const { row, col } = getGridPos(space.id);
          const playersHere = playersByPosition[space.id] || [];
          const ps = enrichedStates[space.id] || null;

          return (
            <div key={space.id} className="board-cell"
              style={{ gridRow: row + 1, gridColumn: col + 1 }}>
              <Tile
                space={space}
                propertyState={ps}
                playersHere={playersHere}
                isHighlighted={currentPlayer?.position === space.id && playersHere.length === 0}
                currentPlayerId={currentPlayer?.id}
              />
            </div>
          );
        })}

        {/* Police-car jail animation overlay */}
        {jailAnim && (
          <div className="jail-anim-overlay">
            <div className="jail-car">🚔</div>
            <div className="jail-anim-siren" />
            <div className="jail-anim-banner">
              <span className="jail-anim-busted">🔒 BUSTED!</span>
              <span className="jail-anim-player" style={{ color: jailAnim.color }}>
                {jailAnim.token} {jailAnim.name}
              </span>
              <span className="jail-anim-sub">is going to jail</span>
            </div>
          </div>
        )}

        {/* Center */}
        <div className="board-center" style={{ gridRow: '2 / 11', gridColumn: '2 / 11' }}>
          <div className="board-center-content">
            <div className="board-logo">MONOPOLY</div>
            {freeParkingEnabled && freeParking > 0 && (
              <div className="free-parking-pot">
                <span>Free Parking Pot</span>
                <span className="pot-amount">${freeParking.toLocaleString()}</span>
              </div>
            )}
            <div className="board-players-list">
              {players.filter(p => !p.bankrupt).map(p => (
                <div key={p.id}
                  className={`board-player-row ${p.id === currentPlayer?.id ? 'active' : ''}`}
                  style={{ borderLeftColor: TOKEN_COLORS[p.token] }}>
                  <span className="bpr-token">{TOKENS[p.token]}</span>
                  <span className="bpr-name">{p.name}</span>
                  <span className="bpr-cash">${p.cash.toLocaleString()}</span>
                </div>
              ))}
              {players.filter(p => p.bankrupt).map(p => (
                <div key={p.id} className="board-player-row bankrupt">
                  <span className="bpr-token">{TOKENS[p.token]}</span>
                  <span className="bpr-name">{p.name}</span>
                  <span>💀</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
