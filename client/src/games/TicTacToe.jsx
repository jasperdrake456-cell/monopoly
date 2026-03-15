import React, { useState } from 'react';
import './TicTacToe.css';

const WINS = [
  [0,1,2],[3,4,5],[6,7,8],
  [0,3,6],[1,4,7],[2,5,8],
  [0,4,8],[2,4,6],
];

function checkWinner(board) {
  for (const [a, b, c] of WINS) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], line: [a, b, c] };
    }
  }
  return null;
}

export default function TicTacToe() {
  const [board, setBoard] = useState(Array(9).fill(null));
  const [xTurn, setXTurn] = useState(true);
  const [scores, setScores] = useState({ X: 0, O: 0, draw: 0 });

  const result = checkWinner(board);
  const isDraw = !result && board.every(Boolean);

  function handleClick(i) {
    if (board[i] || result || isDraw) return;
    const next = [...board];
    next[i] = xTurn ? 'X' : 'O';
    const newResult = checkWinner(next);
    const newDraw = !newResult && next.every(Boolean);
    if (newResult) setScores(s => ({ ...s, [newResult.winner]: s[newResult.winner] + 1 }));
    if (newDraw) setScores(s => ({ ...s, draw: s.draw + 1 }));
    setBoard(next);
    setXTurn(!xTurn);
  }

  function reset() {
    setBoard(Array(9).fill(null));
    setXTurn(true);
  }

  const winLine = result?.line || [];

  let statusText;
  if (result) statusText = <span>Player <span className={result.winner.toLowerCase()}>{result.winner}</span> wins! 🎉</span>;
  else if (isDraw) statusText = "It's a draw! 🤝";
  else statusText = <span>Player <span className={xTurn ? 'x' : 'o'}>{xTurn ? 'X' : 'O'}</span>'s turn</span>;

  return (
    <div className="ttt-wrap">
      <div className="ttt-status">{statusText}</div>

      <div className="ttt-board">
        {board.map((cell, i) => (
          <div
            key={i}
            className={`ttt-cell${cell ? ' taken' : ''}${winLine.includes(i) ? ' win-cell' : ''}`}
            onClick={() => handleClick(i)}
          >
            {cell && <span className={cell.toLowerCase()}>{cell}</span>}
          </div>
        ))}
      </div>

      <div className="ttt-footer">
        <div className="ttt-scores">
          <div>X: <span className="val">{scores.X}</span></div>
          <div>Draw: <span className="val">{scores.draw}</span></div>
          <div>O: <span className="val">{scores.O}</span></div>
        </div>
        <button className="ttt-btn" onClick={reset}>New Round</button>
      </div>
    </div>
  );
}
