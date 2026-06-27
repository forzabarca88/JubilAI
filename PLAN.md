# JubilAI TypeScript Refactor — Implementation Plan

> **Goal**: Convert the entire codebase to TypeScript, eliminate duplication, centralize all configuration, and restructure modules for optimal separation of concerns.
>
> **Scope**: Server (real + mock), Frontend, shared types, and configuration. CSS and HTML remain largely unchanged (design is not in scope).

---

## 1. Problems Identified

### 1.1 Hardcoded Configuration Values (Scattered, No Single Source of Truth)

| Constant | Location(s) | Value |
|---|---|---|
| `maxTurns` | `src/routes/debates.js`, `public/js/state.js` | `3` |
| Default debater temperature | `src/routes/turns.js`, `public/index.html` | `0.7` |
| Default judge temperature | `src/routes/verdicts.js`, `public/index.html` | `0.5` |
| Default API key | `src/utils/openai-client.js`, `src/routes/debates.js`, `mock/src/routes/debates.js`, `mock/src/routes/verdicts.js` | `'ollama'` |
| Retry delay | `src/utils/openai-client.js` | `5000` ms |
| Real server port | `server.js` | `3000` |
| Mock server port | `mock-server.js` | `3001` |
| TTS model ID | `public/js/tts-manager.js`, `public/js/tts-worker.js` | `'onnx-community/Kokoro-82M-v1.0-ONNX'` |
| TTS dtype | `public/js/tts-manager.js`, `public/js/tts-worker.js` | `'q4'` |
| TTS device | `public/js/tts-manager.js`, `public/js/tts-worker.js` | `'wasm'` |
| TTS voice pool | `public/js/tts-manager.js` | 28 voices |
| TTS worker timeout | `public/js/tts-manager.js` | `120000` ms |
| TTS sentence buffer cap | `public/js/tts-manager.js` | `5000` chars |
| TTS streaming chunk size | `mock/src/utils/streaming.js` | `3` chars |
| TTS streaming delay | `mock/src/utils/streaming.js` | `15` ms |
| Toast auto-dismiss | `public/js/dom-helpers.js` | `3000` ms |
| Debate auto-advance delay | `public/js/phases/debate.js` | `1500` ms |
| Judge auto-transition delay | `public/js/phases/debate.js` | `1000` ms |
| Session DB name/version | `public/js/session-storage.js` | `'jubilai_storage'` / `1` |
| Session localStorage keys | `public/js/session-storage.js` | `'jubilai_session'`, `'jubilai_session_plain'` |
| System prompts (TRUE/FALSE/JUDGE) | `src/utils/prompts.js` AND `public/index.html` inline script | Identical text duplicated |

### 1.2 Duplication Between Real and Mock Servers

| Shared Concern | Real (`src/`) | Mock (`mock/src/`) |
|---|---|---|
| Express app setup (CORS, JSON, COOP/COEP, static) | `src/app.js` | `mock/src/app.js` — **identical** |
| Debate middleware (Map + findDebate) | `src/middleware/debates.js` | `mock/src/middleware/debates.js` — **identical** |
| Route index (mounts models, debates, turns, verdicts) | `src/routes/index.js` | `mock/src/routes/index.js` — **identical** |
| SSE streaming helpers | `src/utils/streaming.js` | `mock/src/utils/streaming.js` — **different API but same purpose** |
| Debate CRUD routes | `src/routes/debates.js` | `mock/src/routes/debates.js` — **nearly identical structure** (mock lacks advanced settings) |

### 1.3 Suboptimal Frontend Module Structure

- **Global namespace pollution**: `appState`, `appApi`, `appSession`, `ttsManager`, `showPhase`, `showToast`, `$`, `DEFAULT_PROMPTS`, etc. are all global variables.
- **Inline `<script>` block in `index.html`**: Contains `toggleTTSEnable`, `pauseDebateAudioAndUI`, `resumeDebateAudioAndUI`, `updateTTSEnableButton`, `toggleAdvancedSettings`, `resetPrompt`, `gatherAdvancedSettings`, `DEFAULT_PROMPTS`, and `DOMContentLoaded` init — mixing UI logic, config, and init hooks in one massive block.
- **`onclick` HTML attributes**: `toggleTTSEnable()`, `pauseDebateAudioAndUI()`, `resumeDebateAudioAndUI()`, `toggleAdvancedSettings()`, `resetPrompt('A')` etc. are wired via HTML `onclick` rather than `addEventListener` in JS.
- **TTS status polling**: `startTTSStatusPoll`/`stopTTSStatusPoll` are globals that poll every 500ms — fragile and not encapsulated.
- **`resetToSetup()` in `app.js`**: 80+ lines of DOM manipulation resetting every field individually — should be a state-driven reset.
- **`fetchModelsFor(panel)` in `setup.js`**: Uses string-based panel dispatch (`'A' | 'B' | 'Judge'`) to map to DOM element IDs — fragile, not type-safe.

### 1.4 Missing Type Safety

All code is plain JavaScript. No type checking at compile time. Runtime errors from typos, wrong shapes, or null references are common (e.g., `$()` null-guard pattern used everywhere).

---

## 2. Target Architecture

```
jubilAI/
├── config/
│   └── config.json              # Single source of truth for all config values
├── shared/
│   ├── types/
│   │   ├── debate.ts            # Debate, Message, Phase, Speaker types
│   │   ├── api.ts               # Request/response types for all API endpoints
│   │   ├── config.ts            # TypeScript interface for config.json
│   │   └── sse.ts               # SSE event types (ChunkEvent, DoneEvent, ErrorEvent)
│   ├── utils/
│   │   ├── streaming.ts         # SSE helpers (setupSSE, sendChunk, sendDone, sendError)
│   │   └── config.ts            # Config loader + typed accessors
│   └── middleware/
│       └── debates.ts           # In-memory Map store + findDebate middleware
├── server/
│   ├── index.ts                 # Entry point (replaces server.js)
│   ├── app.ts                   # Express app factory (replaces src/app.js)
│   ├── routes/
│   │   ├── index.ts             # Router assembly
│   │   ├── debates.ts           # Debate CRUD (uses shared middleware + types)
│   │   ├── models.ts            # Model fetching via OpenAI client
│   │   ├── turns.ts             # Debate turn execution (SSE streaming)
│   │   └── verdicts.ts          # Judge verdict (SSE streaming)
│   └── utils/
│       ├── openai-client.ts     # OpenAI client factory + retry wrapper
│       └── prompts.ts           # System prompt definitions (from config)
├── mock/
│   ├── index.ts                 # Entry point (replaces mock-server.js)
│   ├── app.ts                   # Shares server/app.ts pattern
│   ├── routes/
│   │   ├── index.ts             # Router assembly
│   │   ├── debates.ts           # Mock debate CRUD (same interface, mock data)
│   │   ├── models.ts            # Mock model list (from config)
│   │   ├── turns.ts             # Mock turn streaming (hardcoded content)
│   │   └── verdicts.ts          # Mock verdict streaming
│   └── data/
│       └── mock-data.ts         # Mock models + debate content (from config)
├── client/
│   ├── index.ts                 # Compiled output → public/js/bundle.js
│   ├── config.ts                # Client-side config (loads config.json at runtime)
│   ├── state/
│   │   └── app-state.ts         # Typed state class (replaces global appState)
│   ├── dom/
│   │   ├── helpers.ts           # Typed DOM utilities ($, showPhase, showToast, scroll)
│   │   └── tts-ui.ts            # TTS button/status UI logic (extracted from inline script)
│   ├── api/
│   │   └── client.ts            # Typed API wrapper (replaces global appApi)
│   ├── session/
│   │   └── session-storage.ts   # Encrypted session persistence (restructured)
│   ├── tts/
│   │   ├── manager.ts           # RealtimeTTSManager class (restructured)
│   │   └── worker.ts            # Web Worker (remains mostly as-is, typed)
│   ├── phases/
│   │   ├── setup.ts             # Setup phase (typed, event listeners via addEventListener)
│   │   ├── debate.ts            # Debate phase (typed)
│   │   ├── judge-select.ts      # Judge-select phase (typed)
│   │   └── verdict.ts           # Verdict phase (typed)
│   └── app.ts                   # Reset-to-setup + DOMContentLoaded init
├── public/
│   ├── index.html               # Same HTML, script tags updated to compiled output
│   ├── css/styles.css           # Unchanged
│   └── js/
│       └── bundle.js            # Compiled frontend output
├── package.json
├── tsconfig.json                # Root TypeScript config
├── tsconfig.server.json         # Server TS config (Node target)
├── tsconfig.client.json         # Client TS config (ES2020 target, bundling)
└── PLAN.md
```

### Key Architectural Decisions

1. **`shared/` directory**: Code used by both real and mock servers (types, SSE helpers, debate middleware, config). This eliminates duplication between `src/` and `mock/src/`.

2. **`config.json`**: Single source of truth. Both server and client read from it. The server reads at startup; the client fetches it at runtime via `/config.json`.

3. **`server/` and `mock/` directories**: Replace `src/` and `mock/src/`. Both import from `shared/` for common types and utilities.

4. **`client/` directory**: TypeScript source for the frontend. Compiled to `public/js/bundle.js` (single bundle via esbuild or tsup). Replaces all current `public/js/*.js` files and the inline `<script>` block.

5. **No more global variables**: Frontend uses a module-based architecture with explicit imports. State is encapsulated in classes.

---

## 3. Configuration File (`config.json`)

```jsonc
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "app": {
    "name": "JubilAI",
    "realPort": 3000,
    "mockPort": 3001,
    "host": "0.0.0.0"
  },
  "debate": {
    "maxTurns": 3,
    "defaultApiKey": "ollama",
    "autoAdvanceDelayMs": 1500,
    "autoJudgeDelayMs": 1000,
    "retryDelayMs": 5000,
    "winnerPattern": "Winner:\\s*(The\\s+(Affirmative|Negative))"
  },
  "llm": {
    "debaterDefaults": {
      "temperature": 0.7,
      "topP": null,
      "topK": null,
      "maxTokens": null
    },
    "judgeDefaults": {
      "temperature": 0.5,
      "topP": null,
      "topK": null,
      "maxTokens": null
    }
  },
  "prompts": {
    "affirmative": "You are a debater arguing that the following statement is TRUE...\n\nFORMAT: Write your response as a formal debate speech — continuous prose in paragraph form...\n\nIMPORTANT: Be concise and succinct...\n\nCRITICAL: Do not repeat the same point or argument...",
    "negative": "You are a debater arguing that the following statement is FALSE...\n\nFORMAT: Write your response as a formal debate speech — continuous prose in paragraph form...\n\nIMPORTANT: Be concise and succinct...\n\nCRITICAL: Do not repeat the same point or argument...",
    "judge": "You are an impartial judge evaluating a debate between two sides...\n\nFORMAT EVALUATION: Proper debate speeches are delivered as continuous prose...\n\nPoints made succinctly and with fewer words will be favored..."
  },
  "tts": {
    "modelId": "onnx-community/Kokoro-82M-v1.0-ONNX",
    "dtype": "q4",
    "device": "wasm",
    "workerTimeoutMs": 120000,
    "sentenceBufferCap": 5000,
    "statusPollIntervalMs": 500,
    "voicePool": [
      "af_alloy", "af_aoede", "af_bella", "af_heart", "af_jessica",
      "af_kore", "af_nicole", "af_nova", "af_river", "af_sarah", "af_sky",
      "am_adam", "am_echo", "am_eric", "am_fenrir", "am_liam",
      "am_michael", "am_onyx", "am_puck", "am_santa",
      "bf_alice", "bf_emma", "bf_isabella", "bf_lily",
      "bm_daniel", "bm_fable", "bm_george", "bm_lewis"
    ]
  },
  "session": {
    "dbName": "jubilai_storage",
    "dbVersion": 1,
    "dbStore": "keys",
    "keyRecordId": "aes_key",
    "localStorageKey": "jubilai_session",
    "localStorageKeyPlain": "jubilai_session_plain"
  },
  "ui": {
    "toastAutoDismissMs": 3000,
    "phases": ["phase-setup", "phase-debate", "phase-judge-select", "phase-verdict"]
  },
  "mock": {
    "streamChunkSize": 3,
    "streamDelayMs": 15,
    "modelFetchDelayMs": 200,
    "turnGenerationDelayMs": 300,
    "verdictGenerationDelayMs": 400,
    "models": [
      "llama3.1:8b", "mistral:7b", "gemma:7b",
      "qwen2.5:7b", "phi3:3.8b", "deepseek-coder-v2:16b"
    ]
  }
}
```

> **Note**: The full prompt text for `prompts.affirmative`, `prompts.negative`, and `prompts.judge` will contain the complete multi-line prompt strings currently in `src/utils/prompts.js` and `public/index.html`. The JSON value will use `\n` for line breaks.

---

## 4. Migration Plan — Phase by Phase

### Phase 1: Foundation (Config + Shared Types)

**Deliverables**:
1. Create `config.json` with all hardcoded values extracted.
2. Create `shared/types/config.ts` — TypeScript interface matching `config.json` structure.
3. Create `shared/utils/config.ts` — Config loader that reads `config.json`, validates against the interface, and exports a typed `Config` singleton.
4. Create `shared/types/debate.ts` — Types: `Debate`, `Message`, `DebatePhase`, `Speaker`, `LLMParams`, `JudgeLLMParams`, `DebateCreateRequest`, `DebateResponse`.
5. Create `shared/types/api.ts` — Types for all API request/response shapes.
6. Create `shared/types/sse.ts` — Types: `SSEChunkEvent`, `SSDoneEvent`, `SSEErrorEvent`, `SSEEvent` (union).
7. Create `tsconfig.json`, `tsconfig.server.json`, `tsconfig.client.json`.
8. Update `package.json` with TypeScript tooling (`typescript`, `esbuild` or `tsup`, dev scripts).

**Files removed**: None yet (old JS files remain until Phase 3-4).

### Phase 2: Shared Utilities

**Deliverables**:
1. Create `shared/utils/streaming.ts` — Unified SSE helpers (`setupSSE`, `sendChunk`, `sendDone`, `sendError`) typed with `Express.Response` and SSE event types. Replaces both `src/utils/streaming.js` and `mock/src/utils/streaming.js`.
2. Create `shared/middleware/debates.ts` — Typed in-memory `Map<string, Debate>` store + `findDebate` middleware. Replaces both `src/middleware/debates.js` and `mock/src/middleware/debates.js`.
3. Create `shared/utils/prompts.ts` — Reads prompts from `Config.prompts`. Exports `getAffirmativePrompt()`, `getNegativePrompt()`, `getJudgePrompt()` functions that return config values (or fallback defaults embedded as constants).

### Phase 3: Real Server

**Deliverables**:
1. Create `server/index.ts` — Entry point. Reads config, creates app, listens on `config.app.realPort`. Replaces `server.js`.
2. Create `server/app.ts` — Express app factory with CORS, JSON parsing, COOP/COEP headers, static file serving, and `/api` route mounting. Replaces `src/app.js`.
3. Create `server/routes/index.ts` — Router assembly. Replaces `src/routes/index.js`.
4. Create `server/routes/debates.ts` — Debate CRUD. Uses shared middleware + types. All defaults from config. Replaces `src/routes/debates.js`.
5. Create `server/routes/models.ts` — Model fetching via typed OpenAI client. Replaces `src/routes/models.js`.
6. Create `server/routes/turns.ts` — Debate turn execution with SSE streaming. All defaults from config. Replaces `src/routes/turns.js`.
7. Create `server/routes/verdicts.ts` — Judge verdict with SSE streaming. All defaults from config. Replaces `src/routes/verdicts.js`.
8. Create `server/utils/openai-client.ts` — Typed client factory + retry wrapper. Defaults from config. Replaces `src/utils/openai-client.js`.
9. Create `server/utils/prompts.ts` — Re-exports from `shared/utils/prompts.ts`.

**Files removed after completion**: All files under `src/` directory.

### Phase 4: Mock Server

**Deliverables**:
1. Create `mock/index.ts` — Entry point. Reads config, creates app, listens on `config.app.mockPort`. Replaces `mock-server.js`.
2. Create `mock/app.ts` — Same pattern as `server/app.ts` but serves from `../../public`. Imports shared middleware.
3. Create `mock/routes/index.ts` — Router assembly. Replaces `mock/src/routes/index.js`.
4. Create `mock/routes/debates.ts` — Mock debate CRUD. Same interface as real, uses shared middleware. Replaces `mock/src/routes/debates.js`.
5. Create `mock/routes/models.ts` — Returns mock models from config. Replaces `mock/src/routes/models.js`.
6. Create `mock/routes/turns.ts` — Mock turn streaming using shared SSE helpers. Replaces `mock/src/routes/turns.js`.
7. Create `mock/routes/verdicts.ts` — Mock verdict streaming using shared SSE helpers. Replaces `mock/src/routes/verdicts.js`.
8. Create `mock/data/mock-data.ts` — Mock debate content (hardcoded arguments + verdict). Mock model list from config. Replaces `mock/src/utils/mock-data.js`.

**Files removed after completion**: All files under `mock/src/` directory.

### Phase 5: Frontend (Client)

**Deliverables**:

1. **`client/config.ts`** — Fetches `config.json` at runtime. Exports typed config. Used by all client modules. Replaces hardcoded values in `state.js`, `tts-manager.js`, `session-storage.js`, `dom-helpers.js`, and the inline `DEFAULT_PROMPTS` in `index.html`.

2. **`client/state/app-state.ts`** — Class-based state management. Replaces global `appState` object. Properties are typed. Includes `reset()` method.

3. **`client/dom/helpers.ts`** — Typed DOM utilities. `$()` returns `HTMLElement | null`. `showPhase()` uses config for phase list. `showToast()` uses config for dismiss delay. Replaces `dom-helpers.js`.

4. **`client/dom/tts-ui.ts`** — Extracts TTS UI logic from inline `<script>` in `index.html`. Functions: `toggleTTSEnable()`, `pauseDebateAudioAndUI()`, `resumeDebateAudioAndUI()`, `updateTTSEnableButton()`, `startTTSStatusPoll()`, `stopTTSStatusPoll()`. Uses config for poll interval.

5. **`client/api/client.ts`** — Typed API client class. Replaces global `appApi` object. Methods return typed responses.

6. **`client/session/session-storage.ts`** — Restructured session persistence class. Typed. Config-driven DB names and keys. Replaces `session-storage.js`.

7. **`client/tts/manager.ts`** — Typed `RealtimeTTSManager` class. Voice pool, model ID, dtype, device, timeouts all from config. Replaces `tts-manager.js`. Exports singleton + helper functions.

8. **`client/tts/worker.ts`** — Typed Web Worker. Model ID, dtype, device from config. **Special handling**: Workers use dynamic `import()` from CDN, so this file is compiled differently (kept as a module worker, config values inlined at build time). Replaces `tts-worker.js`.

9. **`client/phases/setup.ts`** — Typed setup phase module. Uses `addEventListener` instead of HTML `onclick`. `fetchModelsFor` typed with `Panel` enum (`'A' | 'B' | 'Judge'`). `DEFAULT_PROMPTS` comes from config. `gatherAdvancedSettings()` reads DOM into typed settings object. Replaces `setup.js` and inline `DEFAULT_PROMPTS`/`toggleAdvancedSettings`/`resetPrompt`/`gatherAdvancedSettings` from `index.html`.

10. **`client/phases/debate.ts`** — Typed debate phase module. Auto-advance delay from config. Replaces `debate.js`.

11. **`client/phases/judge-select.ts`** — Typed judge-select phase module. Replaces `judge-select.js`.

12. **`client/phases/verdict.ts`** — Typed verdict phase module. Replaces `verdict.js`.

13. **`client/app.ts`** — `resetToSetup()` method on `AppState` class. DOMContentLoaded init. Replaces `app.js`.

14. **`client/index.ts`** — Root entry point. Imports all modules, wires up event listeners, triggers `DOMContentLoaded` init. Compiled to `public/js/bundle.js`.

**HTML changes**:
- `public/index.html`: Remove all `onclick` attributes. Remove inline `<script>` block entirely. Replace all `<script src="js/...">` tags with a single `<script src="js/bundle.js"></script>`.

**Files removed after completion**: All files under `public/js/` directory (except compiled `bundle.js` and `tts-worker.js` output).

### Phase 6: Build System + Polish

**Deliverables**:
1. **`tsconfig.json`** — Base config with strict TypeScript settings.
2. **`tsconfig.server.json`** — Extends base. Target: `ES2020`, module: `NodeNext`, outDir: `dist/server`.
3. **`tsconfig.client.json`** — Extends base. Target: `ES2020`, module: `ES2020`, outDir: `public/js`.
4. **Build scripts in `package.json`**:
   - `build:server` — `tsc -p tsconfig.server.json`
   - `build:client` — `esbuild client/index.ts --bundle --outfile=public/js/bundle.js --loader:.worker.js=copy`
   - `build` — runs both
   - `start` — `node dist/server/index.js` (replaces `node server.js`)
   - `dev:server` — `tsx watch server/index.ts`
   - `mock` — `node dist/mock/index.js` (replaces `node mock-server.js`)
   - `dev:mock` — `tsx watch mock/index.ts`
   - `typecheck` — `tsc --noEmit -p tsconfig.server.json && tsc --noEmit -p tsconfig.client.json`
5. **`public/js/tts-worker.js`** — Worker file compiled separately (esbuild with `--format=iife` or kept as-is with dynamic imports). Config values inlined at build time via esbuild `--define`.

---

## 5. What Remains Unchanged

- **`public/css/styles.css`** — CSS is not JavaScript/TypeScript. No changes needed.
- **`public/index.html`** — Structure and classes remain. Only script tags and `onclick` attributes are modified.
- **Kokoro-js CDN imports** — TTS worker still imports from CDN. This is a runtime dependency, not a build concern.
- **`marked` library** — Still loaded from CDN in HTML.

---

## 6. Expected Outcomes

| Metric | Before | After |
|---|---|---|
| Language | JavaScript | TypeScript (strict mode) |
| Config sources | 15+ hardcoded locations | 1 (`config.json`) |
| Duplicate files | 6 (app×2, middleware×2, streaming×2, routes index×2) | 0 (shared/) |
| Global variables | 8+ (`appState`, `appApi`, `appSession`, `ttsManager`, `$`, etc.) | 0 (module imports) |
| Inline HTML script | ~120 lines in `index.html` | 0 (moved to `client/`) |
| `onclick` attributes | 10+ | 0 (addEventListener) |
| Frontend source files | 10 JS files + inline script | 13 TS files → 1 bundle |
| Type safety | None | Full (strict TS compiler) |

---

## 7. Implementation Order

1. **Phase 1**: Config + shared types (foundation)
2. **Phase 2**: Shared utilities (SSE, middleware, prompts)
3. **Phase 3**: Real server rewrite
4. **Phase 4**: Mock server rewrite
5. **Phase 5**: Frontend rewrite
6. **Phase 6**: Build system + integration testing

Each phase must compile and pass basic verification before proceeding to the next.

---

## 8. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| TTS worker dynamic imports from CDN break with bundler | Keep worker as separate output; use esbuild `--format=iife` or copy loader |
| kokoro-js types not available | Use `@ts-ignore` or declare module for CDN imports; or install `kokoro-js` as npm dependency for types |
| Config JSON schema validation at runtime | Include runtime assertion in `shared/utils/config.ts` to validate shape |
| Frontend bundle size | Use tree-shaking; TTS worker is separate; marked stays as CDN |
| Breaking existing functionality | Each phase tested incrementally; old JS files kept until new TS replaces them |
| Session storage encryption (Web Crypto) | TypeScript types for `CryptoKey`, `SubtleCrypto` are built-in |
