# Core Guidelines

- When modifying existing files, avoid rewriting unless `edit` fails 3+ times.
- After every change, review whether AGENTS.md needs updating. This file MUST be minimal and considered an index for critical project information only. 

# Architecture

## Dual Server
- **Real**: `server.js` (port 3000) — connects to OpenAI-compatible endpoints
- **Mock**: `mock-server.js` (port 3001) — hardcoded content for UI validation
- Both serve the same `public/` frontend. Mock routes in `mock/src/`, real in `src/`.
- `npm start` (real) or `npm run mock`.

## Frontend Module Load Order (`public/index.html`)
1. `js/state.js` — `appState` (models, debate data, turn counts, streaming, TTS state, `advancedSettings`, `sessionRestored`)
2. `js/dom-helpers.js` — `$()` null-guard helper, `showPhase()`, `showToast()`, scroll helpers
3. `js/api.js` — `appApi` wrapping all `/api/*` fetch calls
4. `js/session-storage.js` — `appSession` for encrypted session persistence (IndexedDB key + localStorage ciphertext, AES-256-GCM; plaintext fallback for HTTP)
5. `js/tts-manager.js` — `RealtimeTTSManager` using kokoro-js via Web Worker (WASM inference, serial sentence queue, pipelined playback)
6. `js/phases/setup.js` — `fetchModelsFor(panel)`, readiness checks, debate creation, TTS init, session restore/save
7. `js/phases/debate.js` — Turn execution, streaming display, auto-advance, TTS text feeding
8. `js/phases/judge-select.js` — `fetchModelsForJudgeSelect()` reads from `*2` DOM elements. Do NOT call `fetchModelsFor('Judge')` here — that reads setup-phase elements which are hidden/empty.
9. `js/phases/verdict.js` — Verdict streaming, transcript, markdown export, TTS for judge voice
10. `js/app.js` — `resetToSetup()` clears all state/DOM, resets `sessionRestored` flag

Inline `<script>` block in `index.html` defines: `toggleTTSEnable()`, `pauseDebateAudioAndUI()`, `resumeDebateAudioAndUI()`, `updateTTSEnableButton()`, `toggleAdvancedSettings()`, `resetPrompt()`, `gatherAdvancedSettings()`, `DEFAULT_PROMPTS`, and `DOMContentLoaded` init.

## SSE Streaming Protocol
All streaming endpoints use Server-Sent Events (`src/utils/streaming.js`):
- `data: { type: 'chunk', content: '...' }` — text delta
- `data: { type: 'done', ... }` — stream complete; fields: `debateComplete`, `nextSpeaker`, `winner`, `verdict`, `countA`, `countB`, `autoJudge`
- `data: { type: 'error', error: '...' }` — error
Frontend reads via `res.body.getReader()` + `TextDecoder`, parses `data: ` lines, renders with `marked.parse()`.

## Debate State Machine
`debating` → `awaiting-judge` or `judging` → `complete`
- **debating**: Turns alternate Affirmative/Negative (3 each via `maxTurns: 3`). Auto-advances.
- **awaiting-judge**: Debate finishes without pre-configured judge → shows judge-select phase.
- **judging**: Auto-transitioned (if judge pre-configured) or triggered from judge-select.
- **complete**: Winner parsed from `Winner: Side [AB]` in verdict text. Retryable via `btnRetryVerdict`.

## OpenAI Client (`src/utils/openai-client.js`)
- `createClient(apiUrl, apiKey)` — appends `/v1`, defaults API key to `'ollama'`
- `withRetry(fn)` — retries once after 5s delay

## In-Memory Storage (`src/middleware/debates.js`)
Debates stored in a `Map` keyed by UUID. Lost on restart.

## Session Persistence (`js/session-storage.js`)
- **Encrypted** (HTTPS/localhost): IndexedDB stores AES-256-GCM key; localStorage stores base64-encoded `IV || ciphertext` under `jubilai_session`
- **Plaintext fallback** (HTTP): stores non-sensitive config under `jubilai_session_plain`. API keys **never** stored in plaintext.
- Auto-restore on init, auto-save after debate creation. All failures silent.

## System Prompts (`src/utils/prompts.js`)
`SYSTEM_PROMPT_TRUE`, `SYSTEM_PROMPT_FALSE`, `SYSTEM_PROMPT_JUDGE`. Require prose format, penalize lists/repetition. Frontend mirrors these in `DEFAULT_PROMPTS` (inline script in `index.html`).

## Advanced Settings
Collapsible panel in setup phase. 3 custom prompt textareas (`#promptA`, `#promptB`, `#promptJudge`) + debater params (`temperature` default `0.7`, `topP`, `topK`, `maxTokens`) + judge params (`judgeTemperature` default `0.5`, `judgeTopP`, `judgeTopK`, `judgeMaxTokens`). Server stores as `debate.customPromptA/B/Judge` and `debate.temperature/topP/topK/maxTokens` / `debate.judgeTemperature/topP/topK/maxTokens` (null when unset). `resetToSetup()` clears all.

## TTS (`js/tts-manager.js`, `js/tts-worker.js`)
- Kokoro model via Web Worker, WASM inference only (no WebGPU), q4 quantization
- 28-voice pool (American + British English). 3 random distinct voices assigned per debate
- Sentences queued serially; pipelined playback (synthesizes sentence B while A plays)
- `useStreaming = false` — `kokoro.stream()` hangs with plain strings; `generate()` used instead
- Pause/Resume preserves audio queue and pending generations. While paused, incoming text is discarded.
- Global functions: `startDebateAudio()`, `feedAudioText()`, `finishDebateAudio()`, `stopDebateAudio()`, `pauseDebateAudio()`, `resumeDebateAudio()`

## Mock Server (`mock/src/utils/mock-data.js`)
`MOCK_MODELS`: 6 fake models. `MOCK_DEBATE_CONTENT`: 3 turns each side + verdict (always Negative wins).

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
