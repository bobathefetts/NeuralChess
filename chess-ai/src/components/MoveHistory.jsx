import './MoveHistory.css';

export default function MoveHistory({ moveHistory }) {
  const pairs = [];
  for (let index = 0; index < moveHistory.length; index += 2) {
    pairs.push({
      num: Math.floor(index / 2) + 1,
      white: moveHistory[index],
      black: moveHistory[index + 1],
    });
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
    </div>
  );
}
