import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSocket } from '../hooks/useSocket';
import { getBalance, addBalance, subtractBalance, isRiggedMode } from '../utils/casinoBalance';
import { isHighScore } from '../utils/leaderboard';
import HighScoreModal from '../components/HighScoreModal';
import './TexasHoldem.css';
import useBanCheck from '../hooks/useBanCheck';
import useGameActivity from '../hooks/useGameActivity';

// ── Card component ─────────────────────────────────────────────────────────────
const RED_SUITS = new Set(['♥', '♦']);

function PokerCard({ card, small, faceDown }) {
  if (!card || faceDown) {
    return <div className={`pk-card pk-card--back ${small ? 'pk-card--small' : ''}`}><div className="pk-card-back-pat" /></div>;
  }
  const red = RED_SUITS.has(card.suit);
  return (
    <div className={`pk-card ${red ? 'pk-card--red' : 'pk-card--black'} ${small ? 'pk-card--small' : ''}`}>
      <div className="pk-corner pk-tl"><div>{card.rank}</div><div>{card.suit}</div></div>
      <div className="pk-center">{card.suit}</div>
      <div className="pk-corner pk-br"><div>{card.suit}</div><div>{card.rank}</div></div>
    </div>
  );
}

// ── Utility ────────────────────────────────────────────────────────────────────
function getTablePos(relIdx, total) {
  const angle = (2 * Math.PI * relIdx) / total;
  return {
    x: 50 + 43 * Math.sin(angle),
    y: 52 + 36 * Math.cos(angle),
  };
}

function getSeatLabel(playerIdx, dealerIdx, sbIdx, bbIdx, total) {
  if (playerIdx === dealerIdx) return '🎯';
  if (playerIdx === sbIdx)     return 'SB';
  if (playerIdx === bbIdx)     return 'BB';
  return '';
}

const ROUND_LABELS = { preflop: 'Pre-Flop', flop: 'Flop', turn: 'Turn', river: 'River', showdown: 'Showdown' };

const BUYIN_OPTIONS = [100, 250, 500, 1000, 2500];

// ── Lobby (room browser) ───────────────────────────────────────────────────────
function Lobby({ emit, roomList, errorMsg, casinoBalance }) {
  const [name, setName]         = useState(() => localStorage.getItem('th_name') || '');
  const [buyIn, setBuyIn]       = useState(1000);
  const [customInput, setCustomInput] = useState('1000');
  const [joiningCode, setJC]    = useState(null);

  function saveName(v) { setName(v); localStorage.setItem('th_name', v); }

  // Keep the number input in sync when a preset is clicked
  function pickPreset(v) {
    setBuyIn(v);
    setCustomInput(String(v));
  }

  // Parse the custom input and clamp to [100, casinoBalance]
  function handleCustomChange(raw) {
    setCustomInput(raw);
    const parsed = Math.floor(Number(raw));
    if (!isNaN(parsed) && parsed >= 100) {
      setBuyIn(Math.min(parsed, casinoBalance));
    }
  }

  function handleCustomBlur() {
    const clamped = Math.max(100, Math.min(Math.floor(Number(customInput) || 100), casinoBalance));
    setBuyIn(clamped);
    setCustomInput(String(clamped));
  }

  function create() {
    if (!name.trim() || casinoBalance < buyIn) return;
    emit('createRoom', { playerName: name.trim(), buyIn });
  }

  function join(r) {
    if (!name.trim() || casinoBalance < r.buyIn) return;
    setJC(r.code);
    emit('joinRoom', { roomCode: r.code, playerName: name.trim() });
  }

  return (
    <div className="th-lobby">
      <div className="th-lobby-title">♠ Texas Hold'em ♥</div>
      <div className="th-lobby-sub">Multiplayer Poker — 2 to 6 players</div>
      <div className="th-lobby-balance">💰 Casino Balance: <strong>${casinoBalance.toLocaleString()}</strong></div>

      {errorMsg && <div className="th-error">{errorMsg}</div>}

      <div className="th-name-row">
        <input
          className="th-name-input"
          placeholder="Your name"
          value={name}
          maxLength={16}
          onChange={e => saveName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && create()}
        />
      </div>

      {/* Buy-in selector (only for creating a room) */}
      <div className="th-buyin-section">
        <div className="th-buyin-label">Buy-in (create new room):</div>
        <div className="th-buyin-options">
          {BUYIN_OPTIONS.map(v => (
            <button
              key={v}
              className={`th-buyin-btn ${buyIn === v ? 'selected' : ''} ${casinoBalance < v ? 'disabled' : ''}`}
              onClick={() => pickPreset(v)}
              disabled={casinoBalance < v}
            >
              ${v.toLocaleString()}
            </button>
          ))}
        </div>
        <div className="th-buyin-custom-row">
          <label className="th-buyin-custom-label">Custom amount:</label>
          <input
            type="number"
            className="th-buyin-custom-input"
            min={100}
            max={casinoBalance}
            step={50}
            value={customInput}
            onChange={e => handleCustomChange(e.target.value)}
            onBlur={handleCustomBlur}
          />
        </div>
        <button className="th-btn th-btn--create" onClick={create} disabled={!name.trim() || casinoBalance < buyIn || buyIn < 100}>
          + Create Room (${buyIn.toLocaleString()} buy-in)
        </button>
      </div>

      <div className="th-rooms-panel">
        <div className="th-rooms-title">Open Rooms</div>
        {roomList.length === 0 ? (
          <div className="th-rooms-empty">No open rooms — create one above!</div>
        ) : (
          <div className="th-rooms-list">
            {roomList.map(r => (
              <div key={r.code} className="th-room-row">
                <div className="th-room-info">
                  <span className="th-room-host">{r.hostName}'s room</span>
                  <span className="th-room-count">{r.playerCount} / {r.maxPlayers} players</span>
                  <span className="th-room-buyin">Buy-in: ${r.buyIn?.toLocaleString()}</span>
                </div>
                <button
                  className="th-btn th-btn--join"
                  onClick={() => join(r)}
                  disabled={!name.trim() || joiningCode === r.code || casinoBalance < r.buyIn}
                  title={casinoBalance < r.buyIn ? `Need $${r.buyIn?.toLocaleString()} to join` : ''}
                >
                  {casinoBalance < r.buyIn ? '🚫 Can\'t afford' : 'Join'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Waiting room ───────────────────────────────────────────────────────────────
function WaitingRoom({ roomState, myId, emit, onLeave }) {
  const isHost = roomState.hostId === myId;
  return (
    <div className="th-waiting">
      <div className="th-waiting-title">♠ Texas Hold'em</div>
      <div className="th-waiting-code">Room: <strong>{roomState.roomCode}</strong></div>
      <div className="th-waiting-players">
        {roomState.players.map(p => (
          <div key={p.id} className={`th-waiting-player ${p.id === roomState.hostId ? 'host' : ''}`}>
            {p.id === roomState.hostId ? '👑 ' : '👤 '}{p.name}
          </div>
        ))}
      </div>
      <div className="th-waiting-hint">{roomState.players.length} / 6 players joined</div>
      {isHost ? (
        <button
          className="th-btn th-btn--start"
          disabled={roomState.players.length < 2}
          onClick={() => emit('startGame', { roomCode: roomState.roomCode })}
        >
          {roomState.players.length < 2 ? 'Waiting for players…' : '▶ Start Game'}
        </button>
      ) : (
        <div className="th-waiting-hint">Waiting for host to start…</div>
      )}
      <button className="th-btn th-btn--leave" onClick={onLeave}>Leave Room</button>
    </div>
  );
}

// ── Main game table ────────────────────────────────────────────────────────────
function GameTable({ roomState, myId, emit, casinoBalance }) {
  const gs        = roomState;
  const myPIdx    = gs.players.findIndex(p => p.id === myId);
  const me        = gs.players[myPIdx] ?? {};
  const n         = gs.players.length;
  const isMyTurn  = gs.handInProgress && gs.currentIdx === myPIdx;
  const toCall    = Math.max(0, gs.currentBet - (me.bet ?? 0));
  const canCheck  = isMyTurn && toCall === 0;
  const canCall   = isMyTurn && toCall > 0;
  const minRaiseTo = (gs.currentBet ?? 0) + (gs.minRaise ?? 20);
  const maxRaiseTo = (me.chips ?? 0) + (me.bet ?? 0);

  const [raiseAmt, setRaiseAmt]       = useState(minRaiseTo);
  const [showReload, setShowReload]   = useState(false);
  const [reloadInput, setReloadInput] = useState('500');

  // Update raise default when game state changes
  useEffect(() => {
    setRaiseAmt(minRaiseTo);
  }, [minRaiseTo]);

  function act(type, extra = {}) {
    emit('playerAction', { roomCode: gs.roomCode, action: { type, ...extra } });
  }

  const isBusted      = (me.chips ?? 0) === 0;
  const reloadMax     = casinoBalance ?? 0;
  const reloadAmt     = Math.max(100, Math.min(Math.floor(Number(reloadInput) || 100), reloadMax));
  const canReload     = reloadMax >= 100;

  function submitReload() {
    if (!canReload || reloadAmt < 100) return;
    emit('reloadChips', { roomCode: gs.roomCode, amount: reloadAmt });
    setShowReload(false);
    setReloadInput('500');
  }

  return (
    <div className="th-game">
      {/* Round / pot info */}
      <div className="th-top-bar">
        <div className="th-round-label">{ROUND_LABELS[gs.round] || ''}</div>
        <div className="th-pot">Pot: <strong>${gs.pot?.toLocaleString()}</strong></div>
        {gs.currentBet > 0 && <div className="th-current-bet">Bet: ${gs.currentBet}</div>}
      </div>

      {/* Table */}
      <div className="th-table-wrap">
        <div className="th-table">
          {/* Community cards */}
          <div className="th-community">
            <div className="th-community-cards">
              {Array.from({ length: 5 }, (_, i) => (
                <PokerCard key={i} card={gs.communityCards?.[i]} faceDown={!gs.communityCards?.[i]} small />
              ))}
            </div>
          </div>

          {/* Player seats */}
          {gs.players.map((player, idx) => {
            const relIdx = (idx - myPIdx + n) % n;
            const pos    = getTablePos(relIdx, n);
            const isMe   = player.id === myId;
            const isActive = gs.currentIdx === idx && gs.handInProgress;
            const seatLabel = getSeatLabel(idx, gs.dealerIdx, gs.sbIdx, gs.bbIdx, n);

            return (
              <div
                key={player.id}
                className={`th-seat ${isMe ? 'th-seat--me' : ''} ${isActive ? 'th-seat--active' : ''} ${player.folded ? 'th-seat--folded' : ''}`}
                style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
              >
                {seatLabel && <div className="th-seat-badge">{seatLabel}</div>}
                <div className="th-seat-cards">
                  {player.holeCards ? player.holeCards.map((c, ci) => (
                    <PokerCard key={ci} card={c} faceDown={c === null} small />
                  )) : (
                    <>
                      <PokerCard faceDown small />
                      <PokerCard faceDown small />
                    </>
                  )}
                </div>
                <div className="th-seat-name">{player.name}{player.allIn ? ' (ALL-IN)' : ''}</div>
                <div className="th-seat-chips">${player.chips?.toLocaleString()}</div>
                {player.bet > 0 && <div className="th-seat-bet">Bet: ${player.bet}</div>}
                {player.handName && <div className="th-seat-handname">{player.handName}</div>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Showdown result */}
      {gs.round === 'showdown' && gs.winners && (
        <div className="th-showdown">
          <div className="th-showdown-title">Showdown</div>
          {gs.winners.map((w, i) => (
            <div key={i} className="th-winner-row">
              <span className="th-winner-name">{w.name}</span>
              <span className="th-winner-hand">{w.handName}</span>
              <span className="th-winner-amt">+${w.amount}</span>
            </div>
          ))}
          <button
            className="th-btn th-btn--next"
            onClick={() => emit('nextHand', { roomCode: gs.roomCode })}
          >
            Next Hand ▶
          </button>
        </div>
      )}

      {/* My action buttons */}
      {isMyTurn && !me.folded && !me.allIn && gs.round !== 'showdown' && (
        <div className="th-actions">
          <button className="th-act-btn th-act--fold" onClick={() => act('fold')}>Fold</button>
          {canCheck && <button className="th-act-btn th-act--check" onClick={() => act('check')}>Check</button>}
          {canCall && (
            <button className="th-act-btn th-act--call" onClick={() => act('call')}>
              Call ${Math.min(toCall, me.chips)}
            </button>
          )}
          {maxRaiseTo > gs.currentBet && (
            <div className="th-raise-wrap">
              <div className="th-raise-row">
                <input
                  type="range"
                  className="th-raise-slider"
                  min={minRaiseTo}
                  max={maxRaiseTo}
                  value={Math.min(Math.max(raiseAmt, minRaiseTo), maxRaiseTo)}
                  onChange={e => setRaiseAmt(+e.target.value)}
                />
                <input
                  type="number"
                  className="th-raise-input"
                  min={minRaiseTo}
                  max={maxRaiseTo}
                  value={Math.min(Math.max(raiseAmt, minRaiseTo), maxRaiseTo)}
                  onChange={e => setRaiseAmt(Math.min(Math.max(+e.target.value, minRaiseTo), maxRaiseTo))}
                />
              </div>
              <button
                className="th-act-btn th-act--raise"
                onClick={() => act('raise', { totalBet: Math.min(Math.max(raiseAmt, minRaiseTo), maxRaiseTo) })}
              >
                {toCall === 0 ? `Bet $${Math.min(Math.max(raiseAmt, minRaiseTo), maxRaiseTo)}` : `Raise to $${Math.min(Math.max(raiseAmt, minRaiseTo), maxRaiseTo)}`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Waiting for turn */}
      {!isMyTurn && gs.handInProgress && gs.round !== 'showdown' && (
        <div className="th-waiting-turn">
          Waiting for <strong>{gs.players[gs.currentIdx]?.name ?? '…'}</strong> to act…
        </div>
      )}

      {/* Bust / eliminated */}
      {!gs.handInProgress && !gs.winners && (
        <div className="th-waiting-turn">Waiting for next hand…</div>
      )}

      {/* Reload chips when busted */}
      {isBusted && !gs.handInProgress && (
        <div className="th-reload-wrap">
          {!showReload ? (
            <button
              className="th-btn th-btn--reload"
              onClick={() => setShowReload(true)}
              disabled={!canReload}
              title={!canReload ? 'Not enough casino balance (min $100)' : ''}
            >
              💰 Reload Chips
            </button>
          ) : (
            <div className="th-reload-form">
              <div className="th-reload-label">
                Reload amount <span className="th-reload-hint">(min $100, max ${reloadMax.toLocaleString()} available)</span>:
              </div>
              <div className="th-reload-row">
                <input
                  type="number"
                  className="th-reload-input"
                  min={100}
                  max={reloadMax}
                  step={50}
                  value={reloadInput}
                  onChange={e => setReloadInput(e.target.value)}
                />
                <button
                  className="th-btn th-btn--reload-confirm"
                  onClick={submitReload}
                  disabled={reloadAmt < 100 || reloadAmt > reloadMax}
                >
                  Confirm (${reloadAmt.toLocaleString()})
                </button>
                <button
                  className="th-btn th-btn--reload-cancel"
                  onClick={() => setShowReload(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Root component ─────────────────────────────────────────────────────────────
export default function TexasHoldem() {
  const { banned, reason, expiresAt, loading } = useBanCheck('texas-holdem');
  useGameActivity('texas-holdem');
  const { emit, on, connected } = useSocket('/texasholdem');
  const [myId, setMyId]           = useState(null);
  const [roomState, setRoomState] = useState(null);
  const [roomList, setRoomList]   = useState([]);
  const [errorMsg, setErrorMsg]   = useState('');
  const [casinoBalance, setCasinoBalance] = useState(getBalance);
  const [sessionBuyIn, setSessionBuyIn]   = useState(0);
  const [pokerHSScore, setPokerHSScore]   = useState(null); // profit chips for HS modal
  const roomCodeRef               = useRef(null);

  function syncBalance() { setCasinoBalance(getBalance()); }

  useEffect(() => {
    const off = [
      on('roomCreated', ({ roomCode, playerId, buyIn }) => {
        setMyId(playerId);
        roomCodeRef.current = roomCode;
        // Deduct buy-in from casino balance now that we're confirmed in the room
        subtractBalance(buyIn ?? 0);
        syncBalance();
      }),
      on('roomJoined', ({ playerId, buyIn }) => {
        setMyId(playerId);
        setSessionBuyIn(buyIn ?? 0);
        subtractBalance(buyIn ?? 0);
        syncBalance();
      }),
      on('gameState', state => {
        setRoomState(state);
        roomCodeRef.current = state.roomCode;
      }),
      on('roomList', list => setRoomList(list)),
      on('cashOut', ({ chips }) => {
        // Server is cashing us out — add chips back to casino balance and return to lobby
        if (chips > 0) {
          // Rigged: cap payout to buy-in so players can never profit
          const payout = isRiggedMode() ? Math.min(chips, sessionBuyIn) : chips;
          addBalance(payout);
          syncBalance();
          // Check if session profit is a leaderboard high score
          const profit = payout - sessionBuyIn;
          if (profit > 0) {
            isHighScore('texas-holdem', profit).then(yes => {
              if (yes) setPokerHSScore(profit);
            });
          }
        }
        setRoomState(null);
        setMyId(null);
        roomCodeRef.current = null;
        setSessionBuyIn(0);
      }),
      on('bustedOut', () => {
        // Lost all chips — 0 returned, go back to lobby
        setRoomState(null);
        setMyId(null);
        roomCodeRef.current = null;
      }),
      on('chipsReloaded', ({ amount }) => {
        subtractBalance(amount);
        syncBalance();
      }),
      on('error', ({ message }) => {
        setErrorMsg(message);
        setTimeout(() => setErrorMsg(''), 4000);
      }),
    ];
    return () => off.forEach(fn => fn());
  }, [on]);

  const doEmit = useCallback((event, data) => {
    setErrorMsg('');
    emit(event, data);
  }, [emit]);

  function leaveRoom() {
    if (roomCodeRef.current) {
      doEmit('leaveRoom', { roomCode: roomCodeRef.current });
      // cashOut event from server will reset state and refund chips
    } else {
      setRoomState(null);
      setMyId(null);
    }
  }

  const inRoom = !!roomState;
  const inGame = inRoom && (roomState.status === 'playing' || roomState.status === 'ended');

  // Show chips in game header — and casino balance for context
  const myChips = roomState?.players.find(p => p.id === myId)?.chips ?? 0;

  if (loading) return null;
  if (banned) {
    const exp = expiresAt ? new Date(expiresAt).toLocaleString() : null;
    return (
      <div style={{minHeight:'100vh',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:'#0f0f1a',color:'#fff',fontFamily:'Roboto,sans-serif',gap:'12px',padding:'32px',textAlign:'center'}}>
        <div style={{fontSize:'4rem'}}>🚫</div>
        <h2 style={{margin:0,color:'#ef4444'}}>Access Denied</h2>
        <p style={{margin:0,color:'#aaa',maxWidth:'360px'}}>You have been banned from this game{reason ? `: ${reason}` : '.'}</p>
        {exp ? <p style={{margin:0,color:'#666',fontSize:'0.85rem'}}>Ban expires: {exp}</p> : <p style={{margin:0,color:'#666',fontSize:'0.85rem'}}>This ban is permanent.</p>}
      </div>
    );
  }

  return (
    <div className="th-root">
      {pokerHSScore !== null && (
        <HighScoreModal
          gameId="texas-holdem"
          score={pokerHSScore}
          label="chip profit"
          higherIsBetter={true}
          onSave={() => setPokerHSScore(null)}
          onDismiss={() => setPokerHSScore(null)}
        />
      )}
      {!connected && <div className="th-conn-banner">Connecting…</div>}
      {errorMsg && <div className="th-error-toast">{errorMsg}</div>}

      {!inRoom && (
        <Lobby emit={doEmit} roomList={roomList} errorMsg={errorMsg} casinoBalance={casinoBalance} />
      )}

      {inRoom && !inGame && (
        <WaitingRoom roomState={roomState} myId={myId} emit={doEmit} onLeave={leaveRoom} />
      )}

      {inGame && (
        <>
          <div className="th-game-header">
            <button className="th-leave-btn" onClick={leaveRoom}>← Leave</button>
            <span className="th-game-title">♠ Texas Hold'em ♥</span>
            <span className="th-my-chips">
              Table: <strong>${myChips.toLocaleString()}</strong>
              <span className="th-casino-bal"> | Bank: ${casinoBalance.toLocaleString()}</span>
            </span>
          </div>
          <GameTable roomState={roomState} myId={myId} emit={doEmit} casinoBalance={casinoBalance} />
        </>
      )}
    </div>
  );
}
