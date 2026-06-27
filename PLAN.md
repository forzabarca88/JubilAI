# JubilAI — Migration Plan (TypeScript + Dual Server)

> **Status**: Phase 1–5 complete with bugs. Phase 6 blocked until bugs are fixed.
> **Last reviewed**: 2026-06-27

## Phase 1: Foundation — Config + Shared Types

**Status**: ✅ COMPLETE (with minor notes)

### 1.1 Config file (`config.json`)
- [x] Created with server, client, debate, and tts sections
- [x] HTTPS endpoints, auto-advance/judge delays, TTS voice pool, worker config
- [x] `config.tts.device` = `"wasm"` (no WebGPU)

### 1.2 Shared type definitions (`shared/types/`)
- [x] `config.ts` — interfaces for all config sections
- [x] `debate.ts` — Debate, DebateCreateBody, DebateMessage, Speaker, etc.
- [x] `api.ts` — ModelInfo, SSE event types
- [x] `sse.ts` — SSEChunkEvent, SSdoneEvent (typo: double-S prefix), SSEErrorEvent, SSEEvent union
  - **Note**: `SSdoneEvent` has a double-S prefix typo. Consistent throughout codebase but wrong.

### 1.3 TypeScript configuration
- [x] Root `tsconfig.json` (shared settings: ES2022, strict mode, `paths` for `@shared/*`)
- [x] `tsconfig.server.json` (extends root, outDir: `dist/server`, Node20 target)
- [x] `tsconfig.client.json` (extends root, outDir: `dist/client`, ES2022 target)

### 1.4 Package.json — devDependencies
- [x] `typescript`, `esbuild`, `tsx` added
- [x] Build scripts added: `build`, `build:server`, `build:client`, `build:tts`
- [x] Dev scripts: `dev:server`, `dev:client`

---

## Phase 2: Shared Utilities

**Status**: ✅ COMPLETE

### 2.1 Streaming helpers (`shared/utils/streaming.ts`)
- [x] `createSSEStream` — writes SSE events to Node.js response
- [x] `writeChunk`, `writeDone`, `writeError` — SSE line formatting
- [x] `flushSSE` — force flush `_writable`
- [x] `extractFinishReason` — parse OpenAI `finish_reason`

### 2.2 Debates middleware (`shared/middleware/debates.ts`)
- [x] `createDebateStore` — `Map<string, Debate>` with UUID generation
- [x] `debateStore` — singleton export
- [x] `getDebatesMiddleware` — Express middleware, 404 on missing debate
- [x] `deleteDebate` — cleanup

### 2.3 System prompts (`shared/utils/prompts.ts`)
- [x] `SYSTEM_PROMPT_TRUE`, `SYSTEM_PROMPT_FALSE`, `SYSTEM_PROMPT_JUDGE`
- [x] Mirrors `DEFAULT_PROMPTS` from inline HTML script
- [x] Prose format enforcement, repetition penalty, brevity emphasis

---

## Phase 3: Real Server (`server/`)

**Status**: ✅ COMPLETE (with bugs)

### 3.1 Server entry point (`server/index.ts`)
- [x] Express app creation, config loading, CORS, JSON parsing
- [x] Routes mounted at `/api/*`
- [x] 404 handler, error handler, listens on `config.server.port` (3000)
- [x] Graceful shutdown (SIGINT/SIGTERM)
- [ ] **BUG**: Uses `require('./routes').default` — CommonJS `require` in a TypeScript file. Should use `import`.

### 3.2 App factory (`server/app.ts`)
- [x] `createApp(config)` — returns Express app with routes + middleware
- [ ] **BUG**: Uses `require('./routes').default` — same CommonJS issue.

### 3.3 Routes (`server/routes/`)
- [x] `index.ts` — barrel export
- [x] `debates.ts` — `POST /api/debates` (creates debate, validates), `DELETE /api/debates/:id`
- [x] `models.ts` — `GET /api/models?url=...` with retry wrapper
- [x] `turns.ts` — `POST /api/debates/:id/turns` (auto-advance, auto-judge, SSE streaming)
- [x] `verdicts.ts` — `POST /api/debates/:id/verdicts` (judge SSE streaming), `POST /api/debates/:id/judge`

### 3.4 Utilities (`server/utils/`)
- [x] `openai-client.ts` — `createClient(apiUrl, apiKey)`, `withRetry(fn)` (1 retry, 5s delay)
- [x] `prompts.ts` — re-exports from `shared/utils/prompts.ts`

---

## Phase 4: Mock Server (`mock/`)

**Status**: ✅ COMPLETE (with bugs)

### 4.1 Mock server entry (`mock/index.ts`)
- [x] Express app on port 3001, CORS, JSON parsing
- [ ] **BUG**: Uses `require('./routes').default` — CommonJS `require` in a TypeScript file.

### 4.2 Mock app factory (`mock/app.ts`)
- [x] `createMockApp()` — returns Express app with mock routes
- [ ] **BUG**: Uses `require('./routes').default` — same CommonJS issue.

### 4.3 Mock routes (`mock/routes/`)
- [x] `index.ts` — barrel export
- [x] `debates.ts` — `POST /api/debates`, `DELETE /api/debates/:id`
- [x] `models.ts` — `GET /api/models` returns `MOCK_MODELS`
- [x] `turns.ts` — `POST /api/debates/:id/turns` streams `MOCK_DEBATE_CONTENT`
- [x] `verdicts.ts` — `POST /api/debates/:id/verdicts` streams mock verdict, `POST /api/debates/:id/judge`

### 4.4 Mock data (`mock/data/mock-data.ts`)
- [x] `MOCK_MODELS` — 6 fake models (llama3, mistral, etc.)
- [x] `MOCK_DEBATE_CONTENT` — 3 turns per side + verdict (always Negative wins)

---

## Phase 5: Frontend (Client)

**Status**: ✅ COMPLETE with **6 critical bugs** that block compilation

### 5.1 Config (`client/config.ts`)
- [x] Reads `config.json`, exposes `loadConfig()` + `getConfig()`
- [x] HTTPS detection, defaults for missing values
- [x] `PromptsConfig` imported from shared types

### 5.2 State (`client/state/app-state.ts`)
- [x] `AppState` interface — debate data, models, TTS state, streaming flags
- [x] `appState` singleton export
- [x] `sessionRestored` flag, `advancedSettings`, `_activeSpeaker`

### 5.3 DOM helpers (`client/dom/helpers.ts`)
- [x] `$()` — null-safe querySelector
- [x] `showPhase()` — phase switching with active class
- [x] `showToast()` — 3s auto-dismiss toast
- [x] `scrollToBottom()`, `scrollVerdictToBottom()`

### 5.4 TTS UI (`client/dom/tts-ui.ts`)
- [x] `updateTTSEnableButton()` — syncs TTS buttons/status with state
- [x] `startTTSStatusPoll()` / `stopTTSStatusPoll()` — 500ms polling
- [ ] **BUG**: `resetPrompt` is imported by `app.ts` from this module but never exported from it. `resetPrompt` is defined in `setup.ts` (locally, not exported).

### 5.5 API client (`client/api/client.ts`)
- [x] `apiClient` singleton — `createDebate`, `nextTurn`, `verdict`, `setJudge`, `deleteDebate`, `fetchModels`
- [x] JSON response parsing helper

### 5.6 Session storage (`client/session/session-storage.ts`)
- [x] AES-256-GCM encryption (HTTPS/localhost), plaintext fallback (HTTP)
- [x] IndexedDB key storage, localStorage ciphertext
- [x] `restore()`, `save()`, `remove()`, `applyModelSelections()`
- [x] `_applyToDom()` — restores config to DOM elements, skips defaults

### 5.7 TTS manager (`client/tts/manager.ts`)
- [x] `RealtimeTTSManager` — Web Worker, sentence splitting, serial queue, pipelined playback
- [x] `useStreaming = false` — `kokoro.stream()` hangs; `generate()` used instead
- [x] Voice pool, `pickRandomVoices()`, `assignVoices()`
- [x] `feedTextChunk()`, `finishStreaming()`, `stopAudio()`, `pauseAudio()`, `resumeAudio()`, `destroy()`
- [x] Helper exports: `startDebateAudio`, `stopDebateAudio`, `pauseDebateAudio`, `resumeDebateAudio`, `feedAudioText`, `finishDebateAudio`

### 5.8 TTS worker (`client/tts/worker.ts`)
- [x] Kokoro model loading from CDN (`kokoro-js@1.2.1`)
- [x] ONNX Runtime Web multi-threading config
- [x] `init`, `generate`, `stream-generate`, `stop` message handlers
- [x] ArrayBuffer transfer (zero-copy)

### 5.9 Setup phase (`client/phases/setup.ts`)
- [x] `fetchModelsFor(panel)` — panel config map, model fetching, readiness checks
- [x] `checkSetupReady()` — enables start button when all fields filled
- [x] `gatherAdvancedSettings()` — reads advanced settings from DOM
- [x] `initSetupPhase()` — event binding, session restore, debate start
- [ ] **BUG 1**: `gatherAdvancedSettings` has a syntax error on line 182 — `judgeTopK: ... : undefined;` uses a semicolon instead of comma inside an object literal. Breaks TypeScript compilation.
- [ ] **BUG 2**: Uses `startDebateAudio(state)`, `stopDebateAudio(state)`, `updateTTSEnableButton(state)` without importing them.
- [ ] **BUG 3**: Uses `resetPrompt('A', ...)` etc. on lines 227-231 but `resetPrompt` is never defined or imported in this file. It exists only in the inline `<script>` of `index.html`.
- [ ] **BUG 4**: Calls `initDebatePhase(state)` on line 413 but doesn't import it from `./debate`.
- [ ] **BUG 5**: Uses `marked.parse()` on lines 548/556 without importing `marked`. No `global.d.ts` declares it.
- [ ] **BUG 6**: Circular dependency — `setup.ts` calls `initDebatePhase` from `debate.ts`, and `debate.ts` imports `renderDebateProgress`, `updateDebateStatus`, `showRetryTurn`, `hideRetryTurn` from `./setup`.

### 5.10 Debate phase (`client/phases/debate.ts`)
- [x] `executeNextTurn()` — SSE streaming, TTS integration, auto-advance
- [x] `initDebatePhase()` — event binding (abort, retry)
- [x] Imports `renderDebateProgress`, `updateDebateStatus`, `showRetryTurn`, `hideRetryTurn` from `./setup` (creates circular dependency — see setup bugs)
- [ ] **BUG**: Uses `marked.parse()` without importing `marked`.

### 5.11 Judge-select phase (`client/phases/judge-select.ts`)
- [x] `transitionToJudgeSelect()` — shows judge-select UI, pre-fills endpoint
- [x] `fetchModelsForJudgeSelect()` — reads from `*2` DOM elements (not setup-phase elements)
- [x] `initJudgeSelectPhase()` — event binding, calls `runVerdict` after judge setup

### 5.12 Verdict phase (`client/phases/verdict.ts`)
- [x] `runVerdict()` — judge SSE streaming, winner parsing, transcript rendering
- [x] `renderTranscript()` — debate messages display
- [x] `exportMarkdown()` — markdown file download
- [x] `initVerdictPhase()` — event binding (transcript toggle, export, retry)
- [ ] **BUG 1**: References `ttsManager.initialize()` on line 52 but `ttsManager` is not imported. Imports helper functions from `../tts/manager` but not the class itself.
- [ ] **BUG 2**: Uses `marked.parse()` in 6 places without importing `marked`.

### 5.13 App (`client/app.ts`)
- [x] `resetToSetup()` — clears all state/DOM, resets session flag, destroys TTS
- [x] `initApp()` — binds new debate buttons
- [ ] **BUG**: `import { resetPrompt } from '../dom/tts-ui'` — `resetPrompt` is not exported from `tts-ui.ts`. Causes build failure.

### 5.14 Entry point (`client/index.ts`)
- [x] Imports all modules, calls `loadConfig()`, initializes all phases
- [x] Clean, modular initialization

---

## Phase 6: Build System + Polish

**Status**: ⏳ BLOCKED — must fix Phase 5 bugs first

### 6.1 Build scripts
- [ ] `npm run build:client` — esbuild `client/index.ts` → `public/js/bundle.js` (bundle mode)
- [ ] `npm run build:tts` — esbuild `client/tts/worker.ts` → `public/js/tts-worker.js` (IIFE, `--format=iife`, `--define:TTS_MODEL_ID=...`)
- [ ] `npm run build:server` — `tsc -p tsconfig.server.json` → `dist/server/`
- [ ] `npm run build` — runs server + client + tts builds in sequence

### 6.2 Cleanup old files
- [ ] Remove old `src/` directory (JS real server)
- [ ] Remove old `mock/src/` directory (JS mock server)
- [ ] Remove old `public/js/` files: `api.js`, `app.js`, `dom-helpers.js`, `state.js`, `session-storage.js`, `tts-manager.js`, `tts-worker.js`, `phases/`
- [ ] Remove inline `<script>` block from `public/index.html` (contains old JS globals: `toggleTTSEnable`, `pauseDebateAudioAndUI`, `resumeDebateAudioAndUI`, `updateTTSEnableButton`, `toggleAdvancedSettings`, `resetPrompt`, `gatherAdvancedSettings`, `DEFAULT_PROMPTS`, `DOMContentLoaded` init)
- [ ] Update `public/index.html`: remove old script tags, keep only `<script src="js/bundle.js">` and `<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js">`

### 6.3 Global type declarations
- [ ] Create `client/global.d.ts` — declare `marked` global (loaded via CDN), declare inline globals (`appState`, `$`, `showToast`, `ttsManager`, etc.) if any remain on window

### 6.4 Start scripts
- [ ] `npm start` — runs `dist/server/index.js` (real server)
- [ ] `npm run mock` — runs `dist/mock/index.js` (mock server)
- [ ] `npm run dev:server` — `tsx watch server/index.ts`
- [ ] `npm run dev:client` — `esbuild client/index.ts --bundle --outfile=public/js/bundle.js --watch`

---

## Bugs to Fix Before Phase 6

### Critical (blocks compilation)

1. **`setup.ts:182`** — Semicolon instead of comma in `gatherAdvancedSettings` object literal: `judgeTopK: ... : undefined;` → should be `,`
2. **`setup.ts`** — Missing imports: `startDebateAudio`, `stopDebateAudio`, `updateTTSEnableButton` from `../tts/manager` and `../dom/tts-ui`
3. **`setup.ts:227-231`** — `resetPrompt` referenced but not defined/imported in this file. Must either define it locally or import from wherever it belongs.
4. **`setup.ts:413`** — Calls `initDebatePhase(state)` without importing from `./debate`
5. **`setup.ts`, `debate.ts`, `verdict.ts`** — Use `marked.parse()` without importing `marked` or declaring it globally
6. **`app.ts:10`** — `import { resetPrompt } from '../dom/tts-ui'` — `resetPrompt` not exported from `tts-ui.ts`
7. **`verdict.ts:52`** — References `ttsManager` without importing it from `../tts/manager`
8. **Circular dependency** — `setup.ts` → `debate.ts` → `setup.ts` (via `renderDebateProgress`, `updateDebateStatus`, `showRetryTurn`, `hideRetryTurn`)

### Minor (cosmetic / consistency)

9. **`server/app.ts`, `mock/app.ts`** — Use `require('./routes').default` instead of `import`
10. **`shared/types/sse.ts`** — `SSDoneEvent` has double-S prefix typo (consistent throughout but wrong)

---

## Recommended Fix Order

1. Fix `setup.ts:182` semicolon → comma
2. Add missing imports to `setup.ts` (TTS helpers)
3. Define `resetPrompt` in `setup.ts` (move from inline HTML) and export it
4. Import `resetPrompt` from `./setup` in `app.ts` (fix wrong import path)
5. Import `initDebatePhase` in `setup.ts` from `./debate`
6. Break circular dependency: move `renderDebateProgress`, `updateDebateStatus`, `showRetryTurn`, `hideRetryTurn` to a shared module (e.g., `client/dom/debate-ui.ts`)
7. Add `global.d.ts` for `marked` OR add `import { parse } from 'marked'` to each file that uses it (CDN-loaded, so use global declaration)
8. Import `ttsManager` in `verdict.ts` from `../tts/manager`
9. Fix `require()` → `import` in `server/app.ts` and `mock/app.ts`
10. Fix `SSDoneEvent` → `SSDoneEvent` (rename consistently) or leave as-is (cosmetic)

After all bugs are fixed, proceed to Phase 6.
