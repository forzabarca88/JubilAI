/**
 * TTS button/status UI logic (extracted from inline `<script>` in index.html).
 * Uses config for poll interval.
 */

import { getConfig } from '../config';
import { $, showToast } from './helpers';
import type { AppState } from '../state/app-state';
import { ttsManager, playHistoryAudio } from '../tts/manager';

// TTS status poll interval — read lazily from config
let _pollInterval: number | null = null;

function getPollInterval(): number {
  if (_pollInterval === null) {
    _pollInterval = getConfig().tts.statusPollIntervalMs;
  }
  return _pollInterval;
}

let ttsStatusInterval: ReturnType<typeof setInterval> | null = null;

/** Toggle TTS enabled/disabled */
export function toggleTTSEnable(state: AppState) {
  state.tts.enabled = !state.tts.enabled;
  state.tts.paused = false;
  updateTTSEnableButton(state);
  if (!state.tts.enabled) {
    stopDebateAudio(state);
  } else {
    // Trigger deferred history playback if queued
    if (state.tts.pendingHistoryPlayback) {
      const pending = state.tts.pendingHistoryPlayback;
      state.tts.pendingHistoryPlayback = null;
      playHistoryAudio(pending.messages, pending.verdict, state);
    }
  }
}

/** Pause audio and update UI */
export function pauseDebateAudioAndUI(state: AppState) {
  pauseDebateAudio(state);
  updateTTSEnableButton(state);
}

/** Resume audio and update UI */
export function resumeDebateAudioAndUI(state: AppState): Promise<void> {
  return resumeDebateAudio(state).then(() => {
    updateTTSEnableButton(state);
  });
}

/** Update all TTS buttons and status indicators */
export function updateTTSEnableButton(state: AppState) {
  const toggles = [$('ttsToggle'), $('ttsToggleVerdict')];
  const pauseBtns = [$('ttsStopBtn'), $('ttsStopBtnVerdict')];
  const resumeBtns = [$('ttsResumeBtn'), $('ttsResumeBtnVerdict')];
  const skipBtns = [$('btnSkipTTS'), $('btnSkipTTSVerdict')];
  const statuses = [$('ttsStatus'), $('ttsStatusVerdict')];

  for (const toggle of toggles) {
    if (!toggle) continue;
    if (state.tts.enabled) {
      toggle.innerHTML = '🔊 Audio On';
      toggle.classList.add('enabled');
      toggle.classList.remove('playing');
    } else {
      toggle.innerHTML = '🔊 Audio Off';
      toggle.classList.remove('enabled');
      toggle.classList.remove('playing');
    }
  }

  for (const pauseBtn of pauseBtns) {
    if (!pauseBtn) continue;
    (pauseBtn as HTMLButtonElement).disabled = !state.tts.enabled;
    pauseBtn.classList.toggle('hidden', state.tts.paused);
  }

  for (const resumeBtn of resumeBtns) {
    if (!resumeBtn) continue;
    resumeBtn.classList.toggle('hidden', !state.tts.paused);
  }

  // Show/hide Skip buttons: visible when TTS is enabled and there's audio activity
  for (const skipBtn of skipBtns) {
    if (!skipBtn) continue;
    const hasActivity = state.tts.enabled && (
      ttsManager.isPlaying ||
      ttsManager.hasQueuedAudio() ||
      ttsManager.pendingGenerationsCount > 0 ||
      ttsManager.sentenceBufferLength > 0
    );
    skipBtn.classList.toggle('hidden', !hasActivity);
  }

  for (const status of statuses) {
    if (!status) continue;
    if (!state.tts.enabled) {
      status.textContent = '';
      status.className = 'tts-status';
      continue;
    }
    const parts: string[] = [];
    const voices = state.tts.speakerVoices;
    if (Object.keys(voices).length === 0) {
      status.textContent = 'Initializing Kokoro...';
      status.className = 'tts-status loading';
      continue;
    }
    parts.push(`Voices: A:${voices.A} | N:${voices.B} | J:${voices.judge}`);
    let stateClass = 'active';
    if (state.tts.paused) {
      parts.push('⏸ Paused');
      stateClass = 'paused';
    } else if (ttsManager.pendingGenerationsCount > 0) {
      parts.push(`Queue: ${ttsManager.pendingGenerationsCount}`);
      stateClass = 'generating';
    } else if (ttsManager.sentenceBufferLength > 0) {
      parts.push(`Buffered: ${ttsManager.sentenceBufferLength} chars`);
      stateClass = 'generating';
    }
    if (ttsManager.isPlaying) {
      parts.push('▶ Playing');
      stateClass = 'playing';
      for (const toggle of toggles) {
        if (toggle) {
          toggle.classList.add('playing');
          toggle.classList.remove('enabled');
        }
      }
    } else if (ttsManager.hasQueuedAudio()) {
      parts.push(`Buffered: ${ttsManager.audioQueue.length}`);
    }
    status.textContent = parts.join(' | ');
    status.className = `tts-status ${stateClass}`;
  }
}

/** Start periodic TTS status polling */
export function startTTSStatusPoll(state: AppState) {
  if (ttsStatusInterval) return;
  ttsStatusInterval = setInterval(() => {
    if (state.tts.enabled) {
      updateTTSEnableButton(state);
    } else {
      stopTTSStatusPoll();
    }
  }, getPollInterval());
}

/** Stop TTS status polling */
export function stopTTSStatusPoll() {
  if (ttsStatusInterval) {
    clearInterval(ttsStatusInterval);
    ttsStatusInterval = null;
  }
  // Update one last time
  // (state is passed in from callers)
}

/** Stop all audio playback */
function stopDebateAudio(state: AppState) {
  ttsManager.stopAudio();
  state.tts.paused = false;
}

/**
 * Initialize TTS button event listeners (called once at app startup).
 * TTS buttons are global UI elements shared across all phases,
 * so listeners are registered here to avoid duplicate handlers.
 */
export function initTTSEvents(state: AppState) {
  $('ttsToggle')?.addEventListener('click', () => toggleTTSEnable(state));
  $('ttsStopBtn')?.addEventListener('click', () => pauseDebateAudioAndUI(state));
  $('ttsResumeBtn')?.addEventListener('click', () => resumeDebateAudioAndUI(state));
  $('btnSkipTTS')?.addEventListener('click', () => {
    ttsManager.skipToNextSpeaker();
    state.tts.paused = false;
    updateTTSEnableButton(state);
    showToast('Skipped to next speaker', 'info');
  });
  $('btnSkipTTSVerdict')?.addEventListener('click', () => {
    ttsManager.skipToNextSpeaker();
    state.tts.paused = false;
    updateTTSEnableButton(state);
    showToast('Skipped to next speaker', 'info');
  });
  $('ttsToggleVerdict')?.addEventListener('click', () => toggleTTSEnable(state));
  $('ttsStopBtnVerdict')?.addEventListener('click', () => pauseDebateAudioAndUI(state));
  $('ttsResumeBtnVerdict')?.addEventListener('click', () => resumeDebateAudioAndUI(state));
}

/** Pause audio playback */
function pauseDebateAudio(state: AppState) {
  ttsManager.pauseAudio();
  state.tts.paused = true;
}

/** Resume paused audio playback */
async function resumeDebateAudio(state: AppState) {
  await ttsManager.resumeAudio();
  state.tts.paused = false;
}
