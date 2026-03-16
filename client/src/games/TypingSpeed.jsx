import React, { useState, useEffect, useRef } from 'react';
import HighScoreModal from '../components/HighScoreModal';
import { isHighScore } from '../utils/leaderboard';
import './TypingSpeed.css';

const PASSAGES = [
  "The quick brown fox jumps over the lazy dog near the riverbank where golden leaves drift gently in the autumn breeze.",
  "Space exploration has always captured the imagination of humanity pushing the boundaries of what is possible and inspiring generations of scientists and dreamers.",
  "A good book is like a portal to another world where the reader can experience adventures emotions and ideas far beyond their everyday life.",
  "Technology continues to reshape the way we communicate work and entertain ourselves bringing both incredible opportunities and new challenges to society.",
  "The mountains stood tall and silent covered in a blanket of white snow their peaks disappearing into the cloudy winter sky above the valley.",
  "Music has the remarkable ability to transport people across time and place evoking memories and emotions that words alone cannot always express.",
  "Every great journey begins with a single step and the courage to move forward even when the destination is not yet clearly visible on the horizon.",
  "The ocean waves crashed rhythmically against the rocky shore sending white sea foam spraying into the salty morning air as seagulls circled overhead.",
];

function pick() {
  return PASSAGES[Math.floor(Math.random() * PASSAGES.length)];
}

export default function TypingSpeed() {
  const [passage, setPassage] = useState(pick);
  const [typed, setTyped] = useState('');
  const [started, setStarted] = useState(false);
  const [startTime, setStartTime] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [done, setDone] = useState(false);
  const [showHS, setShowHS] = useState(false);
  const [pendingWpm, setPendingWpm] = useState(null);
  const inputRef = useRef(null);
  const timerRef = useRef(null);

  const words = passage.split(' ').length;

  useEffect(() => {
    if (started && !done) {
      timerRef.current = setInterval(() => {
        setElapsed(Date.now() - startTime);
      }, 100);
    }
    return () => clearInterval(timerRef.current);
  }, [started, done, startTime]);

  function handleChange(e) {
    const val = e.target.value;
    if (!started && val.length > 0) {
      setStarted(true);
      setStartTime(Date.now());
    }
    if (val.length > passage.length) return;
    setTyped(val);
    if (val === passage) {
      clearInterval(timerRef.current);
      const finalElapsed = Date.now() - startTime;
      setDone(true);
      setElapsed(finalElapsed);
      const finalWpm = Math.round((val.split(' ').length / (finalElapsed / 1000)) * 60);
      if (finalWpm > 0) isHighScore('typing_speed', finalWpm).then(yes => { if (yes) { setPendingWpm(finalWpm); setShowHS(true); } });
    }
  }

  function reset() {
    clearInterval(timerRef.current);
    setPassage(pick());
    setTyped('');
    setStarted(false);
    setStartTime(null);
    setElapsed(0);
    setDone(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  const elapsedSec = elapsed / 1000;
  const wpm = elapsedSec > 0 ? Math.round((typed.split(' ').length / elapsedSec) * 60) : 0;
  const correctChars = typed.split('').filter((c, i) => c === passage[i]).length;
  const accuracy = typed.length > 0 ? Math.round((correctChars / typed.length) * 100) : 100;

  return (
    <div className="typing-wrap">
      <div className="typing-stats">
        <div className="typing-stat">
          <div className="typing-stat-val">{done ? wpm : (started ? wpm : '—')}</div>
          <div className="typing-stat-label">WPM</div>
        </div>
        <div className="typing-stat">
          <div className="typing-stat-val">{accuracy}%</div>
          <div className="typing-stat-label">Accuracy</div>
        </div>
        <div className="typing-stat">
          <div className="typing-stat-val">{Math.round(elapsedSec)}s</div>
          <div className="typing-stat-label">Time</div>
        </div>
        <div className="typing-stat">
          <div className="typing-stat-val">{typed.length}/{passage.length}</div>
          <div className="typing-stat-label">Chars</div>
        </div>
      </div>

      <div className="typing-text-box">
        {passage.split('').map((char, i) => {
          let cls = 'typing-char';
          if (i < typed.length) cls += typed[i] === char ? ' correct' : ' wrong';
          if (i === typed.length) cls += ' cursor';
          return <span key={i} className={cls}>{char}</span>;
        })}
      </div>

      <input
        ref={inputRef}
        className="typing-input"
        value={typed}
        onChange={handleChange}
        disabled={done}
        placeholder="Start typing here..."
        autoFocus
        autoComplete="off"
        spellCheck="false"
      />

      {done && (
        <div className="typing-done">
          <h2>✅ Done! {wpm} WPM at {accuracy}% accuracy</h2>
        </div>
      )}

      <div className="typing-actions">
        <button className="typing-btn secondary" onClick={reset}>New Text</button>
      </div>
      {showHS && <HighScoreModal gameId="typing_speed" score={pendingWpm} label="WPM" onSave={() => setShowHS(false)} onDismiss={() => setShowHS(false)} />}
    </div>
  );
}
