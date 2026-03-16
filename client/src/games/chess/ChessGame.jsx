import React, { useState, useEffect, useRef } from 'react';
import { Chess } from 'chess.js';
import { addBalance } from '../../utils/casinoBalance';
import './ChessGame.css';

const PIECE_UNICODE = {
  wK: '♔', wQ: '♕', wR: '♖', wB: '♗', wN: '♘', wP: '♙',
  bK: '♚', bQ: '♛', bR: '♜', bB: '♝', bN: '♞', bP: '♟',
};

function fenToBoard(fen) {
  const chess = new Chess(fen);
  const board = chess.board();
  return board;
}

function squareName(row, col, flipped) {
  const r = flipped ? row : 7 - row;
  const c = flipped ? 7 - col : col;
  return String.fromCharCode(97 + c) + String(r + 1);
}

export default function ChessGame({ roomState, myId, emit, onBack }) {
  const { roomCode, players, fen, turn, inCheck, isCheckmate, isStalemate, isDraw, isGameOver, winner, lastMove } = roomState;

  const isHost   = players?.[0]?.id === myId;
  const myColor  = isHost ? 'w' : 'b';
  const flipped  = !isHost; // Black sees board flipped

  const [selected, setSelected] = useState(null);
  const [legalMoves, setLegalMoves] = useState([]);
  const [promotionPending, setPromotionPending] = useState(null);
  const winPaidRef = useRef(false);

  // Re-parse legal moves when a piece is selected
  useEffect(() => {
    setSelected(null);
    setLegalMoves([]);
  }, [fen]);

  // Pay $20 win reward exactly once
  const iWon = isGameOver && winner && ((winner === 'w' && isHost) || (winner === 'b' && !isHost));
  useEffect(() => {
    if (iWon && !winPaidRef.current) {
      winPaidRef.current = true;
      addBalance(20);
    }
  }, [iWon]);

  if (!fen) return <div className="chess-loading">Loading…</div>;

  const chess = new Chess(fen);
  const board = chess.board();
  const isMyTurn = turn === myColor && !isGameOver;

  function handleSquareClick(sq) {
    if (!isMyTurn) return;

    if (selected) {
      // Try to move
      const isLegal = legalMoves.some(m => m.to === sq);
      if (isLegal) {
        // Check for promotion
        const piece = chess.get(selected);
        if (piece?.type === 'p' && ((myColor === 'w' && sq[1] === '8') || (myColor === 'b' && sq[1] === '1'))) {
          setPromotionPending({ from: selected, to: sq });
          return;
        }
        emit('makeMove', { roomCode, from: selected, to: sq });
        setSelected(null);
        setLegalMoves([]);
        return;
      }
      // Select a different own piece
      const piece = chess.get(sq);
      if (piece && piece.color === myColor) {
        selectSquare(sq);
        return;
      }
      setSelected(null);
      setLegalMoves([]);
    } else {
      const piece = chess.get(sq);
      if (piece && piece.color === myColor) selectSquare(sq);
    }
  }

  function selectSquare(sq) {
    setSelected(sq);
    const moves = chess.moves({ square: sq, verbose: true });
    setLegalMoves(moves);
  }

  function handlePromotion(promo) {
    emit('makeMove', { roomCode, from: promotionPending.from, to: promotionPending.to, promotion: promo });
    setPromotionPending(null);
    setSelected(null);
    setLegalMoves([]);
  }

  function getStatus() {
    if (isCheckmate) {
      const winnerName = winner === 'w' ? players[0]?.name : players[1]?.name;
      return `Checkmate — ${winnerName} wins!`;
    }
    if (isStalemate) return 'Stalemate — Draw';
    if (isDraw) return 'Draw';
    if (inCheck) return `${turn === 'w' ? 'White' : 'Black'} is in check`;
    return null;
  }

  const status = getStatus();
  const isEnded = isGameOver || roomState.status === 'ended';

  // Render board
  const rows = Array.from({ length: 8 }, (_, i) => i);
  const cols = Array.from({ length: 8 }, (_, i) => i);

  return (
    <div className="chess-page">
      <div className="chess-topbar">
        <button className="chess-back" onClick={onBack}>← Game Vault</button>
        <div className="chess-title">Chess</div>
        <div className="chess-players">
          <span>♔ {players?.[0]?.name}{players?.[0]?.id === myId ? ' (you)' : ''}</span>
          <span className="chess-vs">vs</span>
          <span>♚ {players?.[1]?.name}{players?.[1]?.id === myId ? ' (you)' : ''}</span>
        </div>
      </div>

      {status && (
        <div className={`chess-status ${isEnded ? (iWon ? 'chess-status--win' : 'chess-status--lose') : 'chess-status--info'}`}>
          {status}
          {isEnded && isHost && (
            <button className="chess-replay-btn" onClick={() => emit('restartGame', { roomCode })}>Play Again</button>
          )}
        </div>
      )}

      {!isEnded && (
        <div className="chess-turn">
          {isMyTurn ? 'Your turn' : `${myColor === 'w' ? players[1]?.name : players[0]?.name}'s turn…`}
        </div>
      )}

      <div className={`chess-board-wrap ${flipped ? 'chess-board--flipped-labels' : ''}`}>
        {/* Rank labels */}
        <div className="chess-ranks">
          {rows.map(r => (
            <div key={r} className="chess-rank-label">
              {flipped ? r + 1 : 8 - r}
            </div>
          ))}
        </div>
        <div className="chess-board">
          {rows.map(r => cols.map(c => {
            const sq = squareName(r, c, flipped);
            const piece = chess.get(sq);
            const isDark = (r + c) % 2 === 1;
            const isSelected = selected === sq;
            const isLegal = legalMoves.some(m => m.to === sq);
            const isLastMoveFrom = lastMove?.from === sq;
            const isLastMoveTo   = lastMove?.to === sq;
            const isCheckSq = inCheck && piece?.type === 'k' && piece?.color === turn;

            return (
              <div key={sq}
                className={[
                  'chess-sq',
                  isDark ? 'chess-sq--dark' : 'chess-sq--light',
                  isSelected   ? 'chess-sq--selected' : '',
                  isLastMoveFrom || isLastMoveTo ? 'chess-sq--last' : '',
                  isCheckSq    ? 'chess-sq--check' : '',
                ].join(' ')}
                onClick={() => handleSquareClick(sq)}>
                {isLegal && <div className={`chess-legal-dot ${piece ? 'chess-legal-dot--capture' : ''}`} />}
                {piece && (
                  <div className={`chess-piece chess-piece--${piece.color}`}>
                    {PIECE_UNICODE[piece.color + piece.type.toUpperCase()]}
                  </div>
                )}
              </div>
            );
          }))}
        </div>
        {/* File labels */}
        <div className="chess-files">
          {cols.map(c => (
            <div key={c} className="chess-file-label">
              {flipped ? String.fromCharCode(104 - c) : String.fromCharCode(97 + c)}
            </div>
          ))}
        </div>
      </div>

      {promotionPending && (
        <div className="chess-promo-overlay">
          <div className="chess-promo-box">
            <div className="chess-promo-title">Promote pawn to:</div>
            <div className="chess-promo-choices">
              {['q','r','b','n'].map(p => (
                <button key={p} className="chess-promo-btn" onClick={() => handlePromotion(p)}>
                  {PIECE_UNICODE[myColor + p.toUpperCase()]}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
