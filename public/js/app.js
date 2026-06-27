/**
 * Reset all state and UI back to the setup phase.
 */
function resetToSetup() {
  // Clear session restored flag so next page load will re-restore
  appState.sessionRestored = false;

  // Stop any playing TTS audio and clean up model
  stopDebateAudio();
  ttsManager.destroy();

  appState.debateId = null;
  appState.debateData = null;
  appState.currentSpeaker = null;
  appState.countA = 0;
  appState.countB = 0;
  appState.isStreaming = false;
  appState.autoJudge = false;

  // Reset TTS state
  appState.ttsEnabled = false;
  appState.ttsSpeakerVoices = {};
  appState.ttsActiveSpeaker = null;
  appState.ttsPaused = false;

  // Reset advanced settings
  appState.advancedSettings = {
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

  // Update TTS UI
  updateTTSEnableButton();

  // Reset The Affirmative
  const mA = $('modelA');
  if (mA) { mA.innerHTML = '<option value="">— fetch models first —</option>'; mA.disabled = true; }
  const eA = $('endpointA');
  if (eA) eA.value = '';
  const akA = $('apiKeyA');
  if (akA) akA.value = '';
  const mdsA = $('modelsA');
  if (mdsA) mdsA.classList.add('hidden');
  appState.modelsA = [];

  // Reset The Negative
  const mB = $('modelB');
  if (mB) { mB.innerHTML = '<option value="">— fetch models first —</option>'; mB.disabled = true; }
  const eB = $('endpointB');
  if (eB) eB.value = '';
  const akB = $('apiKeyB');
  if (akB) akB.value = '';
  const mdsB = $('modelsB');
  if (mdsB) mdsB.classList.add('hidden');
  appState.modelsB = [];

  // Reset Judge (setup phase)
  const jms = $('judgeModelSelect');
  if (jms) { jms.innerHTML = '<option value="">— fetch models first —</option>'; jms.disabled = true; }
  const ej = $('endpointJudge');
  if (ej) ej.value = '';
  const akj = $('apiKeyJudge');
  if (akj) akj.value = '';
  const mj = $('modelsJudge');
  if (mj) mj.classList.add('hidden');
  appState.modelsJudge = [];

  // Reset Judge-select phase
  const jms2 = $('judgeModelSelect2');
  if (jms2) { jms2.innerHTML = '<option value="">— fetch models first —</option>'; jms2.disabled = true; }
  const ej2 = $('endpointJudge2');
  if (ej2) ej2.value = '';
  const akj2 = $('apiKeyJudge2');
  if (akj2) akj2.value = '';
  const mj2 = $('modelsJudge2');
  if (mj2) mj2.classList.add('hidden');
  const bsj2 = $('btnStartJudge2');
  if (bsj2) bsj2.disabled = true;

  // Reset statement and start button
  const stmt = $('statement');
  if (stmt) stmt.value = '';
  const btn = $('btnStartDebate');
  if (btn) btn.disabled = true;

  // Reset advanced settings panel
  const promptA = $('promptA');
  if (promptA) promptA.value = '';
  const promptB = $('promptB');
  if (promptB) promptB.value = '';
  const promptJudge = $('promptJudge');
  if (promptJudge) promptJudge.value = '';
  const temperature = $('temperature');
  if (temperature) temperature.value = '0.7';
  const topP = $('topP');
  if (topP) topP.value = '';
  const topK = $('topK');
  if (topK) topK.value = '';
  const maxTokens = $('maxTokens');
  if (maxTokens) maxTokens.value = '';
  const judgeTemperature = $('judgeTemperature');
  if (judgeTemperature) judgeTemperature.value = '0.5';
  const judgeTopP = $('judgeTopP');
  if (judgeTopP) judgeTopP.value = '';
  const judgeTopK = $('judgeTopK');
  if (judgeTopK) judgeTopK.value = '';
  const judgeMaxTokens = $('judgeMaxTokens');
  if (judgeMaxTokens) judgeMaxTokens.value = '';
  const advPanel = $('advancedSettingsPanel');
  if (advPanel) advPanel.classList.add('hidden');
  const advToggle = $('btnAdvancedToggle');
  if (advToggle) advToggle.innerHTML = '⚙️ Advanced Settings';

  // Hide retry buttons
  const rtt = $('btnRetryTurn');
  if (rtt) rtt.style.display = 'none';
  const rvt = $('btnRetryVerdict');
  if (rvt) rvt.style.display = 'none';

  showPhase('phase-setup');
}
