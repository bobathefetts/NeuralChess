import './StatusPanel.css';

export default function StatusPanel({
  gameStatus,
  turn,
  playerColor,
  llmConfig,
  difficulty,
  runtimeInfo,
  updateState,
  isThinking,
  error,
  onReset,
  onRetry,
  onStop,
  onResign,
  onUndo,
  onCheckForUpdates,
  onDownloadUpdate,
  onInstallUpdate,
  onOpenLogs,
  gameStarted,
}) {
  const isPlayerTurn = turn === playerColor;
  const modelLabel = llmConfig?.model || '(provider default)';
  const turnLabel = isPlayerTurn ? 'YOUR TURN' : `${modelLabel} THINKING...`;

  function getStatusText() {
    if (!gameStarted) {
      return { text: 'STANDBY', cls: 'status-standby' };
    }
    if (gameStatus === 'checkmate') {
      const winner = turn === playerColor ? 'AI WINS' : 'YOU WIN';
      return { text: `CHECKMATE - ${winner}`, cls: 'status-end' };
    }
    if (gameStatus === 'resigned') {
      return { text: 'RESIGNED - AI WINS', cls: 'status-end' };
    }
    if (gameStatus === 'stalemate') {
      return { text: 'STALEMATE - DRAW', cls: 'status-end' };
    }
    if (gameStatus === 'repetition') {
      return { text: 'DRAW - THREEFOLD REPETITION', cls: 'status-end' };
    }
    if (gameStatus === 'insufficient-material') {
      return { text: 'DRAW - INSUFFICIENT MATERIAL', cls: 'status-end' };
    }
    if (gameStatus === 'fifty-move') {
      return { text: 'DRAW - FIFTY-MOVE RULE', cls: 'status-end' };
    }
    if (gameStatus === 'draw') {
      return { text: 'DRAW', cls: 'status-end' };
    }
    if (gameStatus === 'check') {
      return { text: `CHECK - ${turnLabel}`, cls: 'status-check' };
    }
    if (isThinking) {
      return { text: `${modelLabel} COMPUTING...`, cls: 'status-thinking' };
    }
    return { text: turnLabel, cls: isPlayerTurn ? 'status-player' : 'status-ai' };
  }

  const { text, cls } = getStatusText();

  return (
    <div className="status-panel">
      <div className="players-row">
        <div className={`player-badge ${playerColor === 'w' ? 'white-player' : 'black-player'}`}>
          <div className="player-dot" />
          <div>
            <div className="player-label">YOU</div>
            <div className="player-color">{playerColor === 'w' ? 'WHITE' : 'BLACK'}</div>
          </div>
        </div>

        <div className="vs-text">VS</div>

        <div className={`player-badge ${playerColor === 'w' ? 'black-player' : 'white-player'} ai-badge`}>
          <div className="player-dot ai-dot" />
          <div>
            <div className="player-label">AI</div>
            <div className="player-model">{modelLabel}</div>
          </div>
        </div>
      </div>

      <div className={`game-status ${cls}`}>
        {isThinking && <span className="pulse-dot" />}
        {text}
      </div>

      <div className="system-grid">
        <div className="system-row">
          <span>PROVIDER</span>
          <strong>{llmConfig.apiType.toUpperCase()}</strong>
        </div>
        <div className="system-row">
          <span>DIFFICULTY</span>
          <strong>{difficulty.toUpperCase()}</strong>
        </div>
        <div className="system-row">
          <span>APP</span>
          <strong>v{runtimeInfo.version}</strong>
        </div>
        <div className="system-row">
          <span>UPDATES</span>
          <strong>{updateLabel(updateState)}</strong>
        </div>
      </div>

      {error && <div className="error-msg">! {error}</div>}

      <div className="status-actions">
        {onStop && (
          <button className="retry-btn" onClick={onStop} type="button">
            STOP AI MOVE
          </button>
        )}

        {onRetry && (
          <button className="retry-btn" onClick={onRetry} type="button">
            RETRY AI MOVE
          </button>
        )}

        {onUndo && (
          <button className="secondary-btn" onClick={onUndo} type="button">
            UNDO MOVE
          </button>
        )}

        {onResign && (
          <button className="secondary-btn" onClick={onResign} type="button">
            RESIGN
          </button>
        )}

        <button className="secondary-btn" onClick={onCheckForUpdates} type="button">
          CHECK UPDATES
        </button>

        {onDownloadUpdate && (
          <button className="secondary-btn" onClick={onDownloadUpdate} type="button">
            DOWNLOAD UPDATE
          </button>
        )}

        {updateState.status === 'downloading' && (
          <button className="secondary-btn" type="button" disabled>
            DOWNLOADING {updateState.progress || 0}%
          </button>
        )}

        {onInstallUpdate && (
          <button className="retry-btn" onClick={onInstallUpdate} type="button">
            RESTART &amp; INSTALL
          </button>
        )}

        <button className="secondary-btn" onClick={onOpenLogs} type="button">
          OPEN LOGS
        </button>

        {gameStarted && (
          <button className="reset-btn" onClick={onReset} disabled={isThinking} type="button">
            NEW GAME
          </button>
        )}
      </div>

      {updateState.notes && <div className="update-notes">{updateState.notes}</div>}
    </div>
  );
}

function updateLabel(updateState) {
  switch (updateState.status) {
    case 'available':
      return `v${updateState.latestVersion} AVAILABLE`;
    case 'downloading':
      return `DOWNLOADING ${updateState.progress || 0}%`;
    case 'downloaded':
      return 'READY TO INSTALL';
    case 'not-available':
      return 'CURRENT';
    case 'checking':
      return 'CHECKING';
    case 'error':
      return 'ERROR';
    default:
      return 'OFF';
  }
}
