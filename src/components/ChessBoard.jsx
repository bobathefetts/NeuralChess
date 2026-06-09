import { useMemo } from 'react';
import { Chess } from 'chess.js';
import piecesSprite from '../assets/chess-pieces.svg?raw';
import './ChessBoard.css';

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'];

const PIECE_NAMES = {
  k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn',
};

const PROMOTION_PIECES = ['q', 'r', 'b', 'n'];
const PROMOTION_LABELS = { q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight' };

function parseFen(fen) {
  const chess = new Chess(fen);
  const board = {};
  for (const file of FILES) {
    for (const rank of RANKS) {
      const sq = file + rank;
      const piece = chess.get(sq);
      if (piece) board[sq] = piece;
    }
  }
  return board;
}

function Piece({ color, type }) {
  return (
    <svg
      className={`piece piece-svg ${color === 'w' ? 'white-piece' : 'black-piece'}`}
      viewBox="0 0 45 45"
      aria-hidden="true"
    >
      <use href={`#${color}${type.toUpperCase()}`} />
    </svg>
  );
}

function squareLabel(square, piece) {
  if (!piece) return `${square}, empty`;
  const color = piece.color === 'w' ? 'white' : 'black';
  return `${square}, ${color} ${PIECE_NAMES[piece.type]}`;
}

export default function ChessBoard({
  fen,
  selectedSquare,
  legalMoves,
  lastMove,
  onSquareClick,
  playerColor = 'w',
  disabled = false,
  squareSize = 72,
  promotion = null,
  onPromote,
  onCancelPromotion,
}) {
  const board = useMemo(() => parseFen(fen), [fen]);
  const legalTargets = useMemo(() => new Set(legalMoves.map(m => m.to)), [legalMoves]);

  const ranks = playerColor === 'w' ? RANKS : [...RANKS].reverse();
  const files = playerColor === 'w' ? FILES : [...FILES].reverse();

  return (
    <div className="board-wrapper" style={{ '--sq': `${squareSize}px` }}>
      {/* Inline sprite so <use href="#wN"> resolves in this document */}
      <span style={{ display: 'none' }} dangerouslySetInnerHTML={{ __html: piecesSprite }} />
      <div className="board-glow" />
      <div className="board-container">
        <div className="rank-labels">
          {ranks.map(r => <span key={r}>{r}</span>)}
        </div>

        <div>
          <div className="file-labels">
            {files.map(f => <span key={f}>{f}</span>)}
          </div>

          <div className="board" role="group" aria-label="Chess board">
            {ranks.map((rank) =>
              files.map((file) => {
                const square = file + rank;
                const piece = board[square];
                const isLight = (FILES.indexOf(file) + RANKS.indexOf(rank)) % 2 === 0;
                const isSelected = selectedSquare === square;
                const isLegalTarget = legalTargets.has(square);
                const isLastMoveFrom = lastMove?.from === square;
                const isLastMoveTo = lastMove?.to === square;

                return (
                  <button
                    key={square}
                    type="button"
                    className={[
                      'square',
                      isLight ? 'light' : 'dark',
                      isSelected ? 'selected' : '',
                      isLastMoveFrom || isLastMoveTo ? 'last-move' : '',
                      disabled ? 'disabled' : '',
                    ].join(' ')}
                    onClick={() => !disabled && onSquareClick(square)}
                    aria-label={squareLabel(square, piece)}
                    aria-pressed={isSelected}
                    aria-disabled={disabled}
                  >
                    {isLegalTarget && (
                      <div className={`move-hint ${piece ? 'capture-hint' : 'dot-hint'}`} />
                    )}
                    {piece && <Piece color={piece.color} type={piece.type} />}
                  </button>
                );
              })
            )}
          </div>

          <div className="file-labels">
            {files.map(f => <span key={f}>{f}</span>)}
          </div>
        </div>

        <div className="rank-labels">
          {ranks.map(r => <span key={r}>{r}</span>)}
        </div>
      </div>

      {promotion && (
        <div className="promotion-overlay" onClick={onCancelPromotion}>
          <div
            className="promotion-picker"
            role="dialog"
            aria-label="Choose promotion piece"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="promotion-title">PROMOTE TO</div>
            <div className="promotion-options">
              {PROMOTION_PIECES.map((piece) => (
                <button
                  key={piece}
                  className="promotion-btn"
                  type="button"
                  onClick={() => onPromote(piece)}
                  aria-label={`Promote to ${PROMOTION_LABELS[piece]}`}
                >
                  <Piece color={playerColor} type={piece} />
                </button>
              ))}
            </div>
            <div className="promotion-hint">click outside to cancel</div>
          </div>
        </div>
      )}
    </div>
  );
}
