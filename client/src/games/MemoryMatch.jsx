import React, { useState, useEffect, useRef } from 'react';
import HighScoreModal from '../components/HighScoreModal';
import { isHighScore, addScore } from '../utils/leaderboard';
import './MemoryMatch.css';

const EMOJIS = ['🎮','🎯','🎲','🎸','🚀','🦊','🍕','🌈','⚡','🎃','🐉','💎','🔥','🌸','🦄','🎭'];

function shuffle(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}

function newBoard() {
  const pairs = EMOJIS.slice(0, 8);
  return shuffle([...pairs, ...pairs]).map((emoji, i) => ({
    id: i, emoji, flipped: false, matched: false,
  }));
}

export default function MemoryMatch() {
  const [cards, setCards] = useState(newBoard);
  const [moves, setMoves] = useState(0);
  const [time, setTime] = useState(0);
  const [started, setStarted] = useState(false);
  const [selected, setSelected] = useState([]);
  const [locked, setLocked] = useState(false);
  const timerRef = useRef(null);

  const matched = cards.filter(c => c.matched).length;
  const won = matched === cards.length;
  const [showHS, setShowHS] = useState(false);
  const [pendingScore, setPendingScore] = useState(null);

  useEffect(() => {
    if (won && moves > 0 && isHighScore('memory_match', moves, false)) {
      setPendingScore(moves); setShowHS(true);
    }
  }, [won]);

  useEffect(() => {
    if (started && !won) {
      timerRef.current = setInterval(() => setTime(t => t + 1), 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [started, won]);

  function handleCard(card) {
    if (locked || card.flipped || card.matched) return;
    if (!started) setStarted(true);
    const next = [...selected, card];
    setCards(cs => cs.map(c => c.id === card.id ? { ...c, flipped: true } : c));
    if (next.length === 1) {
      setSelected(next);
    } else {
      setMoves(m => m + 1);
      setSelected([]);
      if (next[0].emoji === next[1].emoji) {
        setCards(cs => cs.map(c =>
          c.id === next[0].id || c.id === next[1].id ? { ...c, matched: true } : c
        ));
      } else {
        setLocked(true);
        setTimeout(() => {
          setCards(cs => cs.map(c =>
            c.id === next[0].id || c.id === next[1].id ? { ...c, flipped: false } : c
          ));
          setLocked(false);
        }, 900);
      }
    }
  }

  function reset() {
    clearInterval(timerRef.current);
    setCards(newBoard());
    setMoves(0);
    setTime(0);
    setStarted(false);
    setSelected([]);
    setLocked(false);
  }

  const fmt = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div className="memory-wrap">
      <div className="memory-header">
        <div className="memory-stat">Moves: <span>{moves}</span></div>
        <div className="memory-stat">Pairs: <span>{matched / 2}/8</span></div>
        <div className="memory-stat">Time: <span>{fmt(time)}</span></div>
        <button className="memory-btn" style={{padding:'4px 14px',fontSize:'0.85rem',marginTop:0}} onClick={reset}>New Game</button>
      </div>

      <div className="memory-grid">
        {cards.map(card => (
          <div
            key={card.id}
            className={`memory-card${card.flipped || card.matched ? ' flipped' : ''}${card.matched ? ' matched' : ''}`}
            onClick={() => handleCard(card)}
          >
            <div className="memory-card-inner">
              <div className="memory-card-front">?</div>
              <div className="memory-card-back">{card.emoji}</div>
            </div>
          </div>
        ))}
      </div>

      {won && (
        <div className="memory-win">
          <h2>🎉 You Win!</h2>
          <p>{moves} moves in {fmt(time)}</p>
          <button className="memory-btn" onClick={reset}>Play Again</button>
        </div>
      )}
      {showHS && <HighScoreModal gameId="memory_match" score={pendingScore} label="moves" higherIsBetter={false} onSave={name => { addScore('memory_match', pendingScore, name, false); setShowHS(false); }} onDismiss={() => setShowHS(false)} />}
    </div>
  );
}
