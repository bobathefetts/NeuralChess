import { useCallback, useEffect, useRef, useState } from 'react';
import { useChessGame } from './hooks/useChessGame';
import { useAIOpponent } from './hooks/useAIOpponent';
import {
  DEFAULT_BOOTSTRAP,
  DEFAULT_LLM_CONFIG,
  DEFAULT_UI_STATE,
  checkForUpdates,
  clearLegacyBrowserState,
  clearStoredApiKey,
  downloadUpdate,
  getLegacyBrowserState,
  importLegacyState,
  installUpdate,
  loadBootstrap,
  logRuntimeEvent,
  openLogsDirectory,
  saveRendererState,
  setStoredApiKey,
  subscribeUpdateState,
} from './services/runtimeBridge';
import ChessBoard from './components/ChessBoard';
import LLMConfig from './components/LLMConfig';
import MoveHistory from './components/MoveHistory';
import StatusPanel from './components/StatusPanel';
import ThinkingPanel from './components/ThinkingPanel';
import DisclaimerModal from './components/DisclaimerModal';
import { playMoveSound } from './services/sound';
import './App.css';

export default function App() {
  const [llmConfig, setLlmConfig] = useState(DEFAULT_LLM_CONFIG);
  const [apiKeyDraft, setApiKeyDraft] = useState('');
  const [playerColor, setPlayerColor] = useState(DEFAULT_UI_STATE.playerColor);
  const [difficulty, setDifficulty] = useState(DEFAULT_UI_STATE.difficulty);
  const [squareSize, setSquareSize] = useState(DEFAULT_UI_STATE.squareSize);
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(
    DEFAULT_UI_STATE.disclaimerAccepted
  );
  const [runtimeInfo, setRuntimeInfo] = useState(DEFAULT_BOOTSTRAP.runtime);
  const [updateState, setUpdateState] = useState(DEFAULT_BOOTSTRAP.updateState);
  const [secureStorageAvailable, setSecureStorageAvailable] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  const [gameStarted, setGameStarted] = useState(false);
  const [resigned, setResigned] = useState(false);

  const {
    game,
    fen,
    selectedSquare,
    legalMoves,
    moveHistory,
    gameStatus,
    lastMove,
    pendingPromotion,
    selectSquare,
    makeMove,
    promote,
    cancelPromotion,
    undoLastTurn,
    exportPgn,
    resetGame,
    getTurn,
    isGameOver,
  } = useChessGame();

  const {
    isThinking,
    error,
    thinkingText,
    hasTokens,
    canRetry,
    triggerAIMove,
    abortAI,
    resetAIState,
    clearError,
    retry,
    stop,
  } = useAIOpponent({ game, fen, moveHistory, llmConfig, apiKeyDraft, difficulty, makeMove });

  const lastSoundedRef = useRef(0);

  useEffect(() => {
    let isCancelled = false;

    async function bootstrap() {
      const bootstrapState = await loadBootstrap();
      if (isCancelled) {
        return;
      }

      setRuntimeInfo(bootstrapState.runtime);
      setUpdateState(bootstrapState.updateState);
      setSecureStorageAvailable(Boolean(bootstrapState.storedState.secureStorageAvailable));
      setLlmConfig({
        ...DEFAULT_LLM_CONFIG,
        ...bootstrapState.storedState.llmConfig,
      });
      setPlayerColor(bootstrapState.storedState.ui.playerColor || DEFAULT_UI_STATE.playerColor);
      setDifficulty(bootstrapState.storedState.ui.difficulty || DEFAULT_UI_STATE.difficulty);
      setSquareSize(bootstrapState.storedState.ui.squareSize || DEFAULT_UI_STATE.squareSize);
      setDisclaimerAccepted(Boolean(bootstrapState.storedState.ui.disclaimerAccepted));

      const legacyState = getLegacyBrowserState();
      if (legacyState && bootstrapState.runtime.isDesktop) {
        const migrated = await importLegacyState(legacyState);
        clearLegacyBrowserState();
        if (isCancelled) {
          return;
        }
        setLlmConfig({
          ...DEFAULT_LLM_CONFIG,
          ...migrated.llmConfig,
        });
        setPlayerColor(migrated.ui.playerColor || DEFAULT_UI_STATE.playerColor);
        setDifficulty(migrated.ui.difficulty || DEFAULT_UI_STATE.difficulty);
        setSquareSize(migrated.ui.squareSize || DEFAULT_UI_STATE.squareSize);
        setDisclaimerAccepted(Boolean(migrated.ui.disclaimerAccepted));
        logRuntimeEvent('legacy_state_imported', {
          apiType: legacyState.llmConfig.apiType,
        });
      }

      setIsHydrated(true);
    }

    bootstrap();

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    saveRendererState({
      llmConfig,
      ui: {
        playerColor,
        squareSize,
        difficulty,
        disclaimerAccepted,
      },
    }).catch(() => {});
  }, [disclaimerAccepted, difficulty, isHydrated, llmConfig, playerColor, squareSize]);

  useEffect(() => {
    const handleGlobalError = (event) => {
      logRuntimeEvent('unhandled_rejection', {
        reason: event.reason?.message || String(event.reason || ''),
      });
    };
    window.addEventListener('unhandledrejection', handleGlobalError);
    return () => window.removeEventListener('unhandledrejection', handleGlobalError);
  }, []);

  // Receive live update-state pushes from the main process (download progress,
  // update-downloaded, etc.).
  useEffect(() => subscribeUpdateState(setUpdateState), []);

  // Play a move/capture click whenever a move is added (player or AI).
  useEffect(() => {
    if (moveHistory.length > lastSoundedRef.current) {
      const last = moveHistory[moveHistory.length - 1];
      playMoveSound(last?.captured ? 'capture' : 'move');
    }
    lastSoundedRef.current = moveHistory.length;
  }, [moveHistory]);

  // Drive the AI's turn. triggerAIMove guards against re-entry itself, so the
  // effect only needs to decide whether it is the AI's move.
  useEffect(() => {
    if (!gameStarted || resigned || isGameOver()) {
      return;
    }
    if (getTurn() === playerColor) {
      return;
    }
    triggerAIMove();
  }, [fen, gameStarted, getTurn, isGameOver, playerColor, resigned, triggerAIMove]);

  const persistApiKey = useCallback(async () => {
    const nextApiKey = apiKeyDraft.trim();
    if (!nextApiKey) {
      return llmConfig.hasStoredApiKey;
    }

    const result = await setStoredApiKey(nextApiKey);
    setLlmConfig((current) => ({
      ...current,
      hasStoredApiKey: result.hasStoredApiKey,
      apiKey: runtimeInfo.isDesktop ? '' : nextApiKey,
    }));
    setApiKeyDraft('');
    return result.hasStoredApiKey;
  }, [apiKeyDraft, llmConfig.hasStoredApiKey, runtimeInfo.isDesktop]);

  const handleClearApiKey = useCallback(async () => {
    await clearStoredApiKey();
    setApiKeyDraft('');
    setLlmConfig((current) => ({
      ...current,
      apiKey: '',
      hasStoredApiKey: false,
    }));
  }, []);

  const handleSquareClick = useCallback(
    (square) => {
      if (!gameStarted || isGameOver()) {
        return;
      }
      if (getTurn() !== playerColor) {
        return;
      }
      selectSquare(square);
    },
    [gameStarted, getTurn, isGameOver, playerColor, selectSquare]
  );

  const handleStart = useCallback(async () => {
    await persistApiKey();
    abortAI();
    resetGame();
    setGameStarted(true);
    setResigned(false);
    resetAIState();
    logRuntimeEvent('match.started', {
      apiType: llmConfig.apiType,
      model: llmConfig.model || '(provider-default)',
      difficulty,
      playerColor,
    });
  }, [abortAI, difficulty, llmConfig.apiType, llmConfig.model, persistApiKey, playerColor, resetAIState, resetGame]);

  const handleReset = useCallback(() => {
    abortAI();
    resetGame();
    setGameStarted(false);
    setResigned(false);
    resetAIState();
    logRuntimeEvent('match.reset');
  }, [abortAI, resetAIState, resetGame]);

  const handleResign = useCallback(() => {
    abortAI();
    setResigned(true);
    clearError();
    logRuntimeEvent('match.resigned');
  }, [abortAI, clearError]);

  const handleUndo = useCallback(() => {
    abortAI();
    if (undoLastTurn(playerColor)) {
      clearError();
      logRuntimeEvent('move.undone');
    }
  }, [abortAI, clearError, playerColor, undoLastTurn]);

  const handleGetPgn = useCallback(() => {
    const aiName = llmConfig.model || `${llmConfig.apiType} (default model)`;
    return exportPgn(
      playerColor === 'w' ? { white: 'Human', black: aiName } : { white: aiName, black: 'Human' }
    );
  }, [exportPgn, llmConfig.apiType, llmConfig.model, playerColor]);

  const handleCheckForUpdates = useCallback(async () => {
    const nextState = await checkForUpdates();
    setUpdateState(nextState);
  }, []);

  const handleDownloadUpdate = useCallback(async () => {
    const nextState = await downloadUpdate();
    setUpdateState(nextState);
  }, []);

  const handleInstallUpdate = useCallback(() => {
    installUpdate();
  }, []);

  const handleAcceptDisclaimer = useCallback(() => {
    setDisclaimerAccepted(true);
  }, []);

  const isBoardDisabled =
    !gameStarted || resigned || getTurn() !== playerColor || isGameOver() || isThinking;
  const boardTotalHeight = squareSize * 8 + 60;

  return (
    <div className="app" style={{ '--board-total-height': `${boardTotalHeight}px` }}>
      <header className="app-header">
        <div className="header-accent" />
        <div className="header-content">
          <div className="logo">
            <span className="logo-icon">[]</span>
            <span className="logo-text">
              NEURAL<span className="logo-chess">CHESS</span>
            </span>
          </div>
          <div className="header-tagline">
            HUMAN VS MACHINE | LLM CHESS LAB | v{runtimeInfo.version}
          </div>
        </div>
        <div className="header-accent" />
      </header>

      <main className="app-main">
        <aside className="left-panel">
          <LLMConfig
            config={llmConfig}
            apiKeyDraft={apiKeyDraft}
            onApiKeyDraftChange={setApiKeyDraft}
            onPersistApiKey={persistApiKey}
            onClearApiKey={handleClearApiKey}
            secureStorageAvailable={secureStorageAvailable}
            onChange={setLlmConfig}
            onStart={handleStart}
            disabled={gameStarted && !isGameOver() && !resigned}
            playerColor={playerColor}
            onPlayerColorChange={setPlayerColor}
            difficulty={difficulty}
            onDifficultyChange={setDifficulty}
          />

          <div className="size-control">
            <div className="size-label">
              <span>BOARD SIZE</span>
              <span className="size-value">{squareSize * 8}px</span>
            </div>
            <input
              type="range"
              min="44"
              max="100"
              value={squareSize}
              onChange={(event) => setSquareSize(Number(event.target.value))}
              className="size-slider"
            />
            <div className="size-ticks">
              <span>SMALL</span>
              <span>LARGE</span>
            </div>
          </div>

          <ThinkingPanel text={thinkingText} isThinking={isThinking} hasTokens={hasTokens} />
        </aside>

        <div className="board-area">
          <ChessBoard
            game={game}
            fen={fen}
            selectedSquare={selectedSquare}
            legalMoves={legalMoves}
            lastMove={lastMove}
            onSquareClick={handleSquareClick}
            playerColor={playerColor}
            disabled={isBoardDisabled}
            squareSize={squareSize}
            promotion={pendingPromotion}
            onPromote={promote}
            onCancelPromotion={cancelPromotion}
          />
          {!gameStarted && (
            <div className="board-overlay">
              <div className="overlay-text">
                <div className="overlay-icon">[]</div>
                <div>CONFIGURE YOUR OPPONENT</div>
                <div className="overlay-sub">CHOOSE A MODEL AND START THE MATCH</div>
              </div>
            </div>
          )}
        </div>

        <aside className="right-panel">
          <StatusPanel
            gameStatus={resigned ? 'resigned' : gameStatus}
            turn={getTurn()}
            playerColor={playerColor}
            moveHistory={moveHistory}
            llmConfig={llmConfig}
            difficulty={difficulty}
            runtimeInfo={runtimeInfo}
            updateState={updateState}
            isThinking={isThinking}
            error={error}
            onReset={handleReset}
            onRetry={canRetry ? retry : null}
            onStop={isThinking ? stop : null}
            onResign={gameStarted && !resigned && !isGameOver() ? handleResign : null}
            onUndo={
              gameStarted && !resigned && moveHistory.length > 0 ? handleUndo : null
            }
            onCheckForUpdates={handleCheckForUpdates}
            onDownloadUpdate={updateState.status === 'available' ? handleDownloadUpdate : null}
            onInstallUpdate={updateState.status === 'downloaded' ? handleInstallUpdate : null}
            onOpenLogs={openLogsDirectory}
            gameStarted={gameStarted}
          />
          <MoveHistory moveHistory={moveHistory} fen={fen} getPgn={handleGetPgn} />
        </aside>
      </main>

      <DisclaimerModal isOpen={!disclaimerAccepted} onAccept={handleAcceptDisclaimer} />
    </div>
  );
}
