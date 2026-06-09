import { useRef, useState } from 'react';
import './MoveHistory.css';

export default function MoveHistory({ moveHistory, fen, getPgn }) {
  const [copied, setCopied] = useState(null);
  const copyTimerRef = useRef(null);

  const pairs = [];
  for (let index = 0; index < moveHistory.length; index += 2) {
    pairs.push({
      num: Math.floor(index / 2) + 1,
      white: moveHistory[index],
      black: moveHistory[index + 1],
    });
  }

  async function copyToClipboard(kind, text) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
    } catch {
      setCopied('failed');
    }
    clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div className="move-history">
      <div className="history-header">
        <span className="history-icon">[]</span>
        <span>MOVE LOG</span>
      </div>
      <div className="history-list">
        {pairs.length === 0 && <div className="no-moves">awaiting first move...</div>}
        {pairs.map(({ num, white, black }) => (
          <div key={num} className="move-pair">
            <span className="move-num">{num}.</span>
            <span className="move white-move">{white?.san}</span>
            <span className="move black-move">{black?.san || ''}</span>
          </div>
        ))}
      </div>
      <div className="history-actions">
        <button
          type="button"
          className="copy-btn"
          disabled={moveHistory.length === 0}
          onClick={() => copyToClipboard('pgn', getPgn())}
        >
          {copied === 'pgn' ? 'COPIED!' : 'COPY PGN'}
        </button>
        <button
          type="button"
          className="copy-btn"
          onClick={() => copyToClipboard('fen', fen)}
        >
          {copied === 'fen' ? 'COPIED!' : 'COPY FEN'}
        </button>
        {copied === 'failed' && <span className="copy-feedback">clipboard unavailable</span>}
      </div>
    </div>
  );
}
