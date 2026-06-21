# Core Guidelines

- When modifying existing files, you must avoid rewriting the whole file unless you have failed with edits atleast 3 times.
- After completing every change, review whether AGENTS.md requires any modification as a result. If the change affects architecture, API contracts, state machines, file structure, or any other documented aspect, update AGENTS.md accordingly.

# Codebase Architecture

## Dual Server Setup
- **Real server**: `server.js` (port 3000) — connects to real OpenAI-compatible endpoints (Ollama, etc.)
- **Mock server**: `mock-server.js` (port 3001) — uses hardcoded debate content for UI validation without real LLMs
- Both servers serve the same `public/` frontend. Mock uses `mock/src/` for routes, real uses `src/`.
- Run with `npm start` (real) or `npm run mock` (mock).

## Frontend Module Loading Order
Scripts in `public/index.html` are loaded in this strict order:
1. `js/state.js` — Global `appState` object (models, debate data, turn counts, streaming flag, TTS state)
2. `js/dom-helpers.js` — `$()` helper with null guard, `showPhase()`, `showToast()`, scroll helpers
3. `js/api.js` — Global `appApi` object wrapping all fetch calls to `/api/*` endpoints
4. `js/tts-manager.js` — Real-time TTS using kokoro-js with WebGPU (sentence batching, serial generation queue, audio playback, random voice assignment)
5. `js/phases/setup.js` — Model fetching via `fetchModelsFor(panel)` which reads from setup-phase DOM elements (`endpointA/B/Judge`, `apiKeyA/B/Judge`, `modelA/B`, `judgeModelSelect`), readiness checks (clicking disabled start button shows toast with missing requirements), debate creation, TTS initialization
6. `js/phases/debate.js` — Turn execution, streaming display, progress tracking, auto-advance, TTS text feeding
7. `js/phases/judge-select.js` — Shown only when judge was NOT pre-configured in setup. Has its own `fetchModelsForJudgeSelect()` function that reads from `*2` DOM elements (`endpointJudge2`, `apiKeyJudge2`, `judgeModelSelect2`). Do NOT call `fetchModelsFor('Judge')` from this phase — that function reads from setup-phase elements (`endpointJudge`, etc.) which are hidden and empty.
8. `js/phases/verdict.js` — Verdict streaming, transcript rendering, markdown export, TTS for judge voice
9. `js/app.js` — `resetToSetup()` function that resets all state and DOM

## SSE Streaming Protocol
All streaming endpoints (debate turns, verdicts) use Server-Sent Events with this JSON format:
- `data: { type: 'chunk', content: '...' }` — Streaming text delta
- `data: { type: 'done', ... }` — Stream complete; includes `debateComplete`, `nextSpeaker`, `winner`, `verdict`, `countA`, `countB`, `autoJudge`
- `data: { type: 'error', error: '...' }` — Error during streaming

The frontend reads SSE via `res.body.getReader()` + `TextDecoder`, parsing lines starting with `data: `. Content is rendered using `marked.parse()` for markdown.

## Debate State Machine
Phases: `debating` → `awaiting-judge` or `judging` → `complete`
- **debating**: Turns alternate between The Affirmative and The Negative (3 turns each by default via `maxTurns: 3`). Auto-advances after each turn.
- **awaiting-judge**: Reached when debate finishes but no judge was pre-configured. Frontend shows judge-select phase.
- **judging**: Either auto-transitioned (if judge pre-configured) or manually triggered from judge-select.
- **complete**: Verdict rendered, winner determined by parsing `Winner: Side [AB]` from verdict text. Verdict can be retried from this phase via `btnRetryVerdict`.

If `autoJudge` is true (judge configured in setup), the frontend auto-triggers `runVerdict()` after the last turn. Otherwise it transitions to judge-select.

## OpenAI Client
- `src/utils/openai-client.js`: Creates OpenAI clients with custom `baseURL` (appends `/v1`). Default API key is `'ollama'`.
- `withRetry()`: Retries failed requests once after 5-second delay.
- Supports any OpenAI-compatible API (Ollama, vLLM, LM Studio, etc.).

## In-Memory Storage
All debates are stored in a `Map` (keyed by UUID). Data is lost on server restart. No database.

## System Prompts
Defined in `src/utils/prompts.js`:
- **TRUE debater**: Argue the statement is true. Must be concise. Must not repeat arguments.
- **FALSE debater**: Argue the statement is false. Must be concise. Must not repeat arguments.
- **Judge**: Evaluate based on logic, evidence, rhetoric, conciseness, and originality. Repetition is penalized.

## Mock Server Data
`mock/src/utils/mock-data.js` contains:
- `MOCK_MODELS`: 6 fake model IDs (llama3.1:8b, mistral:7b, gemma:7b, qwen2.5:7b, phi3:3.8b, deepseek-coder-v2:16b)
- `MOCK_DEBATE_CONTENT.A`: 3 mock arguments for The Affirmative
- `MOCK_DEBATE_CONTENT.B`: 3 mock arguments for The Negative
- `MOCK_DEBATE_CONTENT.judge`: Mock verdict (always declares The Negative winner)

## Text-to-Speech (Implemented)
- `js/tts-manager.js`: `RealtimeTTSManager` class using `kokoro-js@1.2.1` via jsdelivr CDN with Web Worker
- `js/tts-worker.js`: Dedicated Web Worker for Kokoro model loading and ONNX/WASM inference (isolates heavy computation from main thread)
- Model: `onnx-community/Kokoro-82M-v1.0-ONNX` (publicly accessible ONNX weights, no auth required). kokoro-js bundles `@huggingface/transformers@3.5.1`
- **Inference**: Worker uses `device: 'wasm'` ONNX Runtime with `dtype: 'q4'` (4-bit quantization, ~43MB download) and multi-threaded WASM backend (`env.backends.onnx.wasm.numThreads = navigator.hardwareConcurrency`). Requires COOP+COEP headers from server for SharedArrayBuffer access. Single-threaded WASM fallback if headers missing (~10-20x slower).
- **Voice pool**: 28 Kokoro voices (11 American English female, 8 American English male, 4 British English female, 4 British English male). 3 random distinct voices assigned to The Affirmative, The Negative, and Judge
- **Streaming TTS**: Text chunks buffered and segmented at sentence boundaries (`.`, `!`, `?`, `\n`). Sentences queued serially and dispatched to worker as `generate` requests (not `stream-generate` — see below). Worker returns complete WAV `ArrayBuffer` via `rawAudio.toWav()`. Main thread decodes via `AudioContext.decodeAudioData()` and queues for playback. Pipelined architecture: worker synthesizes Sentence B while Sentence A plays, yielding gapless audio without sub-sentence streaming.
- **No `stream()`**: Disabled due to a known `kokoro-js@1.2.1` bug where passing a plain string to `kokoro.stream(text)` hangs indefinitely. Standard `generate()` is fast enough (~1-2s/sentence with WASM/q4/multi-thread) and pipelined queue ensures gapless playback.
- **Worker protocol**: Main thread sends `init`/`stream-generate`/`stop` messages. Worker responds with `ready`/`audio-chunk`/`audio-done`/`audio`/`error`/`initError` messages
- **Controls**: Toggle button (enable/disable) and stop button in debate phase. Status shows assigned voice IDs
- **State**: `appState.ttsEnabled`, `appState.ttsSpeakerVoices`, `appState.ttsActiveSpeaker`
- **Global functions**: `startDebateAudio()`, `feedAudioText()`, `finishDebateAudio()`, `stopDebateAudio()`
- **Integration**: Auto-enabled on debate start. TTS feeds text during debate turns (The Affirmative/The Negative voices) and verdict (Judge voice). Error/abort/catch handlers flush TTS buffers and stop audio.
- **Graceful fallback**: Debate proceeds normally if TTS initialization fails

## Planned but Unimplemented Features

## CSS Architecture
- Dark theme with CSS custom properties in `:root`
- Color coding: The Affirmative = green (`--affirmative`), The Negative = orange (`--negative`), Judge = gold (`--judge`)
- Toast notifications: Fixed-position, top-center, slide-down animation. `.toast.error` (red/negative), `.toast.success` (green/affirmative), `.toast.info` (purple/accent). Auto-dismiss after 3s. Full-width on narrow screens (<500px)
- Disabled buttons: `.btn-disabled` CSS class (opacity + cursor) instead of HTML `disabled` attribute, so click events still fire for feedback. Uses `aria-disabled` for accessibility
- Streaming indicator: blinking cursor via `::after` pseudo-element with `animation: blink`
- TTS controls: `.tts-controls` container, `.tts-btn` with states (default/enabled/playing), `.tts-status` with states (loading/active)
- Responsive: single-column layout below 700px

## Key DOM Element IDs
- Setup phase: `statement`, `endpointA/B`, `apiKeyA/B`, `modelA/B`, `btnFetchA/B`, `btnStartDebate`, plus judge equivalents (`endpointJudge`, `apiKeyJudge`, `judgeModelSelect`, `btnFetchJudge`, `modelsJudge`, `modelsJudgeInfo`)
- Judge-select phase: `endpointJudge2`, `apiKeyJudge2`, `judgeModelSelect2`, `btnFetchJudge2`, `btnStartJudge2`, `modelsJudge2`, `modelsJudge2Info`, `judgeStatement`
- Note: Setup and judge-select phases have separate DOM elements (IDs without suffix vs `*2` suffix). Each phase's fetch/readiness functions must use its own elements.
- Debate phase: `debateStream` (message container), `progressA/B`, `statusBadge`, `btnRetryTurn`, `btnAbortDebate`
- TTS controls (debate): `ttsToggle` (enable/disable button), `ttsStopBtn` (stop button), `ttsStatus` (voice info display)
- TTS controls (verdict): `ttsToggleVerdict`, `ttsStopBtnVerdict`, `ttsStatusVerdict`
- Verdict phase: `verdictWinner`, `verdictReasoning`, `transcriptContainer`, `btnToggleTranscript`, `btnExportMarkdown`, `btnRetryVerdict`
- Judge-select phase: `endpointJudge2`, `judgeModelSelect2`, `btnFetchJudge2`, `btnStartJudge2`