import React, { useState } from 'react';
import { BOARD, GROUP_COLORS, TOKEN_COLORS, TOKENS } from '../boardData';
import './Dashboard.css';

export default function Dashboard({ gameState, myId, roomCode, emit }) {
  const [showPropertyModal, setShowPropertyModal] = useState(null); // propertyId
  const myPlayer = gameState.players.find(p => p.id === myId);
  const allPlayers = gameState.players;

  if (!myPlayer) return null;

  function handleMortgage(propId) {
    const ps = gameState.propertyStates[propId];
    if (ps.mortgaged) {
      emit('unmortgage', { roomCode, propertyId: propId });
    } else {
      emit('mortgage', { roomCode, propertyId: propId });
    }
  }

  function handleBuildHouse(propId) {
    emit('buyBuilding', { roomCode, propertyId: propId, count: 1 });
  }

  function handleSellHouse(propId) {
    emit('sellBuilding', { roomCode, propertyId: propId, count: 1 });
  }

  const myProperties = myPlayer.properties.map(id => {
    const space = BOARD[id];
    const ps = gameState.propertyStates[id];
    return { space, ps };
  });

  // Group properties by color
  const grouped = {};
  myProperties.forEach(({ space, ps }) => {
    const key = space.group || space.type;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push({ space, ps });
  });

  return (
    <div className="dashboard">
      <div className="my-info">
        <span className="my-token" style={{ color: TOKEN_COLORS[myPlayer.token] }}>
          {TOKENS[myPlayer.token]}
        </span>
        <div className="my-details">
          <span className="my-name">{myPlayer.name}</span>
          {myPlayer.jailTurns > 0 && <span className="jail-tag">In Jail</span>}
          {myPlayer.getOutOfJailCards > 0 && (
            <span className="goj-tag">🃏 ×{myPlayer.getOutOfJailCards}</span>
          )}
        </div>
        <span className="my-cash">${myPlayer.cash.toLocaleString()}</span>
      </div>

      {/* Other players summary */}
      <div className="other-players">
        {allPlayers.filter(p => p.id !== myId).map(p => (
          <div key={p.id} className={`other-player ${p.bankrupt ? 'bankrupt' : ''}`}
               style={{ borderLeftColor: TOKEN_COLORS[p.token] }}>
            <span className="op-token" style={{ color: TOKEN_COLORS[p.token] }}>{TOKENS[p.token]}</span>
            <span className="op-name">{p.name}</span>
            <span className="op-cash">${p.cash.toLocaleString()}</span>
            <span className="op-props">{p.properties.length} props</span>
            {p.bankrupt && <span className="bankrupt-tag">💀</span>}
          </div>
        ))}
      </div>

      {/* My Properties */}
      <div className="my-properties">
        <h3>My Properties</h3>
        {myProperties.length === 0 && <p className="no-props">No properties yet</p>}
        {Object.entries(grouped).map(([key, props]) => (
          <div key={key} className="prop-group">
            {props.map(({ space, ps }) => (
              <PropertyCard
                key={space.id}
                space={space}
                ps={ps}
                onMortgage={() => handleMortgage(space.id)}
                onBuild={() => handleBuildHouse(space.id)}
                onSell={() => handleSellHouse(space.id)}
                gameState={gameState}
                myId={myId}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function PropertyCard({ space, ps, onMortgage, onBuild, onSell, gameState, myId }) {
  const color = space.group ? GROUP_COLORS[space.group] : '#999';
  const houseCost = space.houseCost || 0;
  const myPlayer = gameState.players.find(p => p.id === myId);
  const houseCount = ps?.houses || 0;

  // Check if buildable
  const COLOR_GROUPS = {
    brown:[1,3],light_blue:[6,8,9],pink:[11,13,14],orange:[16,18,19],
    red:[21,23,24],yellow:[26,27,29],green:[31,32,34],dark_blue:[37,39]
  };
  const group = space.group;
  const hasMonopoly = group && COLOR_GROUPS[group]?.every(id => {
    const s = gameState.propertyStates[id];
    return s?.owner === myId && !s?.mortgaged;
  });

  const canBuild = hasMonopoly && !ps?.mortgaged && houseCount < 5 && myPlayer.cash >= houseCost;
  const canSell = !ps?.mortgaged && houseCount > 0;
  const canMortgage = !ps?.mortgaged && houseCount === 0;
  const canUnmortgage = ps?.mortgaged && myPlayer.cash >= Math.floor((space.mortgageValue || 0) * 1.1);

  return (
    <div className={`prop-card ${ps?.mortgaged ? 'mortgaged' : ''}`}>
      <div className="prop-card-bar" style={{ background: color }} />
      <div className="prop-card-body">
        <div className="prop-card-name">{space.name}</div>
        <div className="prop-card-meta">
          {space.price && <span>${space.price}</span>}
          {houseCount > 0 && (
            <span className="prop-houses">
              {houseCount === 5 ? '🏨' : '🏠'.repeat(houseCount)}
            </span>
          )}
          {ps?.mortgaged && <span className="mort-tag">MORTGAGED</span>}
        </div>
        <div className="prop-card-actions">
          {space.type === 'property' && canBuild && (
            <button className="prop-btn build" onClick={onBuild} title={`Build ($${houseCost})`}>+🏠</button>
          )}
          {space.type === 'property' && canSell && (
            <button className="prop-btn sell" onClick={onSell} title={`Sell ($${Math.floor(houseCost/2)})`}>-🏠</button>
          )}
          {canMortgage && (
            <button className="prop-btn mortgage" onClick={onMortgage} title={`Mortgage ($${space.mortgageValue})`}>M</button>
          )}
          {canUnmortgage && (
            <button className="prop-btn unmortgage" onClick={onMortgage} title={`Unmortgage ($${Math.floor((space.mortgageValue||0)*1.1)})`}>UM</button>
          )}
        </div>
      </div>
    </div>
  );
}
