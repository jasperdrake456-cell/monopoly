import React, { useState, useRef, useEffect } from 'react';
import './UnoGame.css';

// ── Card colour maps ──────────────────────────────────────────────────────────
const COLOR_MAP = {
  red:    '#dc2626',
  green:  '#16a34a',
  blue:   '#2563eb',
  yellow: '#ca8a04',
  wild:   null, // handled separately
};

const COLOR_LIGHT = {
  red:    '#fca5a5',
  green:  '#86efac',
  blue:   '#93c5fd',
  yellow: '#fde68a',
};

// Symbol display for action cards
function cardLabel(value) {
  switch (value) {
    case 'skip':    return '⊘';
    case 'reverse': return '↺';
    case 'draw2':   return '+2';
    case 'wild':    return '★';
    case 'draw4':   return '★+4';
    default:        return value;
  }
}

function cardTitle(card) {
  if (!card) return '';
  if (card.value === 'wild') return 'Wild';
  if (card.value === 'draw4') return 'Wild Draw 4';
  if (card.value === 'skip') return `${cap(card.color)} Skip`;
  if (card.value === 'reverse') return `${cap(card.color)} Reverse`;
  if (card.value === 'draw2') return `${cap(card.color)} Draw 2`;
  return `${cap(card.color)} ${card.value}`;
}

function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : ''; }

// ── Single Card component ─────────────────────────────────────────────────────
function UnoCard({
  card,
  small = false,
  playable = false,
  dimmed = false,
  onClick,
  isBack = false,
  selected = false,
  className = '',
}) {
  if (isBack) {
    return (
      <div className={`uno-card uno-card--back ${small ? 'uno-card--small' : ''} ${className}`}>
        <div className="uno-card-back-inner">UNO</div>
      </div>
    );
  }

  const isWild = card.color === 'wild';
  const label  = cardLabel(card.value);
  const bg     = isWild
    ? 'conic-gradient(from 0deg, #dc2626 0deg 90deg, #2563eb 90deg 180deg, #16a34a 180deg 270deg, #ca8a04 270deg 360deg)'
    : COLOR_MAP[card.color] || '#666';

  const textColor = card.color === 'yellow' ? '#1a1a1a' : '#fff';

  return (
    <div
      className={[
        'uno-card',
        small  ? 'uno-card--small'    : '',
        playable && !dimmed ? 'uno-card--playable' : '',
        dimmed  ? 'uno-card--dimmed'  : '',
        selected ? 'uno-card--selected' : '',
        isWild  ? 'uno-card--wild'    : '',
        className,
      ].filter(Boolean).join(' ')}
      style={{ background: isWild ? undefined : bg, '--card-color': bg }}
      onClick={onClick}
      title={cardTitle(card)}
    >
      {isWild && <div className="uno-card-wild-bg" />}

      <div className="uno-card-inner" style={{ color: isWild ? '#fff' : textColor }}>
        {/* Top-left corner */}
        <div className="uno-card-corner uno-card-corner--tl">
          <span className="uno-card-corner-val">{label}</span>
        </div>

        {/* Center */}
        <div className="uno-card-center">{label}</div>

        {/* Bottom-right corner (rotated) */}
        <div className="uno-card-corner uno-card-corner--br">
          <span className="uno-card-corner-val">{label}</span>
        </div>
      </div>
    </div>
  );
}

// ── Opponent area ─────────────────────────────────────────────────────────────
function OpponentArea({ playerId, name, cardCount, isCurrentPlayer, unoSafe, pendingUno, isMe }) {
  const hasUno = cardCount === 1;
  const unsafeUno = hasUno && !unoSafe && pendingUno === playerId;

  return (
    <div className={`uno-opponent ${isCurrentPlayer ? 'uno-opponent--active' : ''} ${isMe ? 'uno-opponent--me' : ''}`}>
      <div className="uno-opponent-name">
        {name}
        {isCurrentPlayer && <span className="uno-opponent-turn-dot" />}
      </div>

      {/* Stacked card backs */}
      <div className="uno-opponent-cards">
        {Array.from({ length: Math.min(cardCount, 10) }).map((_, i) => (
          <div
            key={i}
            className="uno-opponent-card-back"
            style={{ '--stack-i': i }}
          >
            <span className="uno-opponent-card-text">UNO</span>
          </div>
        ))}
        {cardCount > 10 && (
          <div className="uno-opponent-overflow">+{cardCount - 10}</div>
        )}
      </div>

      <div className="uno-opponent-count">{cardCount} card{cardCount !== 1 ? 's' : ''}</div>

      {hasUno && (
        <div className={`uno-uno-badge ${unsafeUno ? 'uno-uno-badge--unsafe' : ''}`}>
          UNO!
        </div>
      )}
    </div>
  );
}

// ── Color Picker modal ────────────────────────────────────────────────────────
function ColorPicker({ onPick, onCancel }) {
  return (
    <div className="uno-overlay">
      <div className="uno-color-picker">
        <div className="uno-color-picker-title">Choose a color</div>
        <div className="uno-color-picker-grid">
          {['red', 'green', 'blue', 'yellow'].map(color => (
            <button
              key={color}
              className="uno-color-btn"
              style={{ background: COLOR_MAP[color] }}
              onClick={() => onPick(color)}
            >
              {cap(color)}
            </button>
          ))}
        </div>
        <button className="uno-color-cancel" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// ── Win / Lose overlay ────────────────────────────────────────────────────────
function EndOverlay({ roomState, myId, emit }) {
  const winner = roomState.winner;
  const iWon   = winner === myId;
  const winnerName = roomState.playerNames?.[winner] || 'Someone';
  const isHost = roomState.hostId === myId;

  return (
    <div className="uno-overlay uno-overlay--end">
      <div className={`uno-end-card ${iWon ? 'uno-end-card--win' : 'uno-end-card--lose'}`}>
        <div className="uno-end-emoji">{iWon ? '🏆' : '💀'}</div>
        <div className="uno-end-title">{iWon ? 'You Win!' : `${winnerName} Wins!`}</div>
        <div className="uno-end-sub">
          {iWon ? 'First to empty the hand!' : 'Better luck next time!'}
        </div>
        {isHost && (
          <button
            className="uno-end-rematch"
            onClick={() => emit('rematchGame', { roomCode: roomState.roomCode })}
          >
            Rematch
          </button>
        )}
        {!isHost && (
          <div className="uno-end-wait">Waiting for host to start a rematch…</div>
        )}
      </div>
    </div>
  );
}

// ── Chat panel ────────────────────────────────────────────────────────────────
function ChatPanel({ roomCode, myName, chatMessages, emit }) {
  const [open,    setOpen]    = useState(false);
  const [text,    setText]    = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, open]);

  function send(e) {
    e.preventDefault();
    if (!text.trim()) return;
    emit('chatMessage', { roomCode, text: text.trim() });
    setText('');
  }

  return (
    <div className={`uno-chat ${open ? 'uno-chat--open' : ''}`}>
      <button className="uno-chat-toggle" onClick={() => setOpen(o => !o)}>
        💬 {open ? 'Close' : 'Chat'}
        {!open && chatMessages.length > 0 && (
          <span className="uno-chat-badge">{chatMessages.length}</span>
        )}
      </button>
      {open && (
        <div className="uno-chat-panel">
          <div className="uno-chat-messages">
            {chatMessages.map((m, i) => (
              <div key={i} className="uno-chat-msg">
                <span className="uno-chat-from">{m.from}:</span> {m.text}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
          <form className="uno-chat-form" onSubmit={send}>
            <input
              className="uno-chat-input"
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Type a message…"
              maxLength={200}
            />
            <button className="uno-chat-send" type="submit">Send</button>
          </form>
        </div>
      )}
    </div>
  );
}

// ── Draw-pile prompt (play or pass the drawn card) ────────────────────────────
function DrawnCardPrompt({ card, roomCode, emit, onDismiss }) {
  const [picking, setPicking] = useState(false);

  function handlePlay() {
    if (card.type === 'wild') {
      setPicking(true);
    } else {
      emit('playDrawn', { roomCode });
      onDismiss();
    }
  }

  function handlePick(color) {
    emit('playDrawn', { roomCode, chosenColor: color });
    setPicking(false);
    onDismiss();
  }

  function handlePass() {
    emit('passTurn', { roomCode });
    onDismiss();
  }

  if (picking) return <ColorPicker onPick={handlePick} onCancel={() => setPicking(false)} />;

  return (
    <div className="uno-overlay">
      <div className="uno-drawn-prompt">
        <div className="uno-drawn-title">You drew:</div>
        <UnoCard card={card} playable />
        <div className="uno-drawn-actions">
          <button className="uno-drawn-play" onClick={handlePlay}>Play it</button>
          <button className="uno-drawn-pass" onClick={handlePass}>Pass turn</button>
        </div>
      </div>
    </div>
  );
}

// ── Main Game component ───────────────────────────────────────────────────────
export default function UnoGame({ roomState, myId, emit, chatMessages }) {
  const [selectedIdx,  setSelectedIdx]  = useState(null);
  const [colorPicking, setColorPicking] = useState(false);
  const [drawnCard,    setDrawnCard]    = useState(null); // { card, playable }
  const handRef = useRef(null);

  // Listen for 'drew' event from server via parent prop
  // The parent (UnoPage) doesn't forward socket events directly — we need
  // to subscribe via emit pattern. But useSocket 'on' is in the page.
  // UnoPage will forward drew events via a prop or we can subscribe here.
  // Since emit is the socket emit, we cannot subscribe here directly.
  // UnoPage passes chatMessages — for 'drew' we need it forwarded.
  // We'll use a workaround: UnoGame accepts a `drewEvent` prop from the page.
  // BUT the spec says props are {roomState, myId, emit, chatMessages}.
  // Solution: lift the 'drew' subscription into UnoPage and pass it down.
  // For now we handle it via roomState.drewCard if server could send it there,
  // but the server sends it as a separate event.
  // The cleanest approach without changing the prop signature: UnoPage
  // should pass an `onEvent` prop or we embed socket inside UnoGame.
  // Since the spec says just those 4 props, we'll store drew info in sessionStorage
  // and poll, OR we simply re-architect: pass a `drewInfo` prop from UnoPage.
  // We'll add drewInfo as an optional prop — UnoPage will manage it.

  // See UnoPage — we handle `drew` event there and pass drewInfo prop.
  // For now, accept the prop pattern implicitly and use window event.

  useEffect(() => {
    function handleDrew(e) {
      setDrawnCard(e.detail);
    }
    window.addEventListener('uno:drew', handleDrew);
    return () => window.removeEventListener('uno:drew', handleDrew);
  }, []);

  if (!roomState || !roomState.myHand) {
    return <div className="uno-loading">Loading game…</div>;
  }

  const {
    roomCode, myHand, handSizes, playerOrder, playerNames,
    currentPlayer, currentColor, topCard, deckCount,
    direction, drawStack, unoSafe, pendingUno, status, winner,
    log, hostId,
  } = roomState;

  const isMyTurn = currentPlayer === myId;
  const myName   = playerNames?.[myId] || 'You';
  const myCards  = myHand || [];
  const hasOneCard = myCards.length === 1;
  const iSafeUno = unoSafe?.[myId] ?? true;

  // Who is NOT me (other players in order)
  const otherPlayers = playerOrder.filter(id => id !== myId);
  // For display, put me at bottom — order others around the top
  const opponents = playerOrder
    .filter(id => id !== myId)
    .map(id => ({
      id,
      name: playerNames?.[id] || id,
      cardCount: handSizes?.[id] ?? 0,
      isCurrentPlayer: currentPlayer === id,
      pendingUno,
    }));

  function handleCardClick(cardIndex) {
    if (!isMyTurn) return;
    if (drawnCard) return; // waiting for draw decision

    const card = myCards[cardIndex];
    const top  = topCard;
    const playable = canPlayCheck(card, currentColor, top?.value, drawStack);

    if (!playable) return;

    if (card.type === 'wild') {
      setSelectedIdx(cardIndex);
      setColorPicking(true);
    } else {
      setSelectedIdx(null);
      emit('playCard', { roomCode, cardIndex });
    }
  }

  function canPlayCheck(card, color, topVal, stack) {
    if (!card) return false;
    if (stack > 0) {
      if (topVal === 'draw2' && card.value === 'draw2') return true;
      if (topVal === 'draw4' && card.value === 'draw4') return true;
      return false;
    }
    if (card.type === 'wild') return true;
    if (card.color === color) return true;
    if (card.value === topVal) return true;
    return false;
  }

  function handleColorPick(color) {
    setColorPicking(false);
    if (selectedIdx !== null) {
      emit('playCard', { roomCode, cardIndex: selectedIdx, chosenColor: color });
      setSelectedIdx(null);
    }
  }

  function handleDraw() {
    if (!isMyTurn) return;
    if (drawnCard) return;
    emit('drawCard', { roomCode });
  }

  function handleCallUno() {
    emit('callUno', { roomCode });
  }

  function handleCallout(targetId) {
    emit('callout', { roomCode, targetId });
  }

  const ended = status === 'ended';

  return (
    <div className="uno-game">
      {/* ── Opponents ── */}
      <div className="uno-opponents-row">
        {opponents.map(op => (
          <div key={op.id} className="uno-opponent-wrapper">
            <OpponentArea
              playerId={op.id}
              name={op.name}
              cardCount={op.cardCount}
              isCurrentPlayer={op.isCurrentPlayer}
              unoSafe={unoSafe?.[op.id] ?? true}
              pendingUno={pendingUno}
            />
            {/* Callout button if they forgot UNO */}
            {op.cardCount === 1 && !(unoSafe?.[op.id]) && pendingUno === op.id && (
              <button
                className="uno-callout-btn"
                onClick={() => handleCallout(op.id)}
              >
                CALL OUT {op.name}!
              </button>
            )}
          </div>
        ))}
      </div>

      {/* ── Table centre ── */}
      <div className="uno-table-center">
        {/* Direction indicator */}
        <div
          className="uno-direction"
          style={{ transform: `rotate(${direction === 1 ? 0 : 180}deg)` }}
          title={direction === 1 ? 'Clockwise' : 'Counter-clockwise'}
        >
          ↻
        </div>

        {/* Current color indicator */}
        {currentColor && currentColor !== 'wild' && (
          <div
            className="uno-color-indicator"
            style={{ background: COLOR_MAP[currentColor] }}
            title={`Current color: ${currentColor}`}
          />
        )}

        {/* Draw pile */}
        <div className="uno-pile-group">
          <div
            className={`uno-draw-pile ${isMyTurn && !drawnCard ? 'uno-draw-pile--active' : ''}`}
            onClick={handleDraw}
            title="Draw card"
          >
            <div className="uno-pile-card-back">UNO</div>
            <div className="uno-pile-card-back uno-pile-card-back--2">UNO</div>
            <div className="uno-pile-card-back uno-pile-card-back--3">UNO</div>
            <div className="uno-pile-count">{deckCount}</div>
          </div>
          {drawStack > 0 && (
            <div className="uno-draw-stack-badge">+{drawStack}</div>
          )}
        </div>

        {/* Discard pile */}
        <div className="uno-discard-pile">
          {topCard ? (
            <UnoCard card={topCard} className="uno-discard-card" />
          ) : (
            <div className="uno-discard-empty">No card yet</div>
          )}
        </div>

        {/* Turn indicator */}
        <div className="uno-turn-indicator">
          {isMyTurn
            ? <span className="uno-turn-you">Your turn!</span>
            : <span className="uno-turn-other">{playerNames?.[currentPlayer] || '…'}'s turn</span>
          }
        </div>
      </div>

      {/* ── My hand ── */}
      <div className="uno-my-area">
        {/* UNO / Call buttons */}
        <div className="uno-action-row">
          {hasOneCard && (
            <button
              className={`uno-uno-btn ${!iSafeUno ? 'uno-uno-btn--urgent' : ''}`}
              onClick={handleCallUno}
            >
              UNO!
            </button>
          )}
          {myCards.length === 2 && (
            <button className="uno-uno-btn uno-uno-btn--preempt" onClick={handleCallUno}>
              UNO!
            </button>
          )}
          {isMyTurn && drawStack > 0 && (
            <button className="uno-force-draw-btn" onClick={handleDraw}>
              Draw {drawStack} (forced)
            </button>
          )}
          {isMyTurn && drawStack === 0 && !drawnCard && (
            <button className="uno-draw-btn" onClick={handleDraw}>
              Draw Card
            </button>
          )}
        </div>

        {/* Hand */}
        <div className="uno-hand" ref={handRef}>
          {myCards.map((card, i) => {
            const playable = isMyTurn && !drawnCard && canPlayCheck(card, currentColor, topCard?.value, drawStack);
            const dimmed   = isMyTurn && !drawnCard && !playable;
            return (
              <UnoCard
                key={card.id ?? i}
                card={card}
                playable={playable}
                dimmed={!isMyTurn || !!drawnCard ? false : dimmed}
                selected={selectedIdx === i}
                onClick={() => handleCardClick(i)}
                className={`uno-hand-card uno-hand-card-pos-${i}`}
              />
            );
          })}
          {myCards.length === 0 && !ended && (
            <div className="uno-empty-hand">No cards — you won!</div>
          )}
        </div>

        {/* My name + card count */}
        <div className="uno-my-name">
          {myName}
          <span className="uno-my-count">{myCards.length} card{myCards.length !== 1 ? 's' : ''}</span>
          {isMyTurn && <span className="uno-my-turn-label">← YOUR TURN</span>}
        </div>
      </div>

      {/* ── Game log ── */}
      <div className="uno-log">
        {(log || []).slice(-6).reverse().map((entry, i) => (
          <div key={i} className="uno-log-entry" style={{ opacity: 1 - i * 0.13 }}>
            {entry.msg}
          </div>
        ))}
      </div>

      {/* ── Color picker ── */}
      {colorPicking && (
        <ColorPicker
          onPick={handleColorPick}
          onCancel={() => { setColorPicking(false); setSelectedIdx(null); }}
        />
      )}

      {/* ── Drawn card prompt ── */}
      {drawnCard && isMyTurn && (
        <DrawnCardPrompt
          card={drawnCard.card}
          roomCode={roomCode}
          emit={emit}
          onDismiss={() => setDrawnCard(null)}
        />
      )}

      {/* ── End overlay ── */}
      {ended && (
        <EndOverlay roomState={roomState} myId={myId} emit={emit} />
      )}

      {/* ── Chat ── */}
      <ChatPanel
        roomCode={roomCode}
        myName={myName}
        chatMessages={chatMessages}
        emit={emit}
      />
    </div>
  );
}
