import React, { useState } from 'react';
import './BattleshipGame.css';

const SHIP_DEFS = [
  { name: 'Carrier',    length: 5 },
  { name: 'Battleship', length: 4 },
  { name: 'Cruiser',    length: 3 },
  { name: 'Submarine',  length: 3 },
  { name: 'Destroyer',  length: 2 },
];

const COLS = 10, ROWS = 10;

export default function BattleshipGame({ roomState, myId, emit, onBack }) {
  const { roomCode, players, phase, currentTurn, winner, myGrid, oppGrid, myShipsSunk, oppShipsSunk, shipDefs = SHIP_DEFS } = roomState;

  const isHost = players?.[0]?.id === myId;
  const me     = players?.find(p => p.id === myId);
  const opp    = players?.find(p => p.id !== myId);
  const isEnded = roomState.status === 'ended' || phase === 'ended';
  const iWon = winner === myId;
  const isMyTurn = currentTurn === myId;

  // Placement state
  const [placedShips, setPlacedShips] = useState([]);
  const [hoveredCells, setHoveredCells] = useState([]);
  const [currentShipIdx, setCurrentShipIdx] = useState(0);
  const [horizontal, setHorizontal] = useState(true);

  const myReady  = roomState.myReady;
  const oppReady = roomState.oppReady;

  function getShipCells(r, c, length, horiz) {
    const cells = [];
    for (let i = 0; i < length; i++) {
      cells.push(horiz ? [r, c + i] : [r + i, c]);
    }
    return cells;
  }

  function isValidPlacement(r, c, length, horiz) {
    const cells = getShipCells(r, c, length, horiz);
    if (cells.some(([rr, cc]) => rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS)) return false;
    return !cells.some(([rr, cc]) => placedShips.some(s =>
      getShipCells(s.r, s.c, s.length, s.horizontal).some(([sr, sc]) => sr === rr && sc === cc)
    ));
  }

  function handlePlacementHover(r, c) {
    if (currentShipIdx >= shipDefs.length) return;
    const len = shipDefs[currentShipIdx].length;
    if (isValidPlacement(r, c, len, horizontal)) {
      setHoveredCells(getShipCells(r, c, len, horizontal));
    } else {
      setHoveredCells([]);
    }
  }

  function handlePlacementClick(r, c) {
    if (currentShipIdx >= shipDefs.length || myReady) return;
    const len = shipDefs[currentShipIdx].length;
    if (!isValidPlacement(r, c, len, horizontal)) return;
    const newShips = [...placedShips, { r, c, length: len, horizontal }];
    setPlacedShips(newShips);
    setHoveredCells([]);
    if (currentShipIdx + 1 >= shipDefs.length) {
      // All ships placed — send to server
      emit('placeShips', { roomCode, ships: newShips });
      setCurrentShipIdx(shipDefs.length);
    } else {
      setCurrentShipIdx(currentShipIdx + 1);
    }
  }

  function handleRotate() {
    setHorizontal(h => !h);
    setHoveredCells([]);
  }

  function handleReset() {
    setPlacedShips([]);
    setCurrentShipIdx(0);
    setHoveredCells([]);
  }

  function handleAttack(r, c) {
    if (!isMyTurn || isEnded) return;
    emit('attack', { roomCode, r, c });
  }

  // --- Render ---

  if (phase === 'placement' || !myGrid) {
    return (
      <div className="bs-page">
        <div className="bs-topbar">
          <button className="bs-back" onClick={onBack}>← Game Vault</button>
          <div className="bs-title">Battleship</div>
        </div>
        <div className="bs-placement">
          <div className="bs-placement-header">
            <div className="bs-placement-title">Place your ships</div>
            {myReady ? (
              <div className="bs-ready-msg">✓ Ships placed — waiting for opponent…</div>
            ) : (
              <div className="bs-placement-controls">
                <button className="bs-rotate-btn" onClick={handleRotate}>
                  Rotate ({horizontal ? 'H' : 'V'}) [R]
                </button>
                <button className="bs-reset-btn" onClick={handleReset}>Reset</button>
              </div>
            )}
          </div>
          <div className="bs-ship-list">
            {shipDefs.map((s, i) => (
              <div key={i} className={`bs-ship-item ${i === currentShipIdx ? 'bs-ship-item--active' : ''} ${i < currentShipIdx ? 'bs-ship-item--done' : ''}`}>
                {i < currentShipIdx ? '✓' : ''} {s.name} ({s.length})
              </div>
            ))}
          </div>
          {!myReady && (
            <PlacementGrid
              placedShips={placedShips}
              hoveredCells={hoveredCells}
              onHover={handlePlacementHover}
              onClick={handlePlacementClick}
              shipDefs={shipDefs}
              onKeyRotate={handleRotate}
            />
          )}
        </div>
      </div>
    );
  }

  // Battle phase
  return (
    <div className="bs-page">
      <div className="bs-topbar">
        <button className="bs-back" onClick={onBack}>← Game Vault</button>
        <div className="bs-title">Battleship</div>
        <div className="bs-vs">
          {me?.name} vs {opp?.name || '…'}
        </div>
      </div>

      {isEnded && (
        <div className={`bs-result ${iWon ? 'bs-result--win' : 'bs-result--lose'}`}>
          {iWon ? '🎉 You Win!' : `${opp?.name} Wins!`}
          {isHost && (
            <button className="bs-replay-btn" onClick={() => emit('restartGame', { roomCode })}>Play Again</button>
          )}
        </div>
      )}
      {!isEnded && (
        <div className="bs-turn">
          {isMyTurn ? '🎯 Your turn — click enemy waters' : `${opp?.name}'s turn…`}
        </div>
      )}

      <div className="bs-grids">
        <div className="bs-grid-section">
          <div className="bs-grid-label">My Fleet {myShipsSunk?.filter(Boolean).length}/{shipDefs.length} sunk</div>
          <BattleGrid grid={myGrid} showShips onCellClick={null} />
        </div>
        <div className="bs-grid-section">
          <div className="bs-grid-label">Enemy Waters</div>
          <BattleGrid grid={oppGrid} showShips={false} onCellClick={isMyTurn && !isEnded ? handleAttack : null} />
        </div>
      </div>

      <div className="bs-ship-status">
        <div className="bs-ship-status-col">
          <div className="bs-ssh-label">My Ships</div>
          {shipDefs.map((s, i) => (
            <div key={i} className={`bs-ssh-row ${myShipsSunk?.[i] ? 'bs-ssh-row--sunk' : ''}`}>
              {myShipsSunk?.[i] ? '✕' : '▣'} {s.name}
            </div>
          ))}
        </div>
        <div className="bs-ship-status-col">
          <div className="bs-ssh-label">Enemy Ships</div>
          {shipDefs.map((s, i) => (
            <div key={i} className={`bs-ssh-row ${oppShipsSunk?.[i] ? 'bs-ssh-row--sunk' : ''}`}>
              {oppShipsSunk?.[i] ? '✕' : '▣'} {s.name}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PlacementGrid({ placedShips, hoveredCells, onHover, onClick, shipDefs, onKeyRotate }) {
  const placedCells = new Set();
  placedShips.forEach((s, si) => {
    for (let i = 0; i < s.length; i++) {
      const r = s.horizontal ? s.r : s.r + i;
      const c = s.horizontal ? s.c + i : s.c;
      placedCells.add(`${r},${c}`);
    }
  });
  const hovered = new Set(hoveredCells.map(([r, c]) => `${r},${c}`));

  return (
    <div className="bs-pgrid" onKeyDown={e => e.key === 'r' && onKeyRotate()} tabIndex={0}>
      <div className="bs-pgrid-board">
        {Array.from({ length: ROWS }, (_, r) =>
          Array.from({ length: COLS }, (_, c) => {
            const key = `${r},${c}`;
            const isPlaced  = placedCells.has(key);
            const isHovered = hovered.has(key);
            return (
              <div key={key}
                className={`bs-pg-cell ${isPlaced ? 'bs-pg-cell--ship' : ''} ${isHovered ? 'bs-pg-cell--hover' : ''}`}
                onMouseEnter={() => onHover(r, c)}
                onMouseLeave={() => onHover(-1, -1)}
                onClick={() => onClick(r, c)}
              />
            );
          })
        )}
      </div>
    </div>
  );
}

function BattleGrid({ grid, showShips, onCellClick }) {
  if (!grid) return null;
  return (
    <div className="bs-bgrid">
      {grid.map((row, r) => row.map((cell, c) => {
        const isHit  = cell?.hit === 'hit';
        const isMiss = cell?.hit === 'miss';
        const hasShip = showShips && cell?.ship !== null;

        return (
          <div key={`${r}-${c}`}
            className={[
              'bs-bg-cell',
              hasShip ? 'bs-bg-cell--ship' : '',
              isHit   ? 'bs-bg-cell--hit' : '',
              isMiss  ? 'bs-bg-cell--miss' : '',
              onCellClick && !cell?.hit ? 'bs-bg-cell--clickable' : '',
            ].join(' ')}
            onClick={() => onCellClick && !cell?.hit && onCellClick(r, c)}>
            {isHit  && <span className="bs-hit-icon">💥</span>}
            {isMiss && <span className="bs-miss-icon">•</span>}
          </div>
        );
      }))}
    </div>
  );
}
