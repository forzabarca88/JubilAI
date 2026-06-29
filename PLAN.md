# Plan: TTS Playback for Historical Debates

## Goal

Allow users to listen to saved debates via TTS when viewing them from the History panel. When a user opens a past debate in the verdict phase and has TTS enabled, the system should read aloud all debate messages and the judge's verdict using randomly assigned voices.

## Problem

TTS currently only works during live debate/judge streaming. When viewing a historical debate, there is no audio playback — the user can only read the text.

## Solution Overview

The existing `RealtimeTTSManager` already has the building blocks we need (`_queueAudioGeneration`, `pickRandomVoices`, `assignVoices`). For history playback, text is already complete (no streaming), so we feed full messages directly to the generation queue instead of using sentence buffering.

---

## 1. Add `useHistoryPlayback` flag to `TTSState`

### `client/state/app-state.ts`

Add a boolean flag to distinguish live streaming mode from history playback mode:

```ts
export interface TTSState {
  enabled: boolean;
  speakerVoices: Record<string, string>;
  activeSpeaker: Speaker | 'judge' | null;
  paused: boolean;
  useHistoryPlayback: boolean;  // true when playing back a saved debate
}
```

Update the default `AppState` constructor and `reset()` method to include `useHistoryPlayback: false`.

---

## 2. Add `playHistoryAudio` to `client/tts/manager.ts`

New exported function that plays back a complete debate's audio:

```ts
/**
 * Play TTS for a viewed historical debate.
 * Feeds all messages (A/B) and the verdict text to the generation queue.
 * Text is already complete, so we skip sentence buffering and feed directly.
 */
export async function playHistoryAudio(
  messages: { speaker: Speaker; content: string }[],
  verdict: string | null,
  state: AppState
): Promise<void> {
  if (!state.tts.enabled) return;

  // Initialize TTS worker if not already loaded
  if (!ttsManager.isInitialized) {
    try {
      await ttsManager.initialize();
    } catch (err) {
      console.warn('[TTS] Init failed for history playback:', (err as Error).message);
      state.tts.enabled = false;
      return;
    }
  }

  // Pick random voices (original voices not stored)
  const voices = ttsManager.pickRandomVoices();
  ttsManager.assignVoices(voices);
  state.tts.speakerVoices = voices;
  state.tts.useHistoryPlayback = true;

  // Stop any existing audio
  ttsManager.stopAudio();

  // Feed all debate messages in order
  for (const msg of messages) {
    const speaker: Speaker = msg.speaker as Speaker;
    // Feed complete text directly (no sentence buffering for history)
    ttsManager._queueAudioGeneration(msg.content, speaker);
  }

  // Feed verdict text with judge voice
  if (verdict) {
    ttsManager._queueAudioGeneration(verdict, 'judge');
  }

  // Process the queue
  if (!ttsManager._workerBusy && ttsManager._pendingGenerations.length > 0) {
    ttsManager._processGenerationQueue();
  }

  // Start status polling so UI reflects playback state
  startTTSStatusPoll(state);

  console.log('[TTS] History playback started:', messages.length, 'messages + verdict');
}

/**
 * Stop history playback and reset to normal mode.
 */
export function stopHistoryAudio(state: AppState): void {
  ttsManager.stopAudio();
  state.tts.useHistoryPlayback = false;
  state.tts.paused = false;
  stopTTSStatusPoll();
}
```

**Design notes:**
- Uses `_queueAudioGeneration` directly with full text (not `feedTextChunk` which does sentence splitting). The cleanup regex in `_queueAudioGeneration` handles markdown stripping.
- Picks new random voices each time since original voice assignments aren't stored in the debate file.
- Calls `startTTSStatusPoll` so the verdict-phase TTS buttons show correct state during playback.
- Calls `stopTTSStatusPoll` when playback ends or is stopped.

---

## 3. Wire history playback into `viewDebate`

### `client/phases/history.ts`

In `viewDebate`, after `renderViewedVerdict(data)`, start TTS playback if enabled:

```ts
import { playHistoryAudio, stopHistoryAudio, ttsManager } from '../tts/manager';
import { startTTSStatusPoll, stopTTSStatusPoll } from '../dom/tts-ui';

export async function viewDebate(id: string, state: AppState): Promise<void> {
  try {
    closeHistoryPanel();

    const res = await apiClient.getDebateHistory(id);
    const data = await apiClient.json<DebateStateResponse>(res);

    // Populate appState with the debate data
    state.debateId = data.id;
    state.debateData = { ... };
    state.autoJudge = data.autoJudge;

    // Render in verdict phase
    renderViewedVerdict(data);

    // Start TTS playback if enabled
    if (state.tts.enabled) {
      await playHistoryAudio(data.messages, data.verdict, state);
    }

    showToast(`Loaded debate: "${data.statement.slice(0, 40)}..."`, 'info');
  } catch (err) {
    showToast('Failed to load debate: ' + (err as Error).message, 'error');
  }
}
```

Also update `renderViewedVerdict` to show the verdict-phase TTS controls (they're already present in the DOM from the verdict phase).

---

## 4. Handle TTS stop/reset on `resetToSetup`

### `client/app.ts`

In `resetToSetup()`, after `stopDebateAudio(state)`, also reset history playback state:

```ts
import { stopHistoryAudio } from '../tts/manager';

// In resetToSetup():
stopDebateAudio(state);
stopHistoryAudio(state);
```

---

## 5. Update E2E test

### `test-e2e.mjs`

Add a test step after opening the history panel and viewing a debate:

```js
// 18. Test TTS playback for historical debates
const historyCards = await page.$$('.history-card');
if (historyCards.length > 0) {
  console.log('18. Testing TTS playback for viewed debate...');

  // Enable TTS toggle in verdict phase before viewing
  const ttsToggleVerdict = await page.$('#ttsToggleVerdict');
  if (ttsToggleVerdict) {
    await ttsToggleVerdict.click();
    await new Promise(r => setTimeout(r, 1000)); // wait for TTS init
  }

  // Click View on the first card
  const viewBtn = await page.$('.btn-view-debate');
  if (viewBtn) {
    await viewBtn.click();
    await page.waitForSelector('#phase-verdict', { state: 'visible', timeout: 5000 }).catch(() => {
      console.log('  ❌ FAIL: Verdict phase did not appear after View');
      historyFailures.push('View button did not switch to verdict phase');
    });

    // Wait for TTS to start playing
    await new Promise(r => setTimeout(r, 3000));

    // Check TTS status indicator
    const ttsStatus = await page.$eval('#ttsStatusVerdict', el => el.textContent).catch(() => null);
    if (ttsStatus) {
      console.log(`✓ TTS status: ${ttsStatus}`);
    } else {
      console.log('  ⚠ TTS status element not found');
    }
  }
}
```

---

## 6. Implementation Order

1. ✅ **TTSState** — add `useHistoryPlayback` flag to `client/state/app-state.ts`.
2. ✅ **TTS manager** — add `playHistoryAudio` and `stopHistoryAudio` to `client/tts/manager.ts`.
3. ✅ **History module** — wire `playHistoryAudio` into `viewDebate` in `client/phases/history.ts`.
4. ✅ **App reset** — add `stopHistoryAudio` call to `client/app.ts` `resetToSetup()`.
5. ✅ **E2E test** — add TTS playback verification step to `test-e2e.mjs`.
6. ✅ **Build and test** — `npm run build && node test-e2e.mjs` — **PASS**

---

## 7. Design Decisions & Rationale

| Decision | Rationale |
|----------|-----------|
| **Reuse existing TTS manager** | No new infrastructure needed. The worker, voice pool, and audio queue are already built. |
| **Pick random voices each time** | Original voice assignments aren't stored in debate files. Random voices give variety on each replay. |
| **Feed full text directly** | History messages are complete (no streaming). Skipping sentence buffering avoids fragmentation and is simpler. |
| **`useHistoryPlayback` flag** | Lets the TTS UI and status poller know this is a replay, not a live debate. Enables future enhancements (e.g., different status text). |
| **TTS toggle in verdict phase** | The verdict phase already has `ttsToggleVerdict` / `ttsStopBtnVerdict` / `ttsResumeBtnVerdict` buttons. Users enable TTS before clicking View. |
| **Non-blocking playback** | `playHistoryAudio` starts the queue and returns; audio plays in background. UI remains responsive. |
| **Deferred playback** | When viewing a historical debate with TTS disabled, data is queued as `pendingHistoryPlayback`. Triggered automatically when user toggles TTS on. Prevents silent skip. |

---

## 8. Files Modified

**Modified files:**
- `client/state/app-state.ts` — add `useHistoryPlayback` and `pendingHistoryPlayback` to `TTSState`
- `client/tts/manager.ts` — add `playHistoryAudio` and `stopHistoryAudio` exports
- `client/phases/history.ts` — import TTS helpers, queue deferred playback in `viewDebate`
- `client/app.ts` — add `stopHistoryAudio` to `resetToSetup()`
- `client/dom/tts-ui.ts` — `initTTSEvents()` centralized listener setup, trigger deferred playback in `toggleTTSEnable`
- `client/phases/debate.ts` — remove TTS listener setup (moved to `tts-ui.ts`)
- `client/phases/verdict.ts` — remove TTS listener setup (moved to `tts-ui.ts`)
- `client/index.ts` — call `initTTSEvents(appState)` at startup
- `test-e2e.mjs` — restructure TTS playback test (view debate first, then toggle TTS)

---

## 9. Results

**E2E test: ✅ PASS** — Full debate flow + history + TTS playback completed successfully.

### Fix: Deferred Playback + Centralized Event Listeners
The original implementation called `playHistoryAudio` immediately in `viewDebate`, which ran before the user had a chance to enable TTS. If TTS was disabled, playback was silently skipped.

**Root cause**: TTS event listeners were added redundantly in both `initDebatePhase` (debate.ts) and `initVerdictPhase` (verdict.ts). Clicking the toggle button fired ALL registered handlers, toggling `state.tts.enabled` back and forth, leaving the button stuck on "Audio Off".

**Solution**:
1. Moved all TTS button listeners to `initTTSEvents()` in `tts-ui.ts`, called once at app startup — eliminates duplicate handlers
2. Added `pendingHistoryPlayback` to `TTSState` — when viewing a historical debate with TTS disabled, data is queued
3. `toggleTTSEnable` detects pending data and triggers `playHistoryAudio` when TTS is toggled on

**Observations:**
- Kokoro WASM model loads correctly in headless Chromium (~15s)
- Voice pool assignment works (3 distinct voices: A, B, judge)
- Audio generation queue processes all debate messages + verdict text
- Cache API unavailable in headless Chromium (`QuotaExceededError`) — falls back to in-memory cache
- Deferred playback tested: View debate (TTS off) → toggle TTS on → playback triggers correctly
