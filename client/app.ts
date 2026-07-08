/**
 * Application initialization and reset functionality.
 * Uses the data-driven binding layer (dom/bindings.ts) for DOM resets.
 */

import { getConfig } from './config';
import { $, showToast, showPhase } from './dom/helpers';
import { resetDomToDefaults, syncStateToDom, SETUP_BINDINGS, JUDGE_SELECT_BINDINGS, DEBATE_BINDINGS } from './dom/bindings';
import { appState, type AppState } from './state/app-state';
import { stopDebateAudio, stopHistoryAudio, ttsManager } from './tts/manager';
import { updateTTSEnableButton } from './dom/tts-ui';
import { initKioskMode } from './phases/kiosk';

/** Reset all state and UI back to the setup phase */
export function resetToSetup(state: AppState) {
  const config = getConfig();
  const isKiosk = config.kiosk.enabled;

  // Clear session restored flag so next page load will re-restore
  state.sessionRestored = false;

  // Stop any playing TTS audio and clean up model
  stopDebateAudio(state);
  stopHistoryAudio(state);
  ttsManager.destroy();

  state.debateId = null;
  state.currentSpeaker = null;
  state.countA = 0;
  state.countB = 0;
  state.isStreaming = false;

  // Reset TTS state
  state.tts.enabled = false;
  state.tts.speakerVoices = {};
  state.tts.activeSpeaker = null;
  state.tts.paused = false;
  state.tts.useHistoryPlayback = false;
  state.tts.pendingHistoryPlayback = null;

  if (isKiosk) {
    // Kiosk mode: preserve config-provided values, only clear debate runtime state
    state.debateData = {
      statement: '',
      modelA: config.kiosk.modelA,
      modelB: config.kiosk.modelB,
      endpointA: config.kiosk.endpointA,
      endpointB: config.kiosk.endpointB,
      endpointJudge: config.kiosk.endpointJudge || null,
      messages: [],
      nextSpeaker: null,
      countA: 0,
      countB: 0,
      phase: 'debating' as const,
      judgeModel: config.kiosk.modelJudge || null,
    };
    state.autoJudge = !!(config.kiosk.modelJudge && config.kiosk.endpointJudge);
    state.maxTurns = config.kiosk.maxTurns ?? config.debate.maxTurns;
    state.advancedSettings = {
      promptA: config.kiosk.promptA || '',
      promptB: config.kiosk.promptB || '',
      promptJudge: config.kiosk.promptJudge || '',
      maxTurns: config.kiosk.maxTurns ?? config.debate.maxTurns,
      temperature: config.kiosk.temperature,
      topP: config.kiosk.topP,
      topK: config.kiosk.topK,
      maxTokens: config.kiosk.maxTokens,
      judgeTemperature: config.kiosk.judgeTemperature,
      judgeTopP: config.kiosk.judgeTopP,
      judgeTopK: config.kiosk.judgeTopK,
      judgeMaxTokens: config.kiosk.judgeMaxTokens,
    };
    state.modelsA = [];
    state.modelsB = [];
    state.modelsJudge = [];

    // Reset statement textarea
    const stmt = $('statement');
    if (stmt) (stmt as HTMLTextAreaElement).value = '';

    // Re-apply kiosk-ready button state
    const btn = $('btnStartDebate');
    if (btn) {
      btn.classList.add('btn-disabled');
      btn.setAttribute('aria-disabled', 'true');
      (btn as unknown as Record<string, unknown>)._missing = ['Statement'];
    }
  } else {
    // Normal mode: full reset via binding layer
    state.debateData = null;
    state.autoJudge = false;
    state.modelsA = [];
    state.modelsB = [];
    state.modelsJudge = [];
    state.maxTurns = config.debate.maxTurns;

    // Reset advanced settings to defaults
    state.advancedSettings = {
      promptA: '',
      promptB: '',
      promptJudge: '',
      maxTurns: 3,
      temperature: undefined,
      topP: undefined,
      topK: undefined,
      maxTokens: undefined,
      judgeTemperature: undefined,
      judgeTopP: undefined,
      judgeTopK: undefined,
      judgeMaxTokens: undefined,
    };

    // Use binding layer to reset all DOM elements to defaults
    resetDomToDefaults([...SETUP_BINDINGS, ...JUDGE_SELECT_BINDINGS, ...DEBATE_BINDINGS]);
  }

  // Update TTS UI
  updateTTSEnableButton(state);

  showPhase('phase-setup');
}

/** Initialize all phase event listeners */
export function initApp() {
  // Bind new debate buttons
  $('btnNewDebate')?.addEventListener('click', () => resetToSetup(appState));
  $('btnNewDebate2')?.addEventListener('click', () => resetToSetup(appState));
}
