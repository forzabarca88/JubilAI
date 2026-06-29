# Plan: Persistent Debate History

## Goal

Allow users to view results of previously completed debates across server restarts, and delete them from the UI. Debates are persisted to disk on the server; a `DEBATE_FILES_DIR` environment variable can override the default storage location.

## Problem

Currently, all debates live in an in-memory `Map` (`shared/middleware/debates.ts`). A server restart wipes every debate. Users lose all history.

## Solution Overview

1. **Server**: Persist completed debates to JSON files on disk. Load them back on startup.
2. **API**: New endpoints to list saved debates and delete individual ones.
3. **Client**: A "History" overlay panel accessible from the nav bar, with view/delete actions.
4. **Config**: New `debateStorage` section in `config.json` for the default path.

---

## 1. Config Changes

### `config.json` — add `debateStorage` section

```jsonc
"debateStorage": {
  "defaultDirName": "jubilai_debates",
  "maxListCount": 50
}
```

- `defaultDirName`: the subdirectory name used under the platform-appropriate base path.
- `maxListCount`: maximum debates returned by the list endpoint (pagination guard).

### `shared/types/config.ts` — add interface

```ts
export interface DebateStorageConfig {
  defaultDirName: string;
  maxListCount: number;
}

// Add to RootConfig:
debateStorage: DebateStorageConfig;
```

### `shared/utils/config.ts` — validation

Add validation for `debateStorage.defaultDirName` (string) and `debateStorage.maxListCount` (number) to the required fields array.

### Path resolution logic (server-side)

The storage directory is resolved in this priority order:

1. `DEBATE_FILES_DIR` environment variable (if set) — used verbatim.
2. Platform default:
   - **Linux**: `~/.local/share/<defaultDirName>/`
   - **macOS**: `~/Library/Application Support/<defaultDirName>/`
   - **Windows**: `%APPDATA%\<defaultDirName>\`

Implementation: a helper `getDebateStorageDir()` in `shared/utils/debate-storage.ts` that reads the env var first, then falls back to the platform-specific path using `os.homedir()` and `config.debateStorage.defaultDirName`. The directory is auto-created on first use.

---

## 2. Server Changes

### New module: `shared/utils/debate-storage.ts`

Persistent file-based storage for completed debates.

**Exports:**
- `getDebateStorageDir(): string` — resolves the storage directory path (env var → platform default). Creates directory if missing.
- `saveDebate(debate: Debate): void` — writes `debate` as a pretty-printed JSON file at `<storageDir>/<debate.id>.json`.
- `loadDebate(id: string): Debate | null` — reads and parses `<storageDir>/<id>.json`. Returns `null` if file doesn't exist or is invalid.
- `deleteDebate(id: string): boolean` — unlink `<storageDir>/<id>.json`. Returns `true` on success, `false` if file doesn't exist.
- `listDebates(limit?: number): SavedDebateSummary[]` — scans directory for `*.json` files, parses each, returns sorted summaries (newest first). Each summary contains: `id`, `statement`, `modelA`, `modelB`, `phase`, `verdict` (truncated to 120 chars), `winner` (parsed from verdict text), `timestamp` (file mtime).
- `loadAllDebates(): Map<string, Debate>` — loads all `.json` files into a Map. Used on server startup to restore persisted debates into the in-memory store.

**Design notes:**
- Files are named `<uuid>.json` matching the debate's `id` field.
- Only **completed** debates (`phase === 'complete'`) are persisted to disk. Active/in-progress debates remain in-memory only.
- `saveDebate` is called when a debate transitions to `complete` (after verdict).
- All file I/O failures are caught and logged; never crash the server.
- Debates loaded from disk on startup are added to the in-memory `debates` Map so they're accessible via the existing `GET /api/debate/:id` endpoint.

### `shared/middleware/debates.ts` — startup loading

Add a `loadPersistedDebates()` function that calls `loadAllDebates()` and merges results into the existing `debates` Map. Called once during server initialization.

### `server/routes/debates.ts` — new endpoints + persistence hooks

**New endpoints:**

1. **`GET /api/debates`** — List all persisted debates.
   - Returns `{ debates: SavedDebateSummary[] }`.
   - Sorted by timestamp descending (newest first).
   - Capped at `config.debateStorage.maxListCount`.

2. **`GET /api/debates/:id`** — Get a persisted debate's full data.
   - Tries the in-memory `debates` Map first (for active debates).
   - Falls back to `loadDebate(id)` for completed debates not currently in memory.
   - Returns `DebateStateResponse` or 404.

3. **`DELETE /api/debates/:id`** — Delete a persisted debate.
   - Removes from in-memory Map AND disk file.
   - Returns `{ success: true }` or 404.

**Persistence hooks in existing endpoints:**

- `POST /api/debate` (create): no change. Debates start in-memory only.
- `POST /api/debate/:id/verdict` (in `routes/verdicts.ts`): after a verdict completes successfully, call `saveDebate(debate)` to persist it to disk.
- `DELETE /api/debate/:id` (existing): also call `deleteDebate(id)` to remove the disk file.

### `mock/routes/debates.ts` — mirror changes

The mock server mirrors the real server's routes. Add the same three new endpoints (`GET /api/debates`, `GET /api/debates/:id`, `DELETE /api/debates/:id`) using the same `debate-storage` module. For the mock, file persistence still works (useful for testing the UI), but the mock can also use a simpler in-memory list if preferred.

### `server/index.ts` and `mock/index.ts` — startup

After creating the Express app, call `loadPersistedDebates()` to restore debates from disk into the in-memory store before starting to listen.

---

## 3. Client Changes

### New types: `shared/types/api.ts`

Add:

```ts
export interface SavedDebateSummary {
  id: string;
  statement: string;
  modelA: string;
  modelB: string;
  phase: string;
  verdict: string | null;
  winner: string | null;
  timestamp: number;
}

export interface DebatesListResponse {
  debates: SavedDebateSummary[];
}
```

### `client/api/client.ts` — new methods

```ts
/** List all persisted debates */
async listDebates(): Promise<Response> {
  return fetch('/api/debates');
}

/** Get a single persisted debate */
async getDebateHistory(id: string): Promise<Response> {
  return fetch(`/api/debates/${id}`);
}

/** Delete a persisted debate */
async deleteDebateHistory(id: string): Promise<Response> {
  return fetch(`/api/debates/${id}`, { method: 'DELETE' });
}
```

### New module: `client/phases/history.ts`

The history feature is a **slide-out overlay panel** accessible from the nav bar. This keeps the setup phase intact (no state loss) and works cleanly on mobile.

**DOM structure** (added to `public/index.html`):

```html
<!-- History overlay panel -->
<div class="history-overlay hidden" id="historyOverlay">
  <div class="history-panel">
    <div class="history-panel-header">
      <h2 class="history-panel-title">Debate History</h2>
      <button class="btn btn-ghost btn-sm" id="btnCloseHistory">✕ Close</button>
    </div>
    <div class="history-list" id="historyList">
      <!-- populated dynamically -->
    </div>
    <div class="history-empty hidden" id="historyEmpty">
      <p>No past debates found.</p>
    </div>
  </div>
</div>
```

Each debate card in the list:
```html
<div class="history-card" data-id="...">
  <div class="history-card-header">
    <span class="history-statement">"Statement text..."</span>
    <span class="history-winner badge-affirmative">🏆 Affirmative</span>
  </div>
  <div class="history-card-meta">
    <span>Model A: llama3.1:8b</span> ·
    <span>Model B: mistral:7b</span> ·
    <span>Jun 29, 2025</span>
  </div>
  <div class="history-card-actions">
    <button class="btn btn-ghost btn-sm btn-view-debate">View</button>
    <button class="btn btn-ghost btn-sm btn-delete-debate">Delete</button>
  </div>
</div>
```

**Module exports:**

- `initHistoryPanel(state: AppState)` — binds event listeners for the overlay, close button, and delegates card interactions.
- `openHistoryPanel(state: AppState)` — fetches `/api/debates`, renders the list, shows the overlay.
- `closeHistoryPanel()` — hides the overlay.
- `viewDebate(id: string, state: AppState)` — fetches the full debate via `GET /api/debates/:id`, populates `appState` with the debate data, renders it in the verdict phase (reuses existing verdict/transcript rendering), and shows that phase.
- `deleteDebate(id: string, state: AppState)` — confirms with the user, calls `DELETE /api/debates/:id`, removes the card from the DOM, toasts success.

**Nav button:**

Added to the nav bar in `public/index.html`:
```html
<button class="btn btn-ghost btn-sm nav-history-btn" id="btnHistory">📜 History</button>
```

Placed in `nav-status` div alongside the status badge.

### `public/index.html` — additions

1. Add `#btnHistory` button in the nav bar's `nav-status` area.
2. Add the `#historyOverlay` panel (full-screen overlay with a centered panel) after `</main>`.

### `client/index.ts` — initialization

Add `initHistoryPanel(appState)` call after the other phase initializers.

---

## 4. CSS Changes (`public/css/styles.css`)

### Overlay panel

```css
/* History overlay */
.history-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: fadeIn 0.2s ease-out;
}

.history-panel {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  width: min(600px, calc(100vw - 2rem));
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 16px 64px rgba(0, 0, 0, 0.6);
}

.history-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.history-panel-title {
  font-size: 1.25rem;
  font-weight: 800;
  color: var(--accent);
}

.history-list {
  overflow-y: auto;
  padding: 1rem;
  flex: 1;
}

.history-empty {
  padding: 3rem 1rem;
  text-align: center;
  color: var(--text-dim);
  font-size: 0.95rem;
}
```

### Debate cards

```css
.history-card {
  background: var(--surface-light);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 1rem 1.25rem;
  margin-bottom: 0.75rem;
  transition: var(--transition);
}

.history-card:hover {
  border-color: var(--accent);
  box-shadow: 0 0 12px var(--accent-glow);
}

.history-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
}

.history-statement {
  font-size: 0.95rem;
  font-weight: 600;
  line-height: 1.4;
  flex: 1;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.history-winner {
  font-size: 0.7rem;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 6px;
  flex-shrink: 0;
}

.badge-affirmative {
  background: var(--affirmative-bg);
  color: var(--affirmative);
  border: 1px solid var(--affirmative);
}

.badge-negative {
  background: var(--negative-bg);
  color: var(--negative);
  border: 1px solid var(--negative);
}

.badge-none {
  background: var(--surface);
  color: var(--text-dim);
  border: 1px solid var(--border);
}

.history-card-meta {
  font-size: 0.75rem;
  color: var(--text-dim);
  font-family: 'SF Mono', monospace;
  margin-bottom: 0.75rem;
}

.history-card-actions {
  display: flex;
  gap: 0.5rem;
}

.btn-delete-debate {
  color: var(--negative);
  border-color: var(--negative);
}

.btn-delete-debate:hover {
  background: var(--negative-bg);
}

/* Nav history button */
.nav-history-btn {
  font-size: 0.8rem;
  padding: 0.35rem 0.75rem;
}
```

### Mobile responsive

```css
@media (max-width: 600px) {
  .history-panel {
    width: calc(100vw - 1rem);
    max-height: 90vh;
    border-radius: 12px;
  }

  .history-panel-header {
    padding: 1rem;
  }

  .history-panel-title {
    font-size: 1.1rem;
  }

  .history-list {
    padding: 0.75rem;
  }

  .history-card {
    padding: 0.85rem 1rem;
  }

  .history-statement {
    font-size: 0.85rem;
    -webkit-line-clamp: 1;
  }

  .history-card-meta {
    font-size: 0.7rem;
    flex-wrap: wrap;
  }

  .history-card-actions {
    flex-direction: row;
  }

  .nav-history-btn {
    font-size: 0.75rem;
    padding: 0.3rem 0.6rem;
  }
}
```

---

## 5. Implementation Order

1. **Config** — add `debateStorage` to `config.json` and `shared/types/config.ts`. ✅ DONE
2. **Storage module** — `shared/utils/debate-storage.ts` (file I/O, path resolution). ✅ DONE
3. **Server persistence** — hook `saveDebate` into verdict completion in `server/routes/verdicts.ts`; hook `deleteDebate` into `DELETE /api/debate/:id` in `server/routes/debates.ts`. ✅ DONE
4. **Server startup** — call `loadPersistedDebates()` in `server/index.ts` and `mock/index.ts`. ✅ DONE
5. **New API endpoints** — add `GET /api/debates`, `GET /api/debates/:id`, `DELETE /api/debates/:id` to `server/routes/debates.ts` (and mirror in mock). ✅ DONE (real server; mock pending)
6. **Client types** — add `SavedDebateSummary` and `DebatesListResponse` to `shared/types/api.ts`. ✅ DONE
7. **Client API** — add `listDebates`, `getDebateHistory`, `deleteDebateHistory` to `client/api/client.ts`. ✅ DONE
8. **HTML** — add `#btnHistory` in nav, add `#historyOverlay` panel. ✅ DONE
9. **CSS** — add history overlay, card, and responsive styles. ✅ DONE
10. **History module** — `client/phases/history.ts` (overlay logic, card rendering, view/delete actions). ✅ DONE
11. **Initialization** — wire `initHistoryPanel` in `client/index.ts`. ✅ DONE
12. **Mock server** — mirror new endpoints in `mock/routes/debates.ts`. ✅ DONE
13. **Test** — run `node test-e2e.mjs` to verify. ✅ PASS

---

## 6. UX Flow

### Viewing history from setup
1. User is on the setup phase.
2. Clicks "📜 History" in the nav bar.
3. A centered overlay panel slides in showing a scrollable list of past debates.
4. Each card shows: statement (clamped to 2 lines), winner badge, models, and date.
5. "View" opens the full debate in the verdict phase (transcript + verdict).
6. "Delete" shows a confirmation toast, removes the debate, and updates the list.
7. "✕ Close" dismisses the overlay, returning to the setup phase.

### Viewing a debate
Clicking "View" on a history card:
1. Fetches the full debate from `GET /api/debates/:id`.
2. Populates `appState` with the debate data (statement, models, messages, verdict).
3. Renders the verdict phase using existing `runVerdict`-style rendering (winner badge, reasoning, transcript).
4. The user can use "New Dispute" to return to setup.

### Deleting a debate
Clicking "Delete" on a history card:
1. Shows a confirmation toast: "Delete this debate? This cannot be undone."
2. On confirmation, calls `DELETE /api/debates/:id`.
3. Removes the card from the DOM with a fade-out animation.
4. Toasts success: "Debate deleted."

### Mobile
- The overlay panel takes up most of the viewport on small screens.
- Cards stack vertically with compact padding.
- Statement text clamps to 1 line on very narrow screens.
- Card action buttons remain side-by-side (flex row).
- The nav bar collapses to column layout (existing responsive CSS handles this).

---

## 7. Design Decisions & Rationale

| Decision | Rationale |
|----------|-----------|
| **Overlay panel, not a new phase** | Preserves the setup form state. Users can browse history without losing their current configuration. Feels like a quick reference, not a navigation away. |
| **Only persist completed debates** | In-progress debates are ephemeral. Persisting them would create partial/corrupt files. Completed debates are the meaningful record. |
| **JSON files, not a database** | No external dependencies. Simple to debug, backup, and inspect. Matches the lightweight nature of the app. |
| **`DEBATE_FILES_DIR` env var** | Docker deployments and custom setups can redirect storage to a mounted volume without code changes. |
| **View reuses verdict phase** | The verdict phase already renders transcripts, winner badges, and reasoning. Reusing it avoids duplicating rendering logic. |
| **Delete confirmation via toast** | Keeps it lightweight. A full modal would be overkill for a simple delete action. |
| **Load debates on startup** | Restores access to past debates immediately. The in-memory Map + disk files work as a unified store. |

---

## 8. Files Modified/Created

**New files:**
- `shared/utils/debate-storage.ts` — file-based persistence module
- `client/phases/history.ts` — history overlay panel logic

**Modified files:**
- `config.json` — add `debateStorage` section
- `shared/types/config.ts` — add `DebateStorageConfig` interface
- `shared/types/api.ts` — add `SavedDebateSummary`, `DebatesListResponse`
- `shared/utils/config.ts` — validate `debateStorage` fields
- `shared/middleware/debates.ts` — add `loadPersistedDebates()`
- `server/routes/debates.ts` — new endpoints + persistence hooks
- `server/routes/verdicts.ts` — call `saveDebate` on completion
- `server/index.ts` — call `loadPersistedDebates()` on startup
- `mock/routes/debates.ts` — mirror new endpoints
- `mock/index.ts` — call `loadPersistedDebates()` on startup
- `client/api/client.ts` — add `listDebates`, `getDebateHistory`, `deleteDebateHistory`
- `client/index.ts` — add `initHistoryPanel` call
- `client/config.ts` — add `DebateStorageConfig` to `ClientConfig` (optional, for client-side awareness)
- `public/index.html` — add nav history button + overlay panel
- `public/css/styles.css` — add history overlay/card styles + mobile responsive rules
