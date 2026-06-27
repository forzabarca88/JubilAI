/**
 * Transparent Encrypted Session Persistence
 *
 * Two-layer storage: IndexedDB (encryption key) + localStorage (encrypted data).
 * AES-256-GCM authenticated encryption. Zero UI, zero prompts, zero user interaction.
 *
 * All failures are silent (console.warn only). The app always degrades gracefully.
 */
const appSession = {
  DB_NAME: 'jubilai_storage',
  DB_VERSION: 1,
  DB_STORE: 'keys',
  KEY_RECORD_ID: 'aes_key',
  LS_KEY: 'jubilai_session',

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

  /**
   * Encrypt config and store in localStorage. Returns true on success.
   */
  async save(config) {
    if (typeof indexedDB === 'undefined' || typeof crypto.subtle === 'undefined') {
      console.warn('[Session] IndexedDB or Web Crypto unavailable — skipping save');
      return false;
    }

    try {
      const encrypted = await this.encrypt(config);
      if (!encrypted) return false;

      localStorage.setItem(this.LS_KEY, encrypted);
      return true;
    } catch (err) {
      console.warn('[Session] Save failed:', err.message);
      return false;
    }
  },

  /**
   * Load from localStorage, decrypt, and auto-fill DOM fields.
   * Returns true if a session was successfully restored.
   * Text inputs are filled immediately; model selects are filled
   * after fetchModelsFor populates the dropdowns (via _applyToDom(config, true)).
   */
  async restore() {
    if (typeof indexedDB === 'undefined' || typeof crypto.subtle === 'undefined') {
      console.warn('[Session] IndexedDB or Web Crypto unavailable — skipping restore');
      return false;
    }

    const blob = localStorage.getItem(this.LS_KEY);
    if (!blob) return false;

    const decrypted = await this.decrypt(blob);
    if (!decrypted || !decrypted.config) {
      console.warn('[Session] Decryption failed or invalid data');
      return false;
    }

    // Apply text inputs immediately; model selects deferred to after fetch
    this._applyToDom(decrypted.config, false);

    // Store config for post-fetch model selection
    this._restoredConfig = decrypted.config;

    return true;
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
   * Clear both IndexedDB key and localStorage data.
   */
  async remove() {
    localStorage.removeItem(this.LS_KEY);
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
   * Apply decrypted config to DOM elements.
   * Text inputs are set immediately. Model selects are set only
   * if `afterFetch` is true (i.e., dropdowns are already populated).
   */
  _applyToDom(config, afterFetch = false) {
    // Text inputs — always set
    const textFields = [
      ['statement', 'statement'],
      ['endpointA', 'endpointA'],
      ['apiKeyA', 'apiKeyA'],
      ['endpointB', 'endpointB'],
      ['apiKeyB', 'apiKeyB'],
      ['endpointJudge', 'endpointJudge'],
      ['apiKeyJudge', 'apiKeyJudge']
    ];

    for (const [domId, cfgKey] of textFields) {
      const el = $(domId);
      if (el && config[cfgKey]) {
        el.value = config[cfgKey];
      }
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
  },

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
  }
};
