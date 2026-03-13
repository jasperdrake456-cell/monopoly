import React, { useMemo } from 'react';
import Tile from './Tile';
import { BOARD, TOKEN_COLORS, TOKENS, getGridPos } from '../boardData';
import './Board.css';

export default function Board({ gameState, myId }) {
  const { players, propertyStates, currentPlayerIndex, freeParking, freeParkingEnabled } = gameState;
  const currentPlayer = players[currentPlayerIndex];

  const playersByPosition = useMemo(() => {
    const map = {};
    players.forEach(p => {
      if (!p.bankrupt) {
        if (!map[p.position]) map[p.position] = [];
        map[p.position].push(p);
      }
    });
    return map;
  }, [players]);

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
        {BOARD.map(space => {
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
