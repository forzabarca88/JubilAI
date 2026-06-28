# JubilAI — Migration Plan (TypeScript + Dual Server)

> **Status**: Phase 1–5 complete. All critical bugs fixed. TypeScript compilation clean. Phase 6 ready to proceed.
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
- [x] `sse.ts` — SSEChunkEvent, SSEDoneEvent (was `SSdoneEvent`, renamed), SSEErrorEvent, SSEEvent union
  - [x] **FIXED**: Renamed `SSdoneEvent` → `SSEDoneEvent` (fixed double-S typo). Updated all references across codebase.

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

**Status**: ✅ COMPLETE

### 3.1 Server entry point (`server/index.ts`)
- [x] Express app creation, config loading, CORS, JSON parsing
- [x] Routes mounted at `/api/*`
- [x] 404 handler, error handler, listens on `config.server.port` (3000)
- [x] Graceful shutdown (SIGINT/SIGTERM)
- [x] **FIXED**: `require('./routes').default` → `import routes from './routes'`

### 3.2 App factory (`server/app.ts`)
- [x] `createApp(config)` — returns Express app with routes + middleware
- [x] **FIXED**: `require('./routes').default` → `import routes from './routes'`

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

**Status**: ✅ COMPLETE

### 4.1 Mock server entry (`mock/index.ts`)
- [x] Express app on port 3001, CORS, JSON parsing
- [x] **FIXED**: `require('./routes').default` → `import routes from './routes'`

### 4.2 Mock app factory (`mock/app.ts`)
- [x] `createMockApp()` — returns Express app with mock routes
- [x] **FIXED**: `require('./routes').default` → `import routes from './routes'`

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

**Status**: ✅ COMPLETE (all bugs fixed, TypeScript compilation clean)

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
- [x] **FIXED**: `resetPrompt` import removed from `app.ts` (moved to `./phases/setup`). Fixed private property access `_pendingGenerations` → added `pendingGenerationsCount` getter on manager.

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
- [x] **FIXED**: Added `AppState` import. Added `pendingGenerationsCount` getter for safe access to `_pendingGenerations`. Fixed `webkitAudioContext` null-safety and `audioContext` non-null assertions with explicit guards.

### 5.8 TTS worker (`client/tts/worker.ts`)
- [x] Kokoro model loading from CDN (`kokoro-js@1.2.1`)
- [x] ONNX Runtime Web multi-threading config
- [x] `init`, `generate`, `stream-generate`, `stop` message handlers
- [x] ArrayBuffer transfer (zero-copy)
- [x] **FIXED**: Added proper type declarations in `global.d.ts` for CDN dynamic import, build-time defines (`TTS_MODEL_ID`, `TTS_DTYPE`, `TTS_DEVICE`), `KokoroTTS` constructor, `KokoroInstance`, `RawAudio`, and `WorkerGlobalScope.postMessage`. Replaced `any` types with proper typed references. Added `send()` helper to bypass DOM `postMessage` overload mismatch in worker context.

### 5.9 Setup phase (`client/phases/setup.ts`)
- [x] `fetchModelsFor(panel)` — panel config map, model fetching, readiness checks
- [x] `checkSetupReady()` — enables start button when all fields filled
- [x] `gatherAdvancedSettings()` — reads advanced settings from DOM
- [x] `initSetupPhase()` — event binding, session restore, debate start
- [x] **FIXED BUG 1**: Semicolon → comma on `judgeTopK` line in `gatherAdvancedSettings` object literal
- [x] **FIXED BUG 2**: Added imports for `startDebateAudio`, `stopDebateAudio`, `updateTTSEnableButton` from `../tts/manager` and `../dom/tts-ui`
- [x] **FIXED BUG 3**: Defined `resetPrompt` locally in `setup.ts` and exported it
- [x] **FIXED BUG 4**: Added import for `initDebatePhase` from `./debate`
- [x] **FIXED BUG 5**: Created `client/global.d.ts` with `marked` type declarations, included in `tsconfig.client.json`
- [x] **FIXED BUG 6**: Extracted `renderDebateProgress`, `updateDebateStatus`, `showRetryTurn`, `hideRetryTurn` into `client/dom/debate-ui.ts` to break circular dependency
- [x] **FIXED**: `config` import path corrected from `../config` → `./config` (relative to `client/phases/`)
- [x] **FIXED**: `.value`/`.error` type mismatches fixed via explicit DOM casts (`as HTMLInputElement`)
- [x] **FIXED**: `null` → `undefined` for optional string fields in `DebateCreateBody`

### 5.10 Debate phase (`client/phases/debate.ts`)
- [x] `executeNextTurn()` — SSE streaming, TTS integration, auto-advance
- [x] `initDebatePhase()` — event binding (abort, retry)
- [x] Imports `renderDebateProgress`, `updateDebateStatus`, `showRetryTurn`, `hideRetryTurn` from `../dom/debate-ui` (circular dependency resolved)
- [x] **FIXED**: Added missing imports for phase transitions (`transitionToJudgeSelect`, `runVerdict`) and `marked` global via `global.d.ts`
- [x] **FIXED**: Added `error` property to `SSDoneEvent` type in `shared/types/sse.ts`
- [x] **FIXED**: Corrected `DebateCreateBody` import path to `../../shared/types/debate`
- [x] **FIXED**: Removed unused `LLMDefaults` import

### 5.11 Judge-select phase (`client/phases/judge-select.ts`)
- [x] `transitionToJudgeSelect()` — shows judge-select UI, pre-fills endpoint
- [x] `fetchModelsForJudgeSelect()` — reads from `*2` DOM elements (not setup-phase elements)
- [x] `initJudgeSelectPhase()` — event binding, calls `runVerdict` after judge setup
- [x] **FIXED**: Added import for `runVerdict` from `./verdict`
- [x] **FIXED**: `.value`/`.error` type mismatches fixed via explicit DOM casts (`as HTMLInputElement`)
- [x] **FIXED**: `ErrorResponse` casts use `as unknown as ErrorResponse` to avoid TS2352

### 5.12 Verdict phase (`client/phases/verdict.ts`)
- [x] `runVerdict()` — judge SSE streaming, winner parsing, transcript rendering
- [x] `renderTranscript()` — debate messages display
- [x] `exportMarkdown()` — markdown file download
- [x] `initVerdictPhase()` — event binding (transcript toggle, export, retry)
- [x] **FIXED BUG 1**: Added `ttsManager` import from `../tts/manager`
- [x] **FIXED BUG 2**: `marked.parse()` resolved via `global.d.ts`
- [x] **FIXED**: Added null guards for `querySelector` results (cast to `HTMLElement | null`)
- [x] **FIXED**: Event handler functions wrapped to satisfy `EventListener` type

### 5.13 App (`client/app.ts`)
- [x] `resetToSetup()` — clears all state/DOM, resets session flag, destroys TTS
- [x] `initApp()` — binds new debate buttons
- [x] **FIXED**: `resetPrompt` import corrected to `./phases/setup` (was `../dom/tts-ui`)
- [x] **FIXED**: Added missing `type AppState` import from `./state/app-state`
- [x] **FIXED**: Removed unused import
- [x] **FIXED**: `config` import path corrected from `../config` → `./config`

### 5.14 Entry point (`client/index.ts`)
- [x] Imports all modules, calls `loadConfig()`, initializes all phases
- [x] Clean, modular initialization

---

## Phase 6: Build System + Polish

**Status**: ⏳ READY (all Phase 5 bugs resolved, compilation clean)

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
- [x] Created `client/global.d.ts` — declares `marked` global (CDN), `Window.webkitAudioContext`, build-time defines (`TTS_MODEL_ID`, `TTS_DTYPE`, `TTS_DEVICE`), `KokoroTTS`/`KokoroInstance`/`RawAudio` types, `WorkerGlobalScope.postMessage` augmentation, and CDN dynamic import module declaration

### 6.4 Start scripts
- [ ] `npm start` — runs `dist/server/index.js` (real server)
- [ ] `npm run mock` — runs `dist/mock/index.js` (mock server)
- [ ] `npm run dev:server` — `tsx watch server/index.ts`
- [ ] `npm run dev:client` — `esbuild client/index.ts --bundle --outfile=public/js/bundle.js --watch`

---

## Bugs to Fix Before Phase 6

### Critical (blocks compilation) — ✅ ALL FIXED

1. [x] **`setup.ts:182`** — Semicolon → comma in `gatherAdvancedSettings` object literal
2. [x] **`setup.ts`** — Added missing imports: `startDebateAudio`, `stopDebateAudio`, `updateTTSEnableButton` from `../tts/manager` and `../dom/tts-ui`
3. [x] **`setup.ts:227-231`** — Defined `resetPrompt` locally in `setup.ts` and exported it
4. [x] **`setup.ts:413`** — Added import for `initDebatePhase` from `./debate`
5. [x] **`setup.ts`, `debate.ts`, `verdict.ts`** — Created `client/global.d.ts` with `marked` type declarations, included in `tsconfig.client.json`
6. [x] **`app.ts:10`** — Fixed `resetPrompt` import path to `./phases/setup`; removed unused import; added `type AppState` import
7. [x] **`verdict.ts:52`** — Added `ttsManager` import from `../tts/manager`; added null guards and event handler wrappers
8. [x] **Circular dependency** — Extracted `renderDebateProgress`, `updateDebateStatus`, `showRetryTurn`, `hideRetryTurn` into `client/dom/debate-ui.ts`; both `setup.ts` and `debate.ts` now import from shared module

### Minor (cosmetic / consistency) — ✅ ALL FIXED

9. [x] **`server/app.ts`, `mock/app.ts`** — `require('./routes').default` → `import routes from './routes'`
10. [x] **`shared/types/sse.ts`** — Renamed `SSdoneEvent` → `SSEDoneEvent`; added `error` property to `SSDoneEvent` type; updated all references across codebase

### Additional fixes applied

- [x] **`client/tts/manager.ts`** — Added `AppState` import; added `pendingGenerationsCount` getter; fixed `webkitAudioContext` null-safety; fixed `audioContext` non-null assertions with explicit guards; fixed private property access in `feedAudioText`
- [x] **`client/tts/worker.ts`** — Added proper type declarations in `global.d.ts` for CDN dynamic import, build-time defines, `KokoroTTS`, `KokoroInstance`, `RawAudio`, `WorkerGlobalScope.postMessage`; replaced `any` types with typed references; added `send()` helper to bypass DOM `postMessage` overload mismatch
- [x] **`client/dom/tts-ui.ts`** — Fixed private property access `_pendingGenerations` → `pendingGenerationsCount` getter
- [x] **`client/phases/judge-select.ts`** — Fixed `ErrorResponse` casts to use `as unknown as ErrorResponse`; fixed `.value`/`.error` type mismatches via DOM casts; added import for `runVerdict`
- [x] **`client/phases/debate.ts`** — Fixed `DebateCreateBody` import path; removed unused `LLMDefaults` import; added phase transition imports; cast `querySelector` results to `HTMLElement`
- [x] **`client/phases/setup.ts`** — Fixed `.value`/`.error` type mismatches via DOM casts; fixed `null` → `undefined` for optional string fields; corrected `config` import path
- [x] **`client/app.ts`** — Corrected `config` import path from `../config` → `./config`

---

## Recommended Fix Order

All steps completed. TypeScript compilation passes cleanly for both client (`tsconfig.client.json`) and server (`tsconfig.server.json`). Phase 6 is ready to proceed.
10. Fix `SSDoneEvent` → `SSDoneEvent` (rename consistently) or leave as-is (cosmetic)

After all bugs are fixed, proceed to Phase 6.
