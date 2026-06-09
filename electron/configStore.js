import fs from 'node:fs';
import path from 'node:path';

const CONFIG_VERSION = 2;

const DEFAULT_STATE = {
  version: CONFIG_VERSION,
  settings: {
    provider: {
      preset: 'ollama',
      apiType: 'ollama',
      baseUrl: 'http://localhost:11434',
      model: '',
    },
    ui: {
      playerColor: 'w',
      squareSize: 72,
      difficulty: 'normal',
      disclaimerAccepted: false,
    },
    release: {
      updateManifestUrl: '',
    },
  },
  secrets: {
    apiKey: null,
  },
};

export function createConfigStore({ userDataPath, safeStorage, logger }) {
  const configPath = path.join(userDataPath, 'app-config.json');
  fs.mkdirSync(userDataPath, { recursive: true });

  let state = loadState(configPath, safeStorage, logger);

  function getRendererState() {
    return {
      llmConfig: {
        ...state.settings.provider,
        hasStoredApiKey: Boolean(state.secrets.apiKey),
      },
      ui: { ...state.settings.ui },
      release: { ...state.settings.release },
      secureStorageAvailable: safeStorage.isEncryptionAvailable(),
    };
  }

  function saveRendererState(payload = {}) {
    state = {
      ...state,
      settings: {
        ...state.settings,
        provider: sanitizeProvider({
          ...state.settings.provider,
          ...(payload.llmConfig || {}),
        }),
        ui: sanitizeUi({
          ...state.settings.ui,
          ...(payload.ui || {}),
        }),
        release: sanitizeRelease({
          ...state.settings.release,
          ...(payload.release || {}),
        }),
      },
    };
    persistState(configPath, state, logger);
    return getRendererState();
  }

  function importLegacyState(payload = {}) {
    const legacyConfig = payload.llmConfig || {};
    const legacyUi = payload.ui || {};
    const nextProvider = {
      preset: legacyConfig.preset || legacyConfig.apiType || state.settings.provider.preset,
      apiType: legacyConfig.apiType || state.settings.provider.apiType,
      baseUrl: legacyConfig.baseUrl || state.settings.provider.baseUrl,
      model: legacyConfig.model || '',
    };
    state = {
      ...state,
      settings: {
        ...state.settings,
        provider: sanitizeProvider({
          ...state.settings.provider,
          ...nextProvider,
        }),
        ui: sanitizeUi({
          ...state.settings.ui,
          playerColor: legacyUi.playerColor || state.settings.ui.playerColor,
          squareSize: legacyUi.squareSize || state.settings.ui.squareSize,
          difficulty: legacyUi.difficulty || state.settings.ui.difficulty,
          disclaimerAccepted:
            payload.disclaimerAccepted ?? state.settings.ui.disclaimerAccepted,
        }),
      },
      secrets: {
        ...state.secrets,
        apiKey: encodeSecret(legacyConfig.apiKey || '', safeStorage, logger),
      },
    };
    persistState(configPath, state, logger);
    return getRendererState();
  }

  function setApiKey(apiKey = '') {
    state = {
      ...state,
      secrets: {
        ...state.secrets,
        apiKey: encodeSecret(apiKey, safeStorage, logger),
      },
    };
    persistState(configPath, state, logger);
    return { hasStoredApiKey: Boolean(state.secrets.apiKey) };
  }

  function clearApiKey() {
    state = {
      ...state,
      secrets: {
        ...state.secrets,
        apiKey: null,
      },
    };
    persistState(configPath, state, logger);
    return { hasStoredApiKey: false };
  }

  function getApiKey() {
    return decodeSecret(state.secrets.apiKey, safeStorage, logger);
  }

  function getUpdateManifestUrl() {
    return state.settings.release.updateManifestUrl || '';
  }

  return {
    getRendererState,
    saveRendererState,
    importLegacyState,
    setApiKey,
    clearApiKey,
    getApiKey,
    getUpdateManifestUrl,
  };
}

function loadState(configPath, safeStorage, logger) {
  try {
    if (!fs.existsSync(configPath)) {
      persistState(configPath, DEFAULT_STATE, logger);
      return structuredClone(DEFAULT_STATE);
    }
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return migrateState(raw, safeStorage, logger);
  } catch (error) {
    logger.error('config.load_failed', { message: error.message });
    return structuredClone(DEFAULT_STATE);
  }
}

function migrateState(rawState, safeStorage, logger) {
  const migrated = {
    version: CONFIG_VERSION,
    settings: {
      provider: sanitizeProvider(rawState?.settings?.provider || rawState?.provider || {}),
      ui: sanitizeUi(rawState?.settings?.ui || rawState?.ui || {}),
      release: sanitizeRelease(rawState?.settings?.release || rawState?.release || {}),
    },
    secrets: {
      apiKey:
        rawState?.secrets?.apiKey && decodeSecret(rawState.secrets.apiKey, safeStorage, logger)
          ? rawState.secrets.apiKey
          : null,
    },
  };

  return {
    ...structuredClone(DEFAULT_STATE),
    ...migrated,
    settings: {
      ...structuredClone(DEFAULT_STATE).settings,
      ...migrated.settings,
    },
  };
}

function persistState(configPath, state, logger) {
  try {
    fs.writeFileSync(configPath, JSON.stringify(state, null, 2), 'utf8');
  } catch (error) {
    logger.error('config.save_failed', { message: error.message });
  }
}

function sanitizeProvider(provider = {}) {
  const apiType = ['ollama', 'openai', 'anthropic'].includes(provider.apiType)
    ? provider.apiType
    : 'ollama';
  return {
    preset: String(provider.preset || apiType),
    apiType,
    baseUrl: String(provider.baseUrl || DEFAULT_STATE.settings.provider.baseUrl).trim(),
    model: String(provider.model || '').trim(),
  };
}

function sanitizeUi(ui = {}) {
  const squareSize = Number(ui.squareSize);
  return {
    playerColor: ui.playerColor === 'b' ? 'b' : 'w',
    squareSize: Number.isFinite(squareSize)
      ? Math.min(100, Math.max(44, squareSize))
      : DEFAULT_STATE.settings.ui.squareSize,
    difficulty: ['easy', 'normal', 'hard'].includes(ui.difficulty)
      ? ui.difficulty
      : DEFAULT_STATE.settings.ui.difficulty,
    disclaimerAccepted: Boolean(ui.disclaimerAccepted),
  };
}

function sanitizeRelease(release = {}) {
  return {
    updateManifestUrl: String(release.updateManifestUrl || '').trim(),
  };
}

function encodeSecret(secret, safeStorage, logger) {
  const value = String(secret || '').trim();
  if (!value) {
    return null;
  }
  if (!safeStorage.isEncryptionAvailable()) {
    logger.warn('config.secret_not_stored', {
      reason: 'safe_storage_unavailable',
    });
    return null;
  }
  try {
    return safeStorage.encryptString(value).toString('base64');
  } catch (error) {
    logger.error('config.secret_encrypt_failed', { message: error.message });
    return null;
  }
}

function decodeSecret(encoded, safeStorage, logger) {
  if (!encoded) {
    return '';
  }
  if (!safeStorage.isEncryptionAvailable()) {
    return '';
  }
  try {
    return safeStorage.decryptString(Buffer.from(encoded, 'base64'));
  } catch (error) {
    logger.error('config.secret_decrypt_failed', { message: error.message });
    return '';
  }
}
