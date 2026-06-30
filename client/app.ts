/**
 * Application initialization and reset functionality.
 * Replaces `public/js/app.js`.
 */

import { getConfig } from './config';
import { $, showToast, showPhase } from './dom/helpers';
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
      temperature: config.kiosk.temperature,
      topP: config.kiosk.topP,
      topK: config.kiosk.topK,
      maxTokens: config.kiosk.maxTokens,
      judgeTemperature: config.kiosk.judgeTemperature,
      judgeTopP: config.kiosk.judgeTopP,
      judgeTopK: config.kiosk.judgeTopK,
      judgeMaxTokens: config.kiosk.judgeMaxTokens,
    };

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
    // Normal mode: full reset of all state and DOM
    state.debateData = null;
    state.autoJudge = false;

    // Reset advanced settings
    state.advancedSettings = {
      promptA: '',
      promptB: '',
      promptJudge: '',
      temperature: undefined,
      topP: undefined,
      topK: undefined,
      maxTokens: undefined,
      judgeTemperature: undefined,
      judgeTopP: undefined,
      judgeTopK: undefined,
      judgeMaxTokens: undefined,
    };

    // Reset The Affirmative
    const mA = $('modelA');
    if (mA) {
      (mA as HTMLSelectElement).innerHTML = '<option value="">— fetch models first —</option>';
      (mA as HTMLSelectElement).disabled = true;
    }
    const eA = $('endpointA');
    if (eA) (eA as HTMLInputElement).value = '';
    const akA = $('apiKeyA');
    if (akA) (akA as HTMLInputElement).value = '';
    const mdsA = $('modelsA');
    if (mdsA) mdsA.classList.add('hidden');
    state.modelsA = [];

    // Reset The Negative
    const mB = $('modelB');
    if (mB) {
      (mB as HTMLSelectElement).innerHTML = '<option value="">— fetch models first —</option>';
      (mB as HTMLSelectElement).disabled = true;
    }
    const eB = $('endpointB');
    if (eB) (eB as HTMLInputElement).value = '';
    const akB = $('apiKeyB');
    if (akB) (akB as HTMLInputElement).value = '';
    const mdsB = $('modelsB');
    if (mdsB) mdsB.classList.add('hidden');
    state.modelsB = [];

    // Reset Judge (setup phase)
    const jms = $('judgeModelSelect');
    if (jms) {
      (jms as HTMLSelectElement).innerHTML = '<option value="">— fetch models first —</option>';
      (jms as HTMLSelectElement).disabled = true;
    }
    const ej = $('endpointJudge');
    if (ej) (ej as HTMLInputElement).value = '';
    const akj = $('apiKeyJudge');
    if (akj) (akj as HTMLInputElement).value = '';
    const mj = $('modelsJudge');
    if (mj) mj.classList.add('hidden');
    state.modelsJudge = [];

    // Reset Judge-select phase
    const jms2 = $('judgeModelSelect2');
    if (jms2) {
      (jms2 as HTMLSelectElement).innerHTML = '<option value="">— fetch models first —</option>';
      (jms2 as HTMLSelectElement).disabled = true;
    }
    const ej2 = $('endpointJudge2');
    if (ej2) (ej2 as HTMLInputElement).value = '';
    const akj2 = $('apiKeyJudge2');
    if (akj2) (akj2 as HTMLInputElement).value = '';
    const mj2 = $('modelsJudge2');
    if (mj2) mj2.classList.add('hidden');
    const bsj2 = $('btnStartJudge2');
    if (bsj2) (bsj2 as HTMLButtonElement).disabled = true;

    // Reset statement and start button
    const stmt = $('statement');
    if (stmt) (stmt as HTMLTextAreaElement).value = '';
    const btn = $('btnStartDebate');
    if (btn) {
      (btn as HTMLButtonElement).disabled = true;
      (btn as HTMLButtonElement).classList.add('btn-disabled');
      (btn as HTMLButtonElement).setAttribute('aria-disabled', 'true');
    }

    // Reset advanced settings panel
    const promptA = $('promptA');
    if (promptA) (promptA as HTMLTextAreaElement).value = '';
    const promptB = $('promptB');
    if (promptB) (promptB as HTMLTextAreaElement).value = '';
    const promptJudge = $('promptJudge');
    if (promptJudge) (promptJudge as HTMLTextAreaElement).value = '';
    const temperature = $('temperature');
    if (temperature) (temperature as HTMLInputElement).value = '0.7';
    const topP = $('topP');
    if (topP) (topP as HTMLInputElement).value = '';
    const topK = $('topK');
    if (topK) (topK as HTMLInputElement).value = '';
    const maxTokens = $('maxTokens');
    if (maxTokens) (maxTokens as HTMLInputElement).value = '';
    const judgeTemperature = $('judgeTemperature');
    if (judgeTemperature) (judgeTemperature as HTMLInputElement).value = '0.5';
    const judgeTopP = $('judgeTopP');
    if (judgeTopP) (judgeTopP as HTMLInputElement).value = '';
    const judgeTopK = $('judgeTopK');
    if (judgeTopK) (judgeTopK as HTMLInputElement).value = '';
    const judgeMaxTokens = $('judgeMaxTokens');
    if (judgeMaxTokens) (judgeMaxTokens as HTMLInputElement).value = '';
    const advPanel = $('advancedSettingsPanel');
    if (advPanel) advPanel.classList.add('hidden');
    const advToggle = $('btnAdvancedToggle');
    if (advToggle) advToggle.innerHTML = '⚙️ Advanced Settings';

    state.maxTurns = config.debate.maxTurns;
  }

  // Update TTS UI
  updateTTSEnableButton(state);

  // Hide retry buttons
  const rtt = $('btnRetryTurn');
  if (rtt) rtt.style.display = 'none';
  const rvt = $('btnRetryVerdict');
  if (rvt) rvt.style.display = 'none';

  showPhase('phase-setup');
}

/** Initialize all phase event listeners */
export function initApp() {
  // Bind new debate buttons
  $('btnNewDebate')?.addEventListener('click', () => resetToSetup(appState));
  $('btnNewDebate2')?.addEventListener('click', () => resetToSetup(appState));
}
