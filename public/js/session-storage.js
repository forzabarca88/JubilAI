/**
 * Transparent Encrypted Session Persistence
 *
 * Two-layer storage: IndexedDB (encryption key) + localStorage (encrypted data).
 * AES-256-GCM authenticated encryption. Zero UI, zero prompts, zero user interaction.
 *
 * Fallback: When Web Crypto / IndexedDB is unavailable (e.g., plain HTTP), stores
 * non-sensitive config (endpoints, models, statement) in plain localStorage JSON.
 * API keys are never stored in plaintext.
 *
 * All failures are silent (console.warn only). The app always degrades gracefully.
 */
const appSession = {
  DB_NAME: 'jubilai_storage',
  DB_VERSION: 1,
  DB_STORE: 'keys',
  KEY_RECORD_ID: 'aes_key',
  LS_KEY: 'jubilai_session',
  LS_KEY_PLAIN: 'jubilai_session_plain',

  // Fields that are safe to store in plaintext (no secrets)
  SAFE_FIELDS: ['statement', 'endpointA', 'endpointB', 'endpointJudge', 'modelA', 'modelB', 'modelJudge',
    'promptA', 'promptB', 'promptJudge', 'temperature', 'topP', 'topK', 'maxTokens',
    'judgeTemperature', 'judgeTopP', 'judgeTopK', 'judgeMaxTokens'],

  // Fields that contain secrets (API keys) — only stored when encryption is available
  SECRET_FIELDS: ['apiKeyA', 'apiKeyB', 'apiKeyJudge'],

  /**
   * Whether the browser supports encrypted storage.
   */
  get cryptoAvailable() {
    return typeof indexedDB !== 'undefined' && typeof crypto.subtle !== 'undefined';
  },

  // Cached config object for deferred model selection
  _restoredConfig: null,

  // ── IndexedDB helpers ──────────────────────────────────────────

  /**
   * Open (or create) the IndexedDB database.
   */
  _openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(this.DB_STORE)) {
          db.createObjectStore(this.DB_STORE, { keyPath: 'id' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  /**
   * Load the AES key from IndexedDB and import it as a CryptoKey.
   * Returns null if no key exists yet.
   */
  async _getAesKey() {
    try {
      const db = await this._openDb();
      const tx = db.transaction(this.DB_STORE, 'readonly');
      const store = tx.objectStore(this.DB_STORE);
      const request = store.get(this.KEY_RECORD_ID);

      return new Promise((resolve) => {
        request.onsuccess = () => {
          if (request.result && request.result.keyData) {
            crypto.subtle.importKey('raw', request.result.keyData, 'AES-GCM', false, ['encrypt', 'decrypt'])
              .then(key => resolve(key))
              .catch(() => resolve(null));
          } else {
            resolve(null);
          }
        };
        request.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  },

  /**
   * Generate a random 256-bit key, store it in IndexedDB, and return the CryptoKey.
   */
  async _ensureKey() {
    let key = await this._getAesKey();
    if (key) return key;

    const rawData = new Uint8Array(32);
    crypto.getRandomValues(rawData);

    const cryptoKey = await crypto.subtle.importKey('raw', rawData, 'AES-GCM', false, ['encrypt', 'decrypt']);

    try {
      const db = await this._openDb();
      const tx = db.transaction(this.DB_STORE, 'readwrite');
      tx.objectStore(this.DB_STORE).add({ id: this.KEY_RECORD_ID, keyData: rawData.buffer });
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = reject;
      });
    } catch (err) {
      console.warn('[Session] Could not store key in IndexedDB:', err.message);
    }

    return cryptoKey;
  },

  // ── Encryption ─────────────────────────────────────────────────

  /**
   * AES-GCM encrypt the config object. Returns base64-encoded (IV || ciphertext).
   */
  async encrypt(config) {
    const key = await this._ensureKey();
    if (!key) return null;

    const iv = new Uint8Array(12);
    crypto.getRandomValues(iv);

    const plaintext = new TextEncoder().encode(JSON.stringify({
      version: 1,
      timestamp: Date.now(),
      config
    }));

    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      plaintext
    );

    // Concatenate IV + ciphertext, then base64-encode
    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ciphertext), iv.length);

    return btoa(String.fromCharCode(...combined));
  },

  /**
   * AES-GCM decrypt a base64-encoded (IV || ciphertext) string.
   * Returns the parsed JSON object or null on failure.
   */
  async decrypt(blob) {
    const key = await this._getAesKey();
    if (!key) return null;

    // Decode base64 and split IV from ciphertext
    const combined = Uint8Array.from(atob(blob), c => c.charCodeAt(0));
    if (combined.byteLength < 12) return null;

    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);

    try {
      const plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        ciphertext
      );
      return JSON.parse(new TextDecoder().decode(plaintext));
    } catch {
      // GCM auth tag mismatch or bad key — corrupted data
      return null;
    }
  },

  // ── Plaintext fallback ─────────────────────────────────────────

  /**
   * Strip secret fields from config for plaintext storage.
   */
  _stripSecrets(config) {
    const safe = {};
    for (const field of this.SAFE_FIELDS) {
      if (config[field]) safe[field] = config[field];
    }
    return safe;
  },

  /**
   * Store config as plain JSON in localStorage (no API keys).
   */
  _savePlain(config) {
    const safe = this._stripSecrets(config);
    try {
      localStorage.setItem(this.LS_KEY_PLAIN, JSON.stringify({
        version: 1,
        timestamp: Date.now(),
        encrypted: false,
        config: safe
      }));
      return true;
    } catch (err) {
      console.warn('[Session] Plaintext save failed:', err.message);
      return false;
    }
  },

  /**
   * Load plaintext config from localStorage.
   */
  _restorePlain() {
    const blob = localStorage.getItem(this.LS_KEY_PLAIN);
    if (!blob) return null;

    try {
      const data = JSON.parse(blob);
      if (data && data.config && data.encrypted === false) return data;
    } catch {
      // Corrupted JSON
    }
    return null;
  },

  // ── Public API ─────────────────────────────────────────────────

  /**
   * Save config. Uses encryption if available, plaintext fallback otherwise.
   * In plaintext mode, API keys are excluded.
   */
  async save(config) {
    if (this.cryptoAvailable) {
      try {
        const encrypted = await this.encrypt(config);
        if (!encrypted) {
          // Encryption failed, fall through to plaintext
        } else {
          localStorage.setItem(this.LS_KEY, encrypted);
          // Clear any stale plaintext data
          localStorage.removeItem(this.LS_KEY_PLAIN);
          return true;
        }
      } catch (err) {
        console.warn('[Session] Encryption failed, falling back to plaintext:', err.message);
      }
    }

    // Plaintext fallback — store everything except API keys
    return this._savePlain(config);
  },

  /**
   * Restore session. Tries encrypted data first, falls back to plaintext.
   * Text inputs are filled immediately; model selects are filled
   * after fetchModelsFor populates the dropdowns (via applyModelSelections).
   */
  async restore() {
    let data = null;

    // 1. Try encrypted restore
    if (this.cryptoAvailable) {
      const blob = localStorage.getItem(this.LS_KEY);
      if (blob) {
        data = await this.decrypt(blob);
        if (data && data.config) {
          this._applyToDom(data.config, false);
          this._restoredConfig = data.config;
          return true;
        }
      }
    }

    // 2. Try plaintext restore
    data = this._restorePlain();
    if (data && data.config) {
      this._applyToDom(data.config, false);
      this._restoredConfig = data.config;
      return true;
    }

    return false;
  },

  /**
   * Apply saved model selections after fetchModelsFor has populated dropdowns.
   * Called from setup.js after all model fetches complete.
   */
  applyModelSelections() {
    if (!this._restoredConfig) return;
    this._applyToDom(this._restoredConfig, true);
    this._restoredConfig = null;
  },

  /**
   * Clear both encrypted and plaintext storage.
   */
  async remove() {
    localStorage.removeItem(this.LS_KEY);
    localStorage.removeItem(this.LS_KEY_PLAIN);
    try {
      const db = await this._openDb();
      const tx = db.transaction(this.DB_STORE, 'readwrite');
      tx.objectStore(this.DB_STORE).delete(this.KEY_RECORD_ID);
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = reject;
      });
    } catch {
      // Best effort cleanup
    }
  },

  /**
   * Apply config to DOM elements.
   * Text inputs are always set. Model selects are set only
   * if `afterFetch` is true (i.e., dropdowns are already populated).
   * Missing config keys are silently skipped.
   */
  _applyToDom(config, afterFetch = false) {
    // Text inputs — always set (API key fields included but skipped if missing from plaintext config)
    const textFields = [
      ['statement', 'statement'],
      ['endpointA', 'endpointA'],
      ['apiKeyA', 'apiKeyA'],
      ['endpointB', 'endpointB'],
      ['apiKeyB', 'apiKeyB'],
      ['endpointJudge', 'endpointJudge'],
      ['apiKeyJudge', 'apiKeyJudge'],
      ['promptA', 'promptA'],
      ['promptB', 'promptB'],
      ['promptJudge', 'promptJudge'],
      ['temperature', 'temperature'],
      ['topP', 'topP'],
      ['topK', 'topK'],
      ['maxTokens', 'maxTokens'],
      ['judgeTemperature', 'judgeTemperature'],
      ['judgeTopP', 'judgeTopP'],
      ['judgeTopK', 'judgeTopK'],
      ['judgeMaxTokens', 'judgeMaxTokens']
    ];

    for (const [domId, cfgKey] of textFields) {
      const el = $(domId);
      if (!el || config[cfgKey] === undefined || config[cfgKey] === null) continue;

      // For params that weren't sent before (topP, topK, maxTokens),
      // only restore if the value differs from server defaults
      const val = config[cfgKey];
      if (cfgKey === 'topP' && (val === 1 || val === '1')) continue;
      if (cfgKey === 'topK' && (val === 0 || val === '0')) continue;
      if (cfgKey === 'maxTokens' && (val === 0 || val === '0')) continue;
      if (cfgKey === 'judgeTopP' && (val === 1 || val === '1')) continue;
      if (cfgKey === 'judgeTopK' && (val === 0 || val === '0')) continue;
      if (cfgKey === 'judgeMaxTokens' && (val === 0 || val === '0')) continue;

      el.value = config[cfgKey];
    }

    // Model selects — only set after dropdowns are populated (afterFetch = true)
    if (!afterFetch) return;

    const selectFields = [
      ['modelA', 'modelA', 'modelsA'],
      ['modelB', 'modelB', 'modelsB'],
      ['judgeModelSelect', 'modelJudge', 'modelsJudge']
    ];

    for (const [domId, cfgKey, stateKey] of selectFields) {
      const el = $(domId);
      if (el && config[cfgKey]) {
        const models = appState[stateKey] || [];
        if (models.some(m => m.id === config[cfgKey])) {
          el.value = config[cfgKey];
        }
        // If saved model isn't in fetched list, leave dropdown at default
      }
    }
  }
};
