import React, { useState, useEffect } from 'react';
import './Dice.css';

const DOT_POSITIONS = {
  1: [[50, 50]],
  2: [[25, 25], [75, 75]],
  3: [[25, 25], [50, 50], [75, 75]],
  4: [[25, 25], [75, 25], [25, 75], [75, 75]],
  5: [[25, 25], [75, 25], [50, 50], [25, 75], [75, 75]],
  6: [[25, 25], [75, 25], [25, 50], [75, 50], [25, 75], [75, 75]],
};

function DieFace({ value, rolling }) {
  const dots = DOT_POSITIONS[value] || [];
  return (
    <div className={`die-face ${rolling ? 'rolling' : ''}`}>
      {dots.map(([cx, cy], i) => (
        <div
          key={i}
          className="dot"
          style={{ left: `${cx}%`, top: `${cy}%` }}
        />
      ))}
    </div>
  );
}

export default function Dice({ dice, rolling }) {
  const [displayDice, setDisplayDice] = useState(dice || [1, 1]);
  const [isRolling, setIsRolling] = useState(false);

  useEffect(() => {
    if (rolling) {
      setIsRolling(true);
      // Animate random values during roll
      let count = 0;
      const interval = setInterval(() => {
        setDisplayDice([
          Math.ceil(Math.random() * 6),
          Math.ceil(Math.random() * 6),
        ]);
        count++;
        if (count > 8) {
          clearInterval(interval);
          setDisplayDice(dice);
          setIsRolling(false);
        }
      }, 80);
      return () => clearInterval(interval);
    } else if (dice) {
      setDisplayDice(dice);
    }
  }, [rolling, dice]);

  if (!displayDice) return null;

  const doubles = displayDice[0] === displayDice[1];

  return (
    <div className="dice-container">
      <div className="dice-pair">
        <DieFace value={displayDice[0]} rolling={isRolling} />
        <DieFace value={displayDice[1]} rolling={isRolling} />
      </div>
      {!isRolling && dice && (
        <div className="dice-total">
          {displayDice[0] + displayDice[1]}
          {doubles && <span className="doubles-badge">Doubles!</span>}
        </div>
      )}
    </div>
  );
}
