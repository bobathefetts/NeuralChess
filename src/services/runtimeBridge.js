const APP_STATE_KEY = 'neural-chess-app-state-v2';
const LEGACY_CONFIG_KEY = 'neural-chess-config';
const LEGACY_DISCLAIMER_KEY = 'neural-chess-disclaimer-seen';

export const DEFAULT_LLM_CONFIG = {
  preset: 'ollama',
  apiType: 'ollama',
  baseUrl: 'http://localhost:11434',
  model: '',
  hasStoredApiKey: false,
};

export const DEFAULT_UI_STATE = {
  playerColor: 'w',
  squareSize: 72,
  difficulty: 'normal',
  disclaimerAccepted: false,
};

export const DEFAULT_RELEASE_STATE = {
  updateManifestUrl: '',
};

export const DEFAULT_BOOTSTRAP = {
  runtime: {
    isDesktop: false,
    isPackaged: false,
    version: 'dev',
    platform: typeof navigator === 'undefined' ? 'unknown' : navigator.platform,
    logFilePath: '',
  },
  storedState: {
    llmConfig: { ...DEFAULT_LLM_CONFIG },
    ui: { ...DEFAULT_UI_STATE },
    release: { ...DEFAULT_RELEASE_STATE },
    secureStorageAvailable: false,
  },
  updateState: {
    status: 'disabled',
    currentVersion: 'dev',
    latestVersion: 'dev',
    checkedAt: null,
    message: 'Desktop update checks are unavailable in browser mode.',
    notes: '',
    progress: 0,
  },
};

function getDesktopBridge() {
  return globalThis.window?.neuralChessDesktop || null;
}

export function hasDesktopRuntime() {
  return Boolean(getDesktopBridge());
}

export async function loadBootstrap() {
  if (hasDesktopRuntime()) {
    return getDesktopBridge().getBootstrap();
  }

  return {
    ...DEFAULT_BOOTSTRAP,
    storedState: loadBrowserState(),
  };
}

export async function saveRendererState(payload) {
  if (hasDesktopRuntime()) {
    return getDesktopBridge().saveRendererState(payload);
  }

  const currentState = loadBrowserState();
  const nextState = {
    ...currentState,
    ...payload,
    llmConfig: {
      ...currentState.llmConfig,
      ...(payload.llmConfig || {}),
    },
    ui: {
      ...currentState.ui,
      ...(payload.ui || {}),
    },
    release: {
      ...currentState.release,
      ...(payload.release || {}),
    },
  };
  localStorage.setItem(APP_STATE_KEY, JSON.stringify(nextState));
  return nextState;
}

export async function importLegacyState(payload) {
  if (hasDesktopRuntime()) {
    return getDesktopBridge().importLegacyState(payload);
  }

  const state = {
    llmConfig: {
      ...DEFAULT_LLM_CONFIG,
      ...(payload.llmConfig || {}),
      hasStoredApiKey: Boolean(payload.llmConfig?.apiKey),
    },
    ui: {
      ...DEFAULT_UI_STATE,
      ...(payload.ui || {}),
      disclaimerAccepted: Boolean(payload.disclaimerAccepted),
    },
    release: { ...DEFAULT_RELEASE_STATE },
    secureStorageAvailable: false,
  };
  localStorage.setItem(APP_STATE_KEY, JSON.stringify(state));
  return state;
}

export async function setStoredApiKey(apiKey) {
  if (hasDesktopRuntime()) {
    return getDesktopBridge().setApiKey(apiKey);
  }

  const state = loadBrowserState();
  const nextState = {
    ...state,
    llmConfig: {
      ...state.llmConfig,
      apiKey,
      hasStoredApiKey: Boolean(apiKey),
    },
  };
  localStorage.setItem(APP_STATE_KEY, JSON.stringify(nextState));
  return { hasStoredApiKey: Boolean(apiKey) };
}

export async function clearStoredApiKey() {
  if (hasDesktopRuntime()) {
    return getDesktopBridge().clearApiKey();
  }

  const state = loadBrowserState();
  const nextState = {
    ...state,
    llmConfig: {
      ...state.llmConfig,
      apiKey: '',
      hasStoredApiKey: false,
    },
  };
  localStorage.setItem(APP_STATE_KEY, JSON.stringify(nextState));
  return { hasStoredApiKey: false };
}

export async function checkForUpdates() {
  if (hasDesktopRuntime()) {
    return getDesktopBridge().checkForUpdates();
  }
  return DEFAULT_BOOTSTRAP.updateState;
}

export async function downloadUpdate() {
  if (hasDesktopRuntime()) {
    return getDesktopBridge().downloadUpdate();
  }
  return DEFAULT_BOOTSTRAP.updateState;
}

export function installUpdate() {
  if (hasDesktopRuntime()) {
    getDesktopBridge().installUpdate();
  }
}

// Subscribe to live update-state pushes (e.g. download progress). Returns an
// unsubscribe function; a no-op in browser mode.
export function subscribeUpdateState(listener) {
  const bridge = getDesktopBridge();
  if (bridge?.onUpdateState) {
    return bridge.onUpdateState(listener);
  }
  return () => {};
}

export async function openExternal(url) {
  if (hasDesktopRuntime()) {
    return getDesktopBridge().openExternal(url);
  }
  if (url) {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
  return true;
}

export async function openLogsDirectory() {
  if (hasDesktopRuntime()) {
    return getDesktopBridge().openLogsDirectory();
  }
  return false;
}

export function logRuntimeEvent(event, meta = {}) {
  if (hasDesktopRuntime()) {
    getDesktopBridge().logRendererEvent(event, meta);
  }
}

export function getLegacyBrowserState() {
  try {
    const raw = localStorage.getItem(LEGACY_CONFIG_KEY);
    if (!raw) {
      return null;
    }
    const legacy = JSON.parse(raw);
    return {
      llmConfig: {
        preset: legacy.apiType || 'ollama',
        apiType: legacy.apiType || 'ollama',
        baseUrl: legacy.baseUrl || DEFAULT_LLM_CONFIG.baseUrl,
        model: legacy.model || '',
        apiKey: legacy.apiKey || '',
      },
      ui: {
        playerColor: DEFAULT_UI_STATE.playerColor,
        squareSize: DEFAULT_UI_STATE.squareSize,
        difficulty: DEFAULT_UI_STATE.difficulty,
      },
      disclaimerAccepted: localStorage.getItem(LEGACY_DISCLAIMER_KEY) === 'true',
    };
  } catch {
    return null;
  }
}

export function clearLegacyBrowserState() {
  localStorage.removeItem(LEGACY_CONFIG_KEY);
  localStorage.removeItem(LEGACY_DISCLAIMER_KEY);
}

function loadBrowserState() {
  try {
    const raw = localStorage.getItem(APP_STATE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        llmConfig: {
          ...DEFAULT_LLM_CONFIG,
          ...(parsed.llmConfig || {}),
        },
        ui: {
          ...DEFAULT_UI_STATE,
          ...(parsed.ui || {}),
        },
        release: {
          ...DEFAULT_RELEASE_STATE,
          ...(parsed.release || {}),
        },
        secureStorageAvailable: false,
      };
    }
  } catch {
    return {
      llmConfig: { ...DEFAULT_LLM_CONFIG },
      ui: { ...DEFAULT_UI_STATE },
      release: { ...DEFAULT_RELEASE_STATE },
      secureStorageAvailable: false,
    };
  }

  const legacy = getLegacyBrowserState();
  if (legacy) {
    const migrated = {
      llmConfig: {
        ...DEFAULT_LLM_CONFIG,
        ...legacy.llmConfig,
        hasStoredApiKey: Boolean(legacy.llmConfig.apiKey),
      },
      ui: {
        ...DEFAULT_UI_STATE,
        ...legacy.ui,
        disclaimerAccepted: legacy.disclaimerAccepted,
      },
      release: { ...DEFAULT_RELEASE_STATE },
      secureStorageAvailable: false,
    };
    localStorage.setItem(APP_STATE_KEY, JSON.stringify(migrated));
    clearLegacyBrowserState();
    return migrated;
  }

  return {
    llmConfig: { ...DEFAULT_LLM_CONFIG },
    ui: { ...DEFAULT_UI_STATE },
    release: { ...DEFAULT_RELEASE_STATE },
    secureStorageAvailable: false,
  };
}
