# Core Guidelines

- When modifying existing files, avoid rewriting unless `edit` fails 3+ times.
- After every change, review whether AGENTS.md needs updating. This file MUST be minimal and considered an index for critical project information only.
- The .references directory may contain documentation about specific topics, check this for relevant material when implemented or debugging features.
- **Always verify changes with `node test-e2e.mjs`** — runs a full debate flow against the mock server via Playwright.

# Architecture

## Build System (TypeScript + esbuild)
- **Server**: `tsc -p tsconfig.server.json` → `dist/server/` (Node20 target)
- **Client**: `esbuild client/index.ts --bundle` → `dist/js/bundle.js` (minified ESM)
- **TTS Worker**: `esbuild client/tts/worker.ts --bundle --format=esm` → `dist/js/tts-worker.js` (Kokoro loaded from CDN at runtime, ~1.4kb footprint)
- `npm run build` runs all three in sequence. All built artifacts go into `dist/` (git-ignored).

## Dual Server
- **Real**: `server/index.ts` → `dist/server/server/index.js` (port 3000) — OpenAI-compatible endpoints
- **Mock**: `mock/index.ts` → `dist/server/mock/index.js` (port 3001) — hardcoded content for UI validation
- Both serve the same `public/` frontend. `npm start` (real) or `npm run mock`.
- Dev: `tsx watch server/index.ts` or `tsx watch mock/index.ts`

## Source Directories
- `client/` — TypeScript frontend modules, bundled by esbuild into single `bundle.js`
- `server/` — TypeScript Express server (real, connects to LLM endpoints)
- `mock/` — TypeScript mock server (hardcoded responses for UI testing)
- `shared/` — Shared types (`types/`) and utilities (`utils/`, `middleware/`)
- `public/` — Committed static source: `index.html`, `css/`
- `dist/` — Build output: `server/` (compiled TS), `js/` (esbuild bundles), git-ignored

## Client Modules (`client/`)
- `index.ts` — Entry point; imports all modules, calls `loadConfig()`, initializes phases
- `config.ts` — Reads `config.json`, exposes `loadConfig()` + `getConfig()`
- `state/app-state.ts` — `appState` singleton (models, debate data, turn counts, TTS state, `advancedSettings`, `sessionRestored`)
- `dom/helpers.ts` — `$()` null-guard, `showPhase()`, `showToast()`, scroll helpers
- `dom/bindings.ts` — Data-driven DOM binding layer. `SETUP_BINDINGS`, `JUDGE_SELECT_BINDINGS`, `DEBATE_BINDINGS` arrays define field defaults. Exports: `resetDomToDefaults()`, `syncDomToState()`, `syncStateToDom()`, `gatherAdvancedSettingsFromDom()`
- `dom/tts-ui.ts` — `updateTTSEnableButton()`, TTS status polling (takes `state: AppState` param)
- `dom/debate-ui.ts` — `renderDebateProgress`, `updateDebateStatus`, `showRetryTurn`, `hideRetryTurn` (extracted to break circular dependency)
- `api/client.ts` — `apiClient` singleton wrapping all `/api/*` fetch calls. Includes `validate()` for pre-flight endpoint validation
- `session/session-storage.ts` — Encrypted (IndexedDB AES-256-GCM key + localStorage ciphertext) / plaintext fallback (HTTP, no API keys)
- `tts/manager.ts` — `RealtimeTTSManager` (Web Worker, sentence queue, pipelined playback). Helper exports: `startDebateAudio`, `feedAudioText`, etc. Functions take `state: AppState` param.
- `tts/worker.ts` — Kokoro via CDN dynamic import, ONNX Runtime Web, `{ type: 'module' }` Worker, Cache API polyfill (in-memory fallback for untrustworthy origins where `caches` is undefined)
- `phases/setup.ts` — `fetchModelsFor(panel)`, readiness checks, debate creation, TTS init, session restore/save, `resetPrompt`, pre-flight validation
- `phases/debate.ts` — Turn execution, SSE streaming, auto-advance, TTS text feeding
- `phases/judge-select.ts` — Uses `resetDomToDefaults(JUDGE_SELECT_BINDINGS)` for form reset. `fetchModelsForJudgeSelect()` reads from `*2` DOM elements. Do NOT call `fetchModelsFor('Judge')` here.
- `phases/verdict.ts` — Verdict streaming, winner parsing, transcript, markdown export, TTS for judge voice
- `app.ts` — `resetToSetup()` uses binding layer (`resetDomToDefaults`) to reset DOM. Clears state, resets `sessionRestored` flag, destroys TTS
- `global.d.ts` — Type declarations for `marked` (CDN), `KokoroTTS`, build-time defines, Worker augmentations

## Server Modules (`server/`)
- `index.ts` — App creation, config loading, CORS, routes mounted at `/api/*`, graceful shutdown
- `app.ts` — `createApp(config)` factory, COOP+COEP headers, static `public/` serving
- `routes/debates.ts` — `POST /api/debate`, `GET /api/debate/:id`, `DELETE /api/debate/:id`
- `routes/models.ts` — `GET /api/models?url=...` with retry
- `routes/turns.ts` — `POST /api/debate/:id/next-turn` (SSE streaming, auto-advance/judge)
- `routes/verdicts.ts` — `POST /api/debate/:id/verdict` (judge SSE), `POST /api/debate/:id/judge`
- `routes/validate.ts` — `POST /api/validate` pre-flight check: tests endpoint connectivity, auth, model availability, and lightweight completion
- `utils/openai-client.ts` — `createClient(apiUrl, apiKey)` appends `/v1`, `withRetry(fn)` (1 retry, 5s)
- `utils/prompts.ts` — Re-exports from `shared/utils/prompts.ts`

## Shared Modules (`shared/`)
- `types/config.ts` — Interfaces for all config sections. `PromptsConfig` includes optional `versionAffirmative/Negative/Judge` fields
- `types/debate.ts` — `Debate`, `DebateCreateBody`, `DebateMessage`, `Speaker`, etc.
- `types/api.ts` — `ModelInfo`, SSE event types, `ValidateRequest`/`ValidateResponse`
- `types/sse.ts` — `SSEChunkEvent`, `SSDoneEvent` (includes `error` property), `SSEErrorEvent`, `SSEEvent` union
- `utils/streaming.ts` — `setupSSE`, `sendChunk`, `sendDone`, `sendError`, `streamText`, `flushSSE`
- `utils/prompts.ts` — Versioned prompt resolver. Reads `prompts.json` registry, resolves by version ID from config. Exports: `getAffirmativePrompt`, `getNegativePrompt`, `getJudgePrompt`, `getSpeakerPrompt`, `getAvailableVersions`, `getPromptInfo`
- `utils/config.ts` — Config loader with validation. Server resolves prompt versions when serving `/config.json`
- `prompts/prompts.json` — Versioned prompt registry. Add new versions here without rebuilding
- `middleware/debates.ts` — `debates` Map (keyed by UUID), `findDebate` Express middleware

## Mock Server (`mock/`)
- `index.ts` — Express on port 3001, CORS, JSON parsing
- `app.ts` — `createMockApp()` factory, COOP+COEP headers, static `public/`
- `routes/` — Mirrors real server routes with hardcoded responses. Includes `validate.ts` (mock validation, always succeeds for known models)
- `data/mock-data.ts` — `MOCK_MODELS` (6 fake models), `MOCK_DEBATE_CONTENT` (3 turns/side + verdict, always Negative wins)

## SSE Streaming Protocol
All streaming endpoints use Server-Sent Events (`shared/utils/streaming.ts`):
- `data: { type: 'chunk', content: '...' }` — text delta
- `data: { type: 'done', ... }` — stream complete; fields: `debateComplete`, `nextSpeaker`, `winner`, `verdict`, `countA`, `countB`, `autoJudge`, `error`
- `data: { type: 'error', error: '...' }` — error
Frontend reads via `res.body.getReader()` + `TextDecoder`, parses `data: ` lines, renders with `marked.parse()`.

## Debate State Machine
`debating` → `awaiting-judge` or `judging` → `complete`
- **debating**: Turns alternate Affirmative/Negative (3 each via `maxTurns: 3`). Auto-advances.
- **awaiting-judge**: Debate finishes without pre-configured judge → shows judge-select phase.
- **judging**: Auto-transitioned (if judge pre-configured) or triggered from judge-select.
- **complete**: Winner parsed from `Winner: Side [AB]` in verdict text. Retryable via `btnRetryVerdict`.

## Session Persistence (`client/session/session-storage.ts`)
- **Encrypted** (HTTPS/localhost): IndexedDB stores AES-256-GCM key; localStorage stores base64-encoded `IV || ciphertext` under `jubilai_session`
- **Plaintext fallback** (HTTP): stores non-sensitive config under `jubilai_session_plain`. API keys **never** stored in plaintext.
- Auto-restore on init, auto-save after debate creation. All failures silent.

## System Prompts (`shared/utils/prompts.ts` + `shared/prompts/prompts.json`)
Versioned prompt registry in `prompts.json`. Config references active versions by ID (`versionAffirmative: "v1"`). Resolved at runtime — adding variants requires only editing JSON, no rebuild. `getAffirmativePrompt`, `getNegativePrompt`, `getJudgePrompt` accept optional `customPrompt` override. Server resolves versions when serving config to client.

## DOM Binding Layer (`client/dom/bindings.ts`)
Declarative configuration replaces manual DOM resets. `FieldBinding` structs define element ID, type, and default value. `resetDomToDefaults()` resets all fields at once. `syncDomToState()` reads form into state. `syncStateToDom()` writes state to form. Used by `resetToSetup()`, `judge-select` transitions, and session restore.

## Advanced Settings
Collapsible panel in setup phase. 3 custom prompt textareas (`#promptA`, `#promptB`, `#promptJudge`) + debater params (`temperature` default `0.7`, `topP`, `topK`, `maxTokens`) + judge params (`judgeTemperature` default `0.5`, `judgeTopP`, `judgeTopK`, `judgeMaxTokens`). Server stores as `debate.customPromptA/B/Judge` and `debate.temperature/topP/topK/maxTokens` / `debate.judgeTemperature/topP/topK/maxTokens` (null when unset). Reset handled by binding layer.

## Pre-flight Validation (`POST /api/validate`)
Tests endpoint connectivity, API key auth, model availability, and lightweight completion before debate starts. Integrated into setup phase as non-blocking warning. Available on both real and mock servers.

## TTS (`client/tts/manager.ts`, `client/tts/worker.ts`)
- Kokoro model via Web Worker, WASM inference only (no WebGPU), q4 quantization
- Worker built as ES module (`--format=esm`) via `scripts/build-tts.js` — dynamic `import()` of Kokoro from CDN requires module format
- Cache API polyfill in worker: provides in-memory `caches` fallback for untrustworthy origins (HTTP on non-localhost/remote IPs) where the native Cache API is unavailable. Without this, Kokoro's `generate()` falls back to network downloads on every call, causing severe slowdown.
- Build-time defines injected: `TTS_MODEL_ID`, `TTS_DTYPE`, `TTS_DEVICE` from `config.json`
- `KokoroTTS` class accessed via import result (`kokoroMod.KokoroTTS`), not as global
- 28-voice pool (American + British English). 3 random distinct voices assigned per debate
- Sentences queued serially; pipelined playback (synthesizes sentence B while A plays)
- `useStreaming = false` — `kokoro.stream()` hangs with plain strings; `generate()` used instead
- Pause/Resume preserves audio queue and pending generations. While paused, incoming text is discarded.
- `finishDebateAudio` blocks on audio queue drain. In verdict phase, `renderTranscript` is called before TTS flush for responsive UI.
- Helper exports: `startDebateAudio` (initializes Kokoro + assigns voices + sets `tts.enabled`), `feedAudioText`, `finishDebateAudio`, `stopDebateAudio`, `pauseDebateAudio`, `resumeDebateAudio`

## CSS Architecture
- Dark theme, CSS custom properties in `:root`
- Colors: Affirmative = green (`--affirmative`), Negative = orange (`--negative`), Judge = gold (`--judge`)
- Toast: fixed top-center, auto-dismiss 3s
- Disabled buttons: setup phase uses `.btn-disabled` CSS class + `aria-disabled` (click events fire for feedback). Judge-select phase uses native `disabled` attribute.
- TTS status states: `loading`, `active`, `paused`, `playing`, `generating`

## Key DOM Element IDs
- **Setup**: `statement`, `endpointA/B`, `apiKeyA/B`, `modelA/B`, `btnFetchA/B`, `btnStartDebate`, `endpointJudge`, `apiKeyJudge`, `judgeModelSelect`, `btnFetchJudge`, `modelsJudge`, `modelsJudgeInfo`
- **Judge-select**: `endpointJudge2`, `apiKeyJudge2`, `judgeModelSelect2`, `btnFetchJudge2`, `btnStartJudge2`, `modelsJudge2`, `modelsJudge2Info`, `judgeStatement`
- **Debate**: `debateStream`, `progressA/B`, `statusBadge`, `btnRetryTurn`, `btnAbortDebate`
- **TTS (debate)**: `ttsToggle`, `ttsStopBtn` (pause), `ttsResumeBtn`, `ttsStatus`
- **TTS (verdict)**: `ttsToggleVerdict`, `ttsStopBtnVerdict` (pause), `ttsResumeBtnVerdict`, `ttsStatusVerdict`
- **Verdict**: `verdictWinner`, `verdictReasoning`, `transcriptContainer`, `btnToggleTranscript`, `btnExportMarkdown`, `btnRetryVerdict`
