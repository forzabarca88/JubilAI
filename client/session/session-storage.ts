/**
 * Transparent Encrypted Session Persistence (typed).
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

import { getConfig } from '../config';
import { $ } from '../dom/helpers';
import { syncStateToDom, SETUP_BINDINGS } from '../dom/bindings';
import type { AppState } from '../state/app-state';

// Fields that are safe to store in plaintext (no secrets)
const SAFE_FIELDS = [
  'statement', 'endpointA', 'endpointB', 'endpointJudge', 'modelA', 'modelB', 'modelJudge',
  'promptA', 'promptB', 'promptJudge', 'temperature', 'topP', 'topK', 'maxTokens',
  'judgeTemperature', 'judgeTopP', 'judgeTopK', 'judgeMaxTokens', 'maxTurns',
] as const;

// Fields that contain secrets (API keys) — only stored when encryption is available
const SECRET_FIELDS = ['apiKeyA', 'apiKeyB', 'apiKeyJudge'] as const;

export interface SessionData {
  version: number;
  timestamp: number;
  config: Record<string, unknown>;
  encrypted?: boolean;
}

export class SessionStorage {
  private _restoredConfig: Record<string, unknown> | null = null;

  get cryptoAvailable(): boolean {
    return typeof indexedDB !== 'undefined' && typeof crypto.subtle !== 'undefined';
  }

  // ── IndexedDB helpers ──────────────────────────────────────────

  private _openDb(): Promise<IDBDatabase> {
    const cfg = getConfig().session;
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(cfg.dbName, cfg.dbVersion);

      request.onupgradeneeded = (e: Event) => {
        const db = (e.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(cfg.dbStore)) {
          db.createObjectStore(cfg.dbStore, { keyPath: 'id' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  private async _getAesKey(): Promise<CryptoKey | null> {
    try {
      const cfg = getConfig().session;
      const db = await this._openDb();
      const tx = db.transaction(cfg.dbStore, 'readonly');
      const store = tx.objectStore(cfg.dbStore);
      const request = store.get(cfg.keyRecordId);

      return new Promise((resolve) => {
        request.onsuccess = () => {
          if ((request.result as { id: string; keyData: ArrayBuffer })?.keyData) {
            crypto.subtle.importKey('raw', (request.result as { keyData: ArrayBuffer }).keyData, 'AES-GCM', false, ['encrypt', 'decrypt'])
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
  }

  private async _ensureKey(): Promise<CryptoKey | null> {
    let key = await this._getAesKey();
    if (key) return key;

    const cfg = getConfig().session;
    const rawData = new Uint8Array(32);
    crypto.getRandomValues(rawData);

    const cryptoKey = await crypto.subtle.importKey('raw', rawData, 'AES-GCM', false, ['encrypt', 'decrypt']);

    try {
      const db = await this._openDb();
      const tx = db.transaction(cfg.dbStore, 'readwrite');
      tx.objectStore(cfg.dbStore).add({ id: cfg.keyRecordId, keyData: rawData.buffer });
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = reject;
      });
    } catch (err) {
      console.warn('[Session] Could not store key in IndexedDB:', (err as Error).message);
    }

    return cryptoKey;
  }

  // ── Encryption ─────────────────────────────────────────────────

  async encrypt(config: Record<string, unknown>): Promise<string | null> {
    const key = await this._ensureKey();
    if (!key) return null;

    const iv = new Uint8Array(12);
    crypto.getRandomValues(iv);

    const plaintext = new TextEncoder().encode(JSON.stringify({
      version: 1,
      timestamp: Date.now(),
      config,
    }));

    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      plaintext,
    );

    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ciphertext), iv.length);

    return btoa(String.fromCharCode(...combined));
  }

  async decrypt(blob: string): Promise<SessionData | null> {
    const key = await this._getAesKey();
    if (!key) return null;

    const combined = Uint8Array.from(atob(blob), c => c.charCodeAt(0));
    if (combined.byteLength < 12) return null;

    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);

    try {
      const plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        ciphertext,
      );
      return JSON.parse(new TextDecoder().decode(plaintext)) as SessionData;
    } catch {
      return null;
    }
  }

  // ── Plaintext fallback ─────────────────────────────────────────

  _stripSecrets(config: Record<string, unknown>): Record<string, unknown> {
    const safe: Record<string, unknown> = {};
    for (const field of SAFE_FIELDS) {
      if (config[field]) safe[field] = config[field];
    }
    return safe;
  }

  _savePlain(config: Record<string, unknown>): boolean {
    const cfg = getConfig().session;
    const safe = this._stripSecrets(config);
    try {
      localStorage.setItem(cfg.localStorageKeyPlain, JSON.stringify({
        version: 1,
        timestamp: Date.now(),
        encrypted: false,
        config: safe,
      }));
      return true;
    } catch (err) {
      console.warn('[Session] Plaintext save failed:', (err as Error).message);
      return false;
    }
  }

  _restorePlain(): SessionData | null {
    const cfg = getConfig().session;
    const blob = localStorage.getItem(cfg.localStorageKeyPlain);
    if (!blob) return null;

    try {
      const data = JSON.parse(blob) as SessionData;
      if (data && data.config && data.encrypted === false) return data;
    } catch {
      // Corrupted JSON
    }
    return null;
  }

  // ── Public API ─────────────────────────────────────────────────

  async save(config: Record<string, unknown>): Promise<boolean> {
    // Skip in kiosk mode — config is server-managed
    if (getConfig().kiosk.enabled) return false;

    const cfg = getConfig().session;

    if (this.cryptoAvailable) {
      try {
        const encrypted = await this.encrypt(config);
        if (!encrypted) {
          // Encryption failed, fall through to plaintext
        } else {
          localStorage.setItem(cfg.localStorageKey, encrypted);
          localStorage.removeItem(cfg.localStorageKeyPlain);
          return true;
        }
      } catch (err) {
        console.warn('[Session] Encryption failed, falling back to plaintext:', (err as Error).message);
      }
    }

    return this._savePlain(config);
  }

  async restore(): Promise<boolean> {
    // Skip in kiosk mode — config is server-managed
    if (getConfig().kiosk.enabled) return false;

    const cfg = getConfig().session;
    let data: SessionData | null = null;

    // 1. Try encrypted restore
    if (this.cryptoAvailable) {
      const blob = localStorage.getItem(cfg.localStorageKey);
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
  }

  applyModelSelections(state: AppState) {
    if (!this._restoredConfig) return;
    this._applyToDom(this._restoredConfig, true, state);
    this._restoredConfig = null;
  }

  async remove(): Promise<void> {
    const cfg = getConfig().session;
    localStorage.removeItem(cfg.localStorageKey);
    localStorage.removeItem(cfg.localStorageKeyPlain);
    try {
      const db = await this._openDb();
      const tx = db.transaction(cfg.dbStore, 'readwrite');
      tx.objectStore(cfg.dbStore).delete(cfg.keyRecordId);
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = reject;
      });
    } catch {
      // Best effort cleanup
    }
  }

  /** Apply config to DOM elements */
  _applyToDom(config: Record<string, unknown>, afterFetch: boolean, state?: AppState) {
    // Apply text/textarea inputs from config
    const textFields: [domId: string, cfgKey: string][] = [
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
      ['judgeMaxTokens', 'judgeMaxTokens'],
      ['maxTurnsDebate', 'maxTurns'],
    ];

    for (const [domId, cfgKey] of textFields) {
      const el = $(domId);
      if (!el || config[cfgKey] === undefined || config[cfgKey] === null) continue;

      const val = config[cfgKey];
      // Skip fields that represent "unset" (default values)
      if (cfgKey === 'topP' && (val === 1 || val === '1')) continue;
      if (cfgKey === 'topK' && (val === 0 || val === '0')) continue;
      if (cfgKey === 'maxTokens' && (val === 0 || val === '0')) continue;
      if (cfgKey === 'judgeTopP' && (val === 1 || val === '1')) continue;
      if (cfgKey === 'judgeTopK' && (val === 0 || val === '0')) continue;
      if (cfgKey === 'judgeMaxTokens' && (val === 0 || val === '0')) continue;

      (el as HTMLInputElement).value = String(config[cfgKey]);
    }

    // Model selects — only set after dropdowns are populated
    if (!afterFetch) return;

    const selectFields: [domId: string, cfgKey: string, stateKey: string][] = [
      ['modelA', 'modelA', 'modelsA'],
      ['modelB', 'modelB', 'modelsB'],
      ['judgeModelSelect', 'modelJudge', 'modelsJudge'],
    ];

    for (const [domId, cfgKey, stateKey] of selectFields) {
      const el = $(domId);
      if (el && config[cfgKey]) {
        const models = state?.[stateKey as keyof AppState] as unknown[];
        if (Array.isArray(models) && (models as { id: string }[]).some(m => m.id === String(config[cfgKey]))) {
          (el as HTMLSelectElement).value = String(config[cfgKey]);
        }
      }
    }
  }
}

export const sessionStorage = new SessionStorage();
