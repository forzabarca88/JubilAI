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
4. `js/tts-manager.js` — Real-time TTS using Transformers.js (sentence batching, audio queue, random voice assignment)
5. `js/phases/setup.js` — Model fetching, readiness checks, debate creation, TTS initialization
6. `js/phases/debate.js` — Turn execution, streaming display, progress tracking, auto-advance, TTS text feeding
7. `js/phases/judge-select.js` — Shown only when judge was NOT pre-configured in setup
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
- **debating**: Turns alternate between Side A and Side B (3 turns each by default via `maxTurns: 3`). Auto-advances after each turn.
- **awaiting-judge**: Reached when debate finishes but no judge was pre-configured. Frontend shows judge-select phase.
- **judging**: Either auto-transitioned (if judge pre-configured) or manually triggered from judge-select.
- **complete**: Verdict rendered, winner determined by parsing `Winner: Side [AB]` from verdict text.

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
- `MOCK_DEBATE_CONTENT.A`: 3 mock arguments for Side A
- `MOCK_DEBATE_CONTENT.B`: 3 mock arguments for Side B
- `MOCK_DEBATE_CONTENT.judge`: Mock verdict (always declares Side B winner)

## Text-to-Speech (Implemented)
- `js/tts-manager.js`: `RealtimeTTSManager` class using `kokoro-js@1.2.1` via jsdelivr CDN
- Model: `onnx-community/Kokoro-82M-v1.0-ONNX` (publicly accessible ONNX weights, no auth required). kokoro-js bundles `@huggingface/transformers@3.5.1`
- **Voice pool**: 32 Kokoro voices (11 American English female, 11 American English male, 5 British English female, 4 British English male). 3 random distinct voices assigned to Side A, Side B, and Judge
- **Streaming TTS**: Text chunks are buffered and segmented at sentence boundaries (`.`, `!`, `?`, `\n`). Each complete sentence generates audio via `kokoro.generate()` and is queued for sequential playback
- **Audio queue**: Sentences play sequentially through Web Audio API. New sentences can be queued while previous audio plays
- **Controls**: Toggle button (enable/disable) and stop button in debate phase. Status shows assigned voice IDs
- **State**: `appState.ttsEnabled`, `appState.ttsSpeakerVoices`, `appState.ttsActiveSpeaker`
- **Global functions**: `startDebateAudio()`, `feedAudioText()`, `finishDebateAudio()`, `stopDebateAudio()`
- **Integration**: Auto-enabled on debate start. TTS feeds text during debate turns (Side A/B voices) and verdict (Judge voice). Error/abort/catch handlers flush TTS buffers and stop audio.
- **First-use note**: Model downloads ~100MB (q8 quantized) on first use, cached by browser thereafter
- **Graceful fallback**: Debate proceeds normally if TTS initialization fails

## Planned but Unimplemented Features

## CSS Architecture
- Dark theme with CSS custom properties in `:root`
- Color coding: Side A = green (`--side-a`), Side B = orange (`--side-b`), Judge = gold (`--judge`)
- Streaming indicator: blinking cursor via `::after` pseudo-element with `animation: blink`
- TTS controls: `.tts-controls` container, `.tts-btn` with states (default/enabled/playing), `.tts-status` with states (loading/active)
- Responsive: single-column layout below 700px

## Key DOM Element IDs
- Setup phase: `statement`, `endpointA/B`, `apiKeyA/B`, `modelA/B`, `btnFetchA/B`, `btnStartDebate`, plus judge equivalents
- Debate phase: `debateStream` (message container), `progressA/B`, `statusBadge`, `btnRetryTurn`, `btnAbortDebate`
- TTS controls: `ttsToggle` (enable/disable button), `ttsStopBtn` (stop button), `ttsStatus` (voice info display)
- Verdict phase: `verdictWinner`, `verdictReasoning`, `transcriptContainer`, `btnToggleTranscript`, `btnExportMarkdown`, `btnRetryVerdict`
- Judge-select phase: `endpointJudge2`, `judgeModelSelect2`, `btnFetchJudge2`, `btnStartJudge2`