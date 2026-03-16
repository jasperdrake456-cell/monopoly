import React, { useState, useEffect, useRef } from 'react';
import { addBalance } from '../utils/casinoBalance';
import './CheckersGame.css';

export default function CheckersGame({ roomState, myId, emit, onBack }) {
  const { roomCode, players, board, currentTurn, winner, mustJumpFrom, hostId, status } = roomState;
  const [selected, setSelected] = useState(null);

  const isHost  = players?.[0]?.id === myId;
  const myColor = isHost ? 'R' : 'B';
  const isMyTurn = currentTurn === myColor && status === 'playing';

  const me  = players?.find(p => p.id === myId);
  const opp = players?.find(p => p.id !== myId);

  const iWon = winner === myColor;
  const isEnded = status === 'ended';
  const winPaidRef = useRef(false);
  useEffect(() => {
    if (iWon && isEnded && !winPaidRef.current) {
      winPaidRef.current = true;
      addBalance(20);
    }
  }, [iWon, isEnded]);

  function getValidMoves(r, c) {
    // Determine if any jumps exist for my color
    const piece = board[r]?.[c];
    if (!piece || piece.color !== myColor) return [];

    const dirs = piece.king
      ? [[-1,-1],[-1,1],[1,-1],[1,1]]
      : myColor === 'R' ? [[1,-1],[1,1]] : [[-1,-1],[-1,1]];

    // Check if any jump exists for any of my pieces
    const anyJump = board.some((row, rr) => row.some((p, cc) => {
      if (!p || p.color !== myColor) return false;
      const pdirs = p.king ? [[-1,-1],[-1,1],[1,-1],[1,1]] : myColor === 'R' ? [[1,-1],[1,1]] : [[-1,-1],[-1,1]];
      return pdirs.some(([dr, dc]) => {
        const mr = rr+dr, mc = cc+dc, lr = rr+dr*2, lc = cc+dc*2;
        if (lr < 0 || lr >= 8 || lc < 0 || lc >= 8) return false;
        return board[mr]?.[mc]?.color === (myColor === 'R' ? 'B' : 'R') && !board[lr]?.[lc];
      });
    }));

    // If mustJumpFrom, only allow moves from that square
    if (mustJumpFrom && (mustJumpFrom[0] !== r || mustJumpFrom[1] !== c)) return [];

    const moves = [];

    if (anyJump || mustJumpFrom) {
      // Only return jump moves
      dirs.forEach(([dr, dc]) => {
        const mr = r+dr, mc = c+dc, lr = r+dr*2, lc = c+dc*2;
        if (lr < 0 || lr >= 8 || lc < 0 || lc >= 8) return;
        if (board[mr]?.[mc]?.color === (myColor === 'R' ? 'B' : 'R') && !board[lr]?.[lc]) {
          moves.push([lr, lc]);
        }
      });
    } else {
      dirs.forEach(([dr, dc]) => {
        const nr = r+dr, nc = c+dc;
        if (nr < 0 || nr >= 8 || nc < 0 || nc >= 8 || board[nr]?.[nc]) return;
        moves.push([nr, nc]);
      });
    }

    return moves;
  }

  function handleClick(r, c) {
    if (!isMyTurn || isEnded) return;
    const piece = board[r]?.[c];

    if (selected) {
      const [sr, sc] = selected;
      const validMoves = getValidMoves(sr, sc);
      const isValid = validMoves.some(([mr, mc]) => mr === r && mc === c);

      if (isValid) {
        emit('makeMove', { roomCode, from: [sr, sc], to: [r, c] });
        setSelected(null);
        return;
      }

      // Select different piece
      if (piece && piece.color === myColor) {
        if (mustJumpFrom && (mustJumpFrom[0] !== r || mustJumpFrom[1] !== c)) return;
        setSelected([r, c]);
        return;
      }
      setSelected(null);
    } else {
      if (!piece || piece.color !== myColor) return;
      if (mustJumpFrom && (mustJumpFrom[0] !== r || mustJumpFrom[1] !== c)) return;
      setSelected([r, c]);
    }
  }

  const validMoves = selected ? getValidMoves(selected[0], selected[1]) : [];

  // Determine board orientation: Red plays bottom (rows 5-7 start), Black plays top flipped
  // Always show from current player's perspective
  const flip = myColor === 'B';

  function displayRow(r) { return flip ? 7 - r : r; }
  function displayCol(c) { return flip ? 7 - c : c; }

  return (
    <div className="ck-page">
      <div className="ck-topbar">
        <button className="ck-back" onClick={onBack}>← Game Vault</button>
        <div className="ck-title">Checkers</div>
        <div className="ck-players">
          <span style={{ color: '#e74c3c' }}>🔴 {players?.[0]?.name}{players?.[0]?.id === myId ? ' (you)' : ''}</span>
          <span className="ck-vs">vs</span>
          <span style={{ color: '#888' }}>⚫ {players?.[1]?.name || '…'}{players?.[1]?.id === myId ? ' (you)' : ''}</span>
        </div>
      </div>

      {isEnded && (
        <div className={`ck-result ${iWon ? 'ck-result--win' : 'ck-result--lose'}`}>
          {iWon ? '🎉 You Win!' : `${opp?.name} Wins!`}
          {isHost && (
            <button className="ck-replay-btn" onClick={() => emit('restartGame', { roomCode })}>Play Again</button>
          )}
        </div>
      )}
      {!isEnded && (
        <div className="ck-turn">
          {isMyTurn
            ? (mustJumpFrom ? 'Must continue jump!' : 'Your turn')
            : `${opp?.name}'s turn…`}
        </div>
      )}

      <div className="ck-board">
        {Array.from({ length: 8 }, (_, row) => {
          const r = displayRow(row);
          return Array.from({ length: 8 }, (_, col) => {
            const c = displayCol(col);
            const isDark = (r + c) % 2 === 1;
            const piece = board[r]?.[c];
            const isSel = selected?.[0] === r && selected?.[1] === c;
            const isValidMove = validMoves.some(([mr, mc]) => mr === r && mc === c);
            const isForced = mustJumpFrom?.[0] === r && mustJumpFrom?.[1] === c;

            return (
              <div key={`${r}-${c}`}
                className={[
                  'ck-sq',
                  isDark ? 'ck-sq--dark' : 'ck-sq--light',
                  isSel ? 'ck-sq--selected' : '',
                  isValidMove ? 'ck-sq--valid' : '',
                ].join(' ')}
                onClick={() => handleClick(r, c)}>
                {isValidMove && <div className="ck-move-dot" />}
                {piece && (
                  <div className={[
                    'ck-piece',
                    piece.color === 'R' ? 'ck-piece--red' : 'ck-piece--black',
                    isForced ? 'ck-piece--forced' : '',
                  ].join(' ')}>
                    {piece.king && <span className="ck-king-crown">♛</span>}
                  </div>
                )}
              </div>
            );
          });
        })}
      </div>
    </div>
  );
}
