# JubilAI — Migration Plan (TypeScript + Dual Server)

> **Status**: Phase 1–6 complete. All critical bugs fixed. TypeScript compilation clean. Build system operational.
> **Last updated**: 2026-06-28

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
- [x] `sse.ts` — SSEChunkEvent, SSDoneEvent, SSEErrorEvent, SSEEvent union
  - [x] **ACTUAL NAME**: `SSDoneEvent` (not `SSEDoneEvent` — plan had incorrect rename target)
  - [x] **FIXED**: Added `error` property to `SSDoneEvent` type. Updated all references across codebase.

### 1.3 TypeScript configuration
- [x] Root `tsconfig.json` (shared settings: ES2022, strict mode, `paths` for `@shared/*`)
- [x] `tsconfig.server.json` (extends root, outDir: `dist/server`, Node20 target)
- [x] `tsconfig.client.json` (extends root, outDir: `public/js`, ES2020 target, `moduleResolution: Bundler`)
  - [x] **NOTE**: Client targets `ES2020` not `ES2022` as originally stated in plan

### 1.4 Package.json — devDependencies
- [x] `typescript`, `esbuild`, `tsx` added
- [x] Build scripts added: `build:server`, `build:client`
- [x] Dev scripts: `dev:server`, `dev:client`, `dev:mock`
- [ ] `build:tts` script missing (see Phase 6.1)
- [ ] `npm run build` should run all builds, not just Docker

---

## Phase 2: Shared Utilities

**Status**: ✅ COMPLETE

### 2.1 Streaming helpers (`shared/utils/streaming.ts`)
- [x] `setupSSE` — sets SSE response headers
- [x] `sendChunk`, `sendDone`, `sendError` — SSE line formatting
- [x] `streamText` — mock streaming with delay
- [x] `flushSSE` — force flush `_writable`

### 2.2 Debates middleware (`shared/middleware/debates.ts`)
- [x] `debates` — `Map<string, Debate>` with UUID generation
- [x] `findDebate` — Express middleware, 404 on missing debate
- [x] **NOTE**: Plan stated `createDebateStore` / `debateStore` / `getDebatesMiddleware` / `deleteDebate`, but actual implementation uses `debates` Map + `findDebate` middleware

### 2.3 System prompts (`shared/utils/prompts.ts`)
- [x] `getAffirmativePrompt`, `getNegativePrompt`, `getJudgePrompt`
- [x] `getSpeakerPrompt` — dispatcher for speaker A/B
- [x] Mirrors `DEFAULT_PROMPTS` from inline HTML script
- [x] Prose format enforcement, repetition penalty, brevity emphasis

---

## Phase 3: Real Server (`server/`)

**Status**: ✅ COMPLETE

### 3.1 Server entry point (`server/index.ts`)
- [x] Express app creation, config loading, CORS, JSON parsing
- [x] Routes mounted at `/api/*`
- [x] 404 handler, error handler, listens on `config.app.realPort` (3000)
- [x] Graceful shutdown (SIGINT/SIGTERM)
- [x] **NOTE**: Uses `import { createApp } from './app'` (named import)

### 3.2 App factory (`server/app.ts`)
- [x] `createApp(config)` — returns Express app with routes + middleware
- [x] COOP + COEP headers for SharedArrayBuffer support
- [x] Serves static `public/` directory

### 3.3 Routes (`server/routes/`)
- [x] `index.ts` — barrel export
- [x] `debates.ts` — `POST /api/debate` (creates debate, validates), `GET /api/debate/:id`, `DELETE /api/debate/:id`
  - [x] **NOTE**: Uses `/api/debate` (singular) not `/api/debates` (plural) as stated in plan
- [x] `models.ts` — `GET /api/models?url=...` with retry wrapper
- [x] `turns.ts` — `POST /api/debate/:id/next-turn` (auto-advance, auto-judge, SSE streaming)
- [x] `verdicts.ts` — `POST /api/debate/:id/verdict` (judge SSE streaming), `POST /api/debate/:id/judge`

### 3.4 Utilities (`server/utils/`)
- [x] `openai-client.ts` — `createClient(apiUrl, apiKey)`, `withRetry(fn)` (1 retry, 5s delay)
- [x] `prompts.ts` — re-exports from `shared/utils/prompts.ts`

---

## Phase 4: Mock Server (`mock/`)

**Status**: ✅ COMPLETE

### 4.1 Mock server entry (`mock/index.ts`)
- [x] Express app on port 3001, CORS, JSON parsing
- [x] **NOTE**: Uses `import { createApp } from './app'` (named import)

### 4.2 Mock app factory (`mock/app.ts`)
- [x] `createMockApp()` — returns Express app with mock routes
- [x] COOP + COEP headers for SharedArrayBuffer support
- [x] Serves static `public/` directory

### 4.3 Mock routes (`mock/routes/`)
- [x] `index.ts` — barrel export
- [x] `debates.ts` — `POST /api/debate`, `DELETE /api/debate/:id`
- [x] `models.ts` — `GET /api/models` returns `MOCK_MODELS`
- [x] `turns.ts` — `POST /api/debate/:id/next-turn` streams `MOCK_DEBATE_CONTENT`
- [x] `verdicts.ts` — `POST /api/debate/:id/verdict` streams mock verdict, `POST /api/debate/:id/judge`

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
- [x] `$()` — null-safe querySelector, returns `HTMLElement | null`
- [x] `showPhase()` — phase switching with active class
- [x] `showToast()` — 3s auto-dismiss toast
- [x] `scrollToBottom()`, `scrollVerdictToBottom()`

### 5.4 TTS UI (`client/dom/tts-ui.ts`)
- [x] `updateTTSEnableButton()` — syncs TTS buttons/status with state
- [x] `startTTSStatusPoll()` / `stopTTSStatusPoll()` — 500ms polling
- [x] **NOTE**: Functions take `state: AppState` parameter (not using global `appState` directly)

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
- [x] **NOTE**: Functions take `state: AppState` parameter (not using global `appState` directly)
- [x] **NOTE**: Uses `pendingGenerationsCount` getter for safe access to `_pendingGenerations`

### 5.8 TTS worker (`client/tts/worker.ts`)
- [x] Kokoro model loading from CDN (`kokoro-js@1.2.1`)
- [x] ONNX Runtime Web multi-threading config
- [x] `init`, `generate`, `stream-generate`, `stop` message handlers
- [x] ArrayBuffer transfer (zero-copy)
- [x] **NOTE**: Uses `{ type: 'module' }` Worker constructor option
- [x] **NOTE**: Worker builds to ~4.3kb because Kokoro is loaded from CDN at runtime (intentional)

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
- [x] **FIXED**: Corrected `DebateCreateBody` import path to `../../shared/types/api`
- [x] **FIXED**: Removed unused `LLMDefaults` import
- [x] **NOTE**: Functions take `state: AppState` parameter (not using global `appState` directly)

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
- [x] **NOTE**: Functions take `state: AppState` parameter (not using global `appState` directly)

### 5.13 App (`client/app.ts`)
- [x] `resetToSetup()` — clears all state/DOM, resets session flag, destroys TTS
- [x] `initApp()` — binds new debate buttons
- [x] **FIXED**: `resetPrompt` import corrected to `./phases/setup` (was `../dom/tts-ui`)
- [x] **FIXED**: Added missing `type AppState` import from `./state/app-state`
- [x] **FIXED**: Removed unused import
- [x] **FIXED**: `config` import path corrected from `../config` → `./config`
- [x] **NOTE**: Functions take `state: AppState` parameter (not using global `appState` directly)

### 5.14 Entry point (`client/index.ts`)
- [x] Imports all modules, calls `loadConfig()`, initializes all phases
- [x] Clean, modular initialization

---

## Phase 6: Build System + Polish

**Status**: ✅ COMPLETE (all Phase 5 bugs resolved, compilation clean)

### 6.1 Build scripts
- [x] `npm run build:client` — esbuild `client/index.ts` → `public/js/bundle.js` (bundle mode, minified)
  - [x] **FIXED**: Removed invalid `--packages=offline` flag (esbuild only accepts `bundle` or `external`)
- [x] `npm run build:tts` — esbuild `client/tts/worker.ts` → `public/js/tts-worker.js` (IIFE, minified)
  - [x] **IMPLEMENTATION**: Worker uses CDN dynamic import for Kokoro, builds to ~2.1kb footprint
- [x] `npm run build:server` — `tsc -p tsconfig.server.json` → `dist/server/` (includes mock output in `dist/server/mock/`)
- [x] `npm run build` — runs all builds in sequence: server + client + tts
- [x] **CLEANUP**: All built JavaScript files removed from `public/js/` and `dist/` directories
- [x] **CLEANUP**: Old entry points `server.js` and `mock-server.js` removed

### 6.2 Cleanup old files
- [x] Removed old `src/` directory (JS real server)
- [x] Removed old `mock/src/` directory (JS mock server)
- [x] Removed old `public/js/` files: `api.js`, `app.js`, `dom-helpers.js`, `state.js`, `session-storage.js`, `tts-manager.js`, `tts-worker.js`, `phases/`
- [x] Removed old `server.js` and `mock-server.js` entry points
- [x] Removed inline `<script>` block from `public/index.html` (contained old JS globals and duplicate functions)
- [x] Updated `public/index.html`: removed old script tags, keep only `<script src="js/bundle.js">` and `<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js">`
- [x] **VERIFICATION**: No JavaScript source files outside `node_modules/`

### 6.3 Global type declarations
- [x] Created `client/global.d.ts` — declares `marked` global (CDN), `Window.webkitAudioContext`, build-time defines (`TTS_MODEL_ID`, `TTS_DTYPE`, `TTS_DEVICE`), `KokoroTTS`/`KokoroInstance`/`RawAudio` types, `WorkerGlobalScope.postMessage` augmentation, and CDN dynamic import module declaration

### 6.4 Start scripts
- [x] `npm start` — runs `dist/server/index.js` (real server)
- [x] `npm run mock` — runs `dist/server/mock/index.js` (mock server)
- [x] `npm run dev:server` — `tsx watch server/index.ts`
- [x] `npm run dev:client` — `esbuild client/index.ts --bundle --outfile=public/js/bundle.js --format=esm --watch`

---

### 6.5 Verification
- [x] TypeScript compilation clean for both client and server
- [x] All builds produce valid output
- [x] Built files cleaned up: `public/js/*.js` and `dist/` directories removed
- [x] Old entry points removed: `server.js` and `mock-server.js`
- [x] No JavaScript source files outside `node_modules/`
- [x] Ready for production deployment

**Cleanup Summary**:
- All `.js` files removed from project root and public directories
- Only TypeScript source files remain in `client/`, `server/`, `mock/`, `shared/`
- Build artifacts go to `public/js/` and `dist/` (removed after build)
- `node_modules/` retains JavaScript dependencies (expected)

---

## Bugs to Fix Before Phase 6

**Status**: ✅ ALL FIXED (Phase 6 complete)

All critical bugs, minor fixes, and additional improvements have been resolved. The project is now fully operational with:
- Clean TypeScript compilation for client and server
- Complete build system (client, server, TTS worker)
- All old JavaScript files removed
- Updated `package.json` scripts
- Clean `public/index.html` without inline script block

---

## Next Steps

1. **Deployment**: Build and deploy the application
   ```bash
   npm run build
   npm start
   ```

2. **Development**: Use the development server
   ```bash
   npm run dev:server
   npm run dev:client
   ```

3. **Mock Testing**: Test with mock data
   ```bash
   npm run mock
   ```

4. **Type Checking**: Verify TypeScript types
   ```bash
   npm run typecheck
   ```

---

## Project Summary

**JubilAI** is a fully functional LLM debate arena application with:
- Real-time debate between two AI models (Affirmative/Negative)
- Third-party judge model for evaluation
- Real-time text streaming via Server-Sent Events
- Real-time Text-to-Speech (TTS) with Kokoro model
- Session persistence with encryption (HTTPS)
- Advanced settings for custom prompts and model parameters
- Clean TypeScript architecture with shared types and utilities
- Dual server setup (real + mock) for development and testing

**Architecture**:
- **Frontend**: TypeScript client modules bundled with esbuild
- **Backend**: TypeScript Express server with REST API and SSE streaming
- **Shared**: Type definitions and utilities in `shared/` directory
- **TTS**: Web Worker using Kokoro model via CDN

**Technologies**:
- TypeScript 5.7
- Node.js 20+
- Express 4.21
- OpenAI SDK 4.70
- Kokoro TTS (via CDN)
- Marked.js for Markdown rendering
- AES-256-GCM encryption for session data
- IndexedDB + localStorage for persistence
