# JubilAI — Application Specification

An AI debate arena where two LLM models take opposing sides on a user-provided statement, and a third LLM model adjudicates the winner.

---

## 1. Overview

The application provides a web-based interface for staging structured debates between two LLM models. A user (or kiosk operator) configures endpoints, selects models, and submits a statement. The system then automatically runs alternating turns between an Affirmative debater (arguing the statement is TRUE) and a Negative debater (arguing it is FALSE). After all turns, a judge model evaluates both sides and declares a winner.

All streaming LLM responses are rendered in real-time as formatted markdown. Optional text-to-speech reads arguments aloud using browser-based neural TTS. Completed debates are persisted and browsable through a history panel.

---

## 2. Configuration

A single configuration file drives all tunable behavior:

- **Application**: display name, network ports (real and mock), bind host
- **Debate rules**: max turns per side (default 3, range 1–5), auto-advance delay between turns (1500 ms), auto-judge delay (1000 ms), retry timeout (120 s), winner-detection regex pattern
- **LLM defaults**: temperature for debaters (0.7) and judge (0.5); optional topP, topK, maxTokens
- **System prompts**: default text for affirmative, negative, and judge roles; active version IDs that resolve from a prompt registry
- **TTS**: model identifier, quantization level, inference backend, worker timeout (120 s), sentence buffer cap (5000 chars), status poll interval (500 ms), voice pool (28 American/British English voices)
- **Session storage**: database name and version, localStorage key names (encrypted and plaintext variants)
- **Debate storage**: directory name, max list count (50)
- **UI**: toast auto-dismiss duration (3000 ms), phase identifiers
- **Kiosk mode**: enabled flag, all debate parameters pre-filled for fixed deployment
- **Mock server**: stream chunk size, simulated delays, fake model list

---

## 3. Server API

All endpoints are RESTful, prefixed with `/api/`. Streaming endpoints use Server-Sent Events (SSE).

### 3.1 SSE Event Format

- **Chunk**: `{ type: "chunk", content: "<text delta>" }` — incremental text
- **Done**: `{ type: "done", debateComplete?, nextSpeaker?, winner?, verdict?, countA?, countB?, autoJudge?, error? }` — stream complete
- **Error**: `{ type: "error", error: "<message>" }` — failure

### 3.2 Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/models` | Fetch available models from a given LLM endpoint. Query params: `url`, `apiKey?`. Retries once on failure. |
| `POST` | `/api/debate` | Create a new debate. Body: statement, modelA/B, endpointA/B, apiKeyA/B (optional), judgeModel/endpoint/key (optional), custom prompts (optional), LLM params (optional), maxTurns (optional). Returns: id, phase, nextSpeaker, models, statement, judgeModel, autoJudge flag. |
| `GET` | `/api/debate/:id` | Retrieve full debate state: messages, turn counts, phase, verdict, autoJudge. |
| `DELETE` | `/api/debate/:id` | Delete a debate from memory and persistent storage. |
| `GET` | `/api/debates` | List persisted debates (up to 50, newest first). Returns summaries: id, statement, models, phase, verdict snippet, winner, timestamp. |
| `POST` | `/api/debate/:id/next-turn` | Generate the next debate turn (SSE stream). Body: `{ speaker: "A" \| "B" }`. Validates phase is `debating` and speaker matches nextSpeaker. Conversation context: system prompt + statement + all prior messages. On completion: advances turn count, determines if debate is complete, transitions phase. |
| `POST` | `/api/debate/:id/judge` | Assign a judge model and endpoint. Requires phase `debating` or `awaiting-judge`. Transitions to `judging`. |
| `POST` | `/api/debate/:id/verdict` | Generate judge verdict (SSE stream). Builds prompt: system prompt + statement + all arguments grouped by side + model info. On completion: parses winner, persists debate to disk, transitions to `complete`. |
| `POST` | `/api/validate` | Pre-flight validation. Body: `{ url, apiKey?, model? }`. Tests connectivity, authentication, model availability, and a lightweight completion. Returns `{ valid, error?, models, model? }`. |

---

## 4. Debate State Machine

```
debating → awaiting-judge → judging → complete
            ↖_______________↙
              (auto-judge)
```

- **debating**: Turns alternate Affirmative ↔ Negative. Each side gets N turns (configurable 1–5, default 3). Auto-advances after each turn.
- **awaiting-judge**: Reached when both sides exhaust their turns without a pre-configured judge. Triggers the judge-select UI phase.
- **judging**: Either auto-transitioned (if judge was pre-configured) or triggered from the judge-select phase. The judge model evaluates all arguments.
- **complete**: Winner parsed from verdict text using the pattern `Winner: The (Affirmative|Negative)`. Debate is persisted to disk.

---

## 5. User Interface — Phases

### 5.1 Setup (Briefing & Configuration)

The entry screen where the user configures the debate.

**Required fields:**
- Statement (textarea) — the proposition to debate
- Affirmative side: endpoint URL + model selection
- Negative side: endpoint URL + model selection

**Optional fields:**
- Judge side: endpoint URL + model selection (enables auto-judge)
- API keys for any side (optional, supports endpoints that require authentication)

**Model discovery:**
- Each side has a "Synchronize Models" button that queries the configured endpoint and populates a model dropdown
- A "Start Debate" button enables only when all required fields are populated; clicking it while disabled shows which fields are missing

**Pre-flight validation:**
- Before starting, the app validates each configured endpoint (connectivity, auth, model availability, lightweight completion)
- Warnings are shown but do not block the debate from starting

**Advanced Settings (collapsible panel):**
- Custom system prompts for Affirmative, Negative, and Judge (textareas with "Reset to default" buttons)
- Debater parameters: turns per side (1–5), temperature (0–2, default 0.7), topP (0–1), topK (0–100), maxTokens
- Judge parameters: temperature (0–2, default 0.5), topP, topK, maxTokens

**Session persistence:**
- On page load, previously saved form values are restored
- After creating a debate, form state is saved for future sessions
- On secure origins: API keys are encrypted (AES-256-GCM) before storage
- On insecure origins: only non-sensitive fields are stored; API keys are never persisted in plaintext
- All failures degrade silently

### 5.2 Debate (The Stage)

The live debate view with a two-column layout.

**Sidebar:**
- Identity cards for Affirmative and Negative showing model name and endpoint
- Progress bars showing turn completion for each side
- TTS controls (toggle, pause/resume, skip, status indicator)
- Action buttons: Retry Turn (appears on error), Abort (confirms, deletes debate, returns to setup)

**Main area:**
- Statement display at the top
- Streaming debate messages rendered as formatted markdown
- Each message card shows speaker label, model, and endpoint metadata

**Flow:**
- Turns auto-advance after a configurable delay (default 1500 ms)
- Status badge shows current speaker or "awaiting judge"
- When both sides exhaust turns: auto-transitions to verdict (if judge pre-configured) or judge-select phase

### 5.3 Judge-Select

Displayed when the debate completes without a pre-configured judge.

- Statement reminder at the top
- Judge configuration form: endpoint URL (pre-filled from Affirmative's endpoint), API key (optional), model selector
- "Synchronize Models" fetches available models
- "Render Verdict" button enables when endpoint + model are filled; assigns the judge and triggers verdict generation
- "New Dispute" button resets to the setup phase

### 5.4 Verdict

The final adjudication screen.

- Statement display
- Winner announcement (large, color-coded: green for Affirmative, red for Negative)
- Judge model and endpoint metadata
- Streaming verdict reasoning rendered as formatted markdown
- Collapsible full transcript of all debate messages
- Action buttons:
  - **Export Findings**: downloads a `.md` file containing statement, winner, judge info, reasoning, and full transcript
  - **Retry Verdict**: re-runs the judge on the same debate
  - **New Dispute**: resets to the setup phase
- Separate TTS controls for reading the verdict aloud

### 5.5 History Panel

Accessed via a button in the navigation bar.

- Centered overlay with a semi-transparent backdrop
- Scrollable list of past debates (up to 50, newest first)
- Each card shows: statement, winner badge (color-coded), models used, date
- **View**: loads the full debate, renders it in the verdict phase, offers TTS playback of all messages and verdict
- **Delete**: removes the debate from persistent storage, animates card removal
- Empty state shown when no debates exist
- Clicking the backdrop closes the overlay

---

## 6. Text-to-Speech

Browser-based neural TTS that reads debate arguments and verdicts aloud.

### 6.1 Model

- Kokoro neural TTS model loaded from CDN at runtime
- ONNX Runtime Web for inference (WASM backend, no WebGPU)
- q4 quantization for performance
- Runs in a Web Worker to avoid blocking the main thread
- Cache fallback for origins where the native Cache API is unavailable

### 6.2 Voice System

- 28-voice pool: American English (female and male) + British English (female and male)
- 3 random distinct voices assigned per new debate (one each for Affirmative, Negative, Judge)
- Voices are re-randomized for each new debate

### 6.3 Text Processing

- Incoming streamed text is buffered until complete sentences are detected (split on `.`, `!`, `?`, line breaks)
- Sentences are queued serially for synthesis
- Markdown formatting is stripped before synthesis (HTML tags, emphasis markers, links)
- Sentence buffer capped at 5000 characters; excess trimmed from the front

### 6.4 Audio Pipeline

- Worker synthesizes sentences to WAV audio
- Main thread decodes WAV buffers and plays them sequentially through the Web Audio API
- Pipelined playback: synthesizes the next sentence while the current one plays

### 6.5 Controls

- **Enable/Disable**: loads the TTS model on first enable; tears down on debate reset
- **Pause**: stops playback, preserves audio queue and pending generations; incoming text is discarded while paused
- **Resume**: continues playback from the queue, resumes synthesis
- **Skip**: stops playback, clears audio queue and pending generations; sentence buffer is preserved so remaining streamed text continues accumulating for the next flush
- **Stop**: full teardown — stops audio, clears all queues, resets buffer

### 6.6 History Playback

- When viewing a past debate, all messages and verdict text are queued for TTS playback
- Text is fed directly (no sentence buffering) since content is already complete
- Deferred playback: if TTS is disabled when viewing history, playback is queued and triggers when the user enables TTS

---

## 7. System Prompts

### 7.1 Versioned Registry

Prompts are stored in a versioned registry (separate from config). Each role has a map of version IDs to `{ description, text }`. Adding new variants requires only editing the registry — no rebuild needed.

### 7.2 Resolution Order

1. Custom prompt from the debate configuration (highest priority)
2. Version from the prompt registry (referenced by config's active version ID)
3. Default prompt text from config (fallback)

### 7.3 Default Prompt Behavior

- **Affirmative**: Argue the statement is TRUE. Formal prose format (no lists). Be concise. Do not repeat arguments. Address the opponent's points.
- **Negative**: Argue the statement is FALSE. Same format rules as Affirmative.
- **Judge**: Impartial evaluation. Criteria: logical reasoning, evidence quality, rhetorical skill, rebuttal quality, conciseness, originality, format compliance. Penalizes list formatting and repetition. Must output `Winner: The Affirmative` or `Winner: The Negative`.

---

## 8. Persistent Storage

### 8.1 Debate Persistence

- Completed debates are saved as structured data files on disk
- Storage location: configurable via environment variable; defaults to platform-appropriate user data directory
- On server startup, all persisted debates are loaded into memory

### 8.2 Client Session

- Form state (endpoints, models, statement, prompts, parameters) is saved after creating a debate
- Restored automatically on subsequent page loads
- Encrypted storage on secure origins (AES-256-GCM)
- Plaintext fallback on insecure origins (API keys excluded)
- All failures degrade gracefully with no user-visible errors

---

## 9. Kiosk Mode

A simplified deployment mode for public-facing or self-service use.

**Configuration:**
- Enabled via config flag
- All debate parameters (endpoints, models, prompts, LLM settings) are pre-configured

**UI changes:**
- Configuration panels (Affirmative, Negative, Judge, Advanced Settings) are hidden
- History panel is hidden
- Judge-select phase is bypassed
- Statement textarea is enlarged as the primary interaction
- "Start Debate" button requires only the statement

**Behavior:**
- Session persistence is disabled (config is server-managed)
- Pre-flight validation is skipped
- Auto-judge is enabled when a judge is pre-configured
- Debate body is constructed from kiosk config + user-provided statement

---

## 10. Visual Design

- Dark theme with a purple accent color
- Side-specific colors: Affirmative (green), Negative (red), Judge (gold)
- Card-based layout with hover glow effects
- Responsive design with breakpoints for tablet and mobile
- Custom-styled scrollbars
- Toast notifications: top-center, three types (success/error/info), auto-dismiss after 3 seconds, slide-in animation

---

## 11. Testing

- End-to-end tests run against the mock server using a browser automation framework
- Standard mode tests: full flow from setup through judge-select to verdict
- Kiosk mode tests: statement-only flow through debate to verdict
- Static type checking for both server and client code

---

## 12. Supported LLM Endpoints

The application works with any OpenAI-compatible API endpoint (e.g., Ollama, vLLM, OpenAI, Anthropic via gateway, LM Studio). Each side (Affirmative, Negative, Judge) can use a different endpoint and model.

---

## 13. Graceful Degradation

- TTS initialization failures do not block the debate; the app continues without audio
- Pre-flight validation failures are warnings, not blockers
- Session storage failures are silent
- Network errors during streaming show a retry option
- Cache API unavailability falls back to in-memory caching for TTS
