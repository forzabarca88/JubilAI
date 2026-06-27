# Plan: Transparent Encrypted Session Persistence

## Goal
Auto-save the user's last configuration (endpoints, API keys, models) and auto-restore it on subsequent visits — **zero new UI, zero prompts, zero user interaction required.**

## Threat Model
- **Primary threat**: Unauthorized read access to browser storage (another user of the same machine, malicious local scripts, browser extensions)
- **Not a threat**: Network interception (same-origin only), cross-site reads (origin-scoped storage)
- **Acceptable risk**: XSS on this page could access both storage mechanisms; AES-GCM encryption mitigates plaintext exposure

## Cryptographic Design

### Two-Layer Storage: IndexedDB (Key) + localStorage (Data)

The core insight: **split the key and the ciphertext across two different storage mechanisms** with different access surfaces.

| Component | Storage | Security Property |
|-----------|---------|-------------------|
| Encryption key | **IndexedDB** | Origin-scoped. Not accessible to other sites. Not accessible across browser profiles. |
| Encrypted config | **localStorage** | Widely accessible (extensions, dev tools), but useless without the IndexedDB key |

### Encryption Scheme: AES-256-GCM
- **Cipher**: AES-GCM (authenticated encryption — detects tampering automatically)
- **Key**: 256-bit random key generated via `crypto.getRandomValues(32)` on first save
- **IV**: 12-byte random IV per encryption (GCM standard)
- **Key derivation**: None needed — raw random key, no PBKDF2, no passphrase

### Why this works transparently
1. On first debate start, generate a random AES key, store it in IndexedDB
2. Encrypt the session config, store ciphertext in localStorage
3. On every subsequent page load, silently: load key from IndexedDB → decrypt localStorage → auto-fill form fields
4. On every subsequent debate start: re-encrypt and update localStorage with latest config

No dialogs, no passphrases, no buttons added. The user just opens the page and their settings are there.

### Security rationale
- **localStorage alone** is trivially readable (dev tools, extensions) → unsafe for API keys
- **IndexedDB alone** is origin-scoped but can be slow for simple key-value access → better for the key
- **Split approach**: An attacker who can read localStorage still needs IndexedDB access (origin-scoped). An attacker who can access IndexedDB (e.g., via XSS) gets the key, but GCM authentication detects any ciphertext tampering
- **Browser profile isolation**: Each browser profile has its own IndexedDB and localStorage. Sibling users on the same OS can't cross-read

## Data Saved

The encrypted session object:

```json
{
  "version": 1,
  "timestamp": 1719456000000,
  "config": {
    "statement": "...",
    "endpointA": "http://localhost:11434",
    "apiKeyA": "ollama",
    "modelA": "llama3.1:8b",
    "endpointB": "http://localhost:11434",
    "apiKeyB": "ollama",
    "modelB": "mistral:7b",
    "endpointJudge": "http://localhost:11434",
    "apiKeyJudge": "ollama",
    "modelJudge": "gemma:7b"
  }
}
```

Fields saved: `statement`, `endpointA`, `apiKeyA`, `modelA`, `endpointB`, `apiKeyB`, `modelB`, `endpointJudge`, `apiKeyJudge`, `modelJudge`.

## User Experience

### First Visit
1. User sees the normal setup form — all fields empty
2. User fills fields, clicks "Commence Debate" — **no save prompt appears**
3. After successful debate creation, session is silently saved (encryption + storage happens in background)

### Return Visit
1. On page load, the app silently: opens IndexedDB → loads key → reads localStorage → decrypts → auto-fills all form fields → populates model dropdowns via `fetchModelsFor()`
2. User sees their previous config already filled in — **no prompt, no dialog, no interaction needed**
3. If the user modifies fields and starts a new debate, the session is silently updated

### Session Overwrite
- Each new debate start overwrites the saved session with the latest config
- Only one session is saved at a time (the most recent)

## File Structure

### New Files
| File | Purpose |
|------|---------|
| `public/js/session-storage.js` | Core module: IndexedDB key management, AES-GCM encrypt/decrypt, auto-restore on load, auto-save on debate start |

### Modified Files
| File | Changes |
|------|---------|
| `public/js/state.js` | Add `sessionRestored` flag (internal, no UI) |
| `public/js/phases/setup.js` | On `initSetupPhase()`: call `appSession.restore()` to auto-fill. On debate start: call `appSession.save()` after successful creation. |
| `public/js/app.js` | `resetToSetup()`: clear `sessionRestored` flag (so next visit re-restores) |
| `public/index.html` | Add script tag for `js/session-storage.js` in load order. **No new HTML elements.** |
| `public/css/styles.css` | No changes needed |

### Load Order (Updated)
Scripts in `public/index.html`:
1. `js/state.js`
2. `js/dom-helpers.js`
3. `js/api.js`
4. **`js/session-storage.js`** (new — must load before setup.js)
5. `js/tts-manager.js`
6. `js/phases/setup.js`
7. `js/phases/debate.js`
8. `js/phases/judge-select.js`
9. `js/phases/verdict.js`
10. `js/app.js`

## Implementation Details

### `session-storage.js` — Global `appSession` Object

```
appSession = {
  // Constants
  DB_NAME: 'jubilai_storage',
  DB_VERSION: 1,
  DB_STORE: 'keys',
  KEY_RECORD_ID: 'aes_key',
  LS_KEY: 'jubilai_session',

  // Core functions
  _getAesKey()              → Promise<CryptoKey>  // load from IndexedDB, generate if missing
  _ensureKey()              → Promise<CryptoKey>  // generate + store if not exists
  async encrypt(config)     → string              // AES-GCM encrypt, return base64(ciphertext + iv)
  async decrypt(blob)       → Promise<object>     // AES-GCM decrypt, return parsed JSON or throw
  async save(config)        → Promise<boolean>    // encrypt config + localStorage.setItem
  async restore()           → Promise<boolean>    // load from localStorage + decrypt + auto-fill DOM
  remove()                  → Promise<void>       // clear both IndexedDB key and localStorage

  // Auto-fill helper
  _applyToDom(config)       → void               // set DOM field values, populate dropdowns
}
```

### IndexedDB Schema
```
Database: 'jubilai_storage' v1
  Store: 'keys' (keyPath: 'id')
    Record: { id: 'aes_key', keyData: <ArrayBuffer of raw 32-byte key> }
```

The raw key is stored as `ArrayBuffer`. On restore, it's imported via `crypto.subtle.importKey('raw', keyData, 'AES-GCM', ...)` to get a `CryptoKey`.

### Encryption Format (localStorage value)
The stored string is base64-encoded concatenation of: `IV (12 bytes) || ciphertext`. GCM authentication tag is included in the ciphertext by the Web Crypto API.

### `setup.js` Changes

**On `initSetupPhase()`** (at the end of the function):
```js
// Transparent session restore — no UI, no prompts
appSession.restore().then(restored => {
  if (restored) {
    appState.sessionRestored = true;
    checkSetupReady();  // re-evaluate button readiness with pre-filled fields
  }
}).catch(err => {
  console.warn('[Session] Restore failed:', err.message);
  // Silently fail — user starts with empty form, no toast shown
});
```

**On debate start** (inside `btnStartDebate.onclick`, after successful `createDebate()`):
```js
// Silently save current config for next visit
const saveConfig = {
  statement,
  endpointA: $('endpointA')?.value.trim().replace(/\/+$/, '') || '',
  apiKeyA: $('apiKeyA')?.value.trim() || '',
  modelA: $('modelA')?.value || '',
  endpointB: $('endpointB')?.value.trim().replace(/\/+$/, '') || '',
  apiKeyB: $('apiKeyB')?.value.trim() || '',
  modelB: $('modelB')?.value || '',
  endpointJudge: endpointJudge || '',
  apiKeyJudge: apiKeyJudge || '',
  modelJudge: judgeModel || '',
};
appSession.save(saveConfig).catch(err => {
  console.warn('[Session] Save failed:', err.message);
});
```

### `app.js` Changes

**`resetToSetup()`**:
- Add `appState.sessionRestored = false` at the beginning
- No other changes needed — `resetToSetup()` already clears all form fields, which is correct behavior

### Auto-Fill Logic (`_applyToDom`)
After decryption, the config is applied to DOM elements:
- Text inputs (`endpointA`, `apiKeyA`, `endpointB`, `apiKeyB`, `endpointJudge`, `apiKeyJudge`, `statement`) → set `.value`
- Selects (`modelA`, `modelB`, `judgeModelSelect`) → set `.value` (dropdowns are already populated from cached `appState.modelsA/B/Judge` or will be repopulated by `fetchModelsFor()` calls)
- After filling all fields, call `checkSetupReady()` to enable the start button

For model selects: if the saved model exists in the fetched models list, select it. If the saved endpoint is used to fetch models and the saved model isn't in the results (e.g., model was deleted from the server), leave dropdown at default.

## Edge Cases & Error Handling

| Scenario | Behavior |
|----------|----------|
| First visit (no IndexedDB key) | `restore()` returns `false` silently. Form stays empty. Key is created on first debate start. |
| IndexedDB unavailable (private browsing) | `restore()` returns `false` silently. Form stays empty. Save is skipped. |
| Web Crypto API unavailable (old browser) | Module logs warning, all operations are no-ops. App functions normally without persistence. |
| Decryption fails (corrupted data) | `restore()` returns `false` silently. Form stays empty. Logged to console. |
| localStorage quota exceeded | `save()` catches error, logs to console, silently fails. |
| `resetToSetup()` called | Clears `sessionRestored` flag. Next page load will re-restore from saved session. |
| User changes config mid-session | Not saved until next debate start. Only completed debates trigger save. |
| Mock server mode | Session save/restore still works (stores mock config). Useful for testing. |

**Key design decision**: All failures are silent (console.warn only, no toasts). The app always degrades gracefully — if session features fail, the user just sees an empty form and proceeds normally.

## AGENTS.md Updates Required After Implementation

After implementing this plan, update AGENTS.md with:
1. New file `public/js/session-storage.js` in the Frontend Module Loading Order section
2. New `appSession` global object description (IndexedDB key + localStorage ciphertext, transparent auto-restore/save)
3. Note that `initSetupPhase()` calls `appSession.restore()` for silent auto-fill
4. Note that debate start triggers silent `appSession.save()`
5. Note that `resetToSetup()` clears `sessionRestored` flag
6. No new DOM elements to document (zero UI changes)
