/**
 * Reset all state and UI back to the setup phase.
 */
function resetToSetup() {
  // Stop any playing TTS audio
  stopDebateAudio();

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

  // Update TTS UI
  updateTTSEnableButton();

  // Reset Side A
  const mA = $('modelA');
  if (mA) { mA.innerHTML = '<option value="">— fetch models first —</option>'; mA.disabled = true; }
  const eA = $('endpointA');
  if (eA) eA.value = '';
  const akA = $('apiKeyA');
  if (akA) akA.value = '';
  const mdsA = $('modelsA');
  if (mdsA) mdsA.classList.add('hidden');
  appState.modelsA = [];

  // Reset Side B
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

  // Hide retry buttons
  const rtt = $('btnRetryTurn');
  if (rtt) rtt.style.display = 'none';
  const rvt = $('btnRetryVerdict');
  if (rvt) rvt.style.display = 'none';

  showPhase('phase-setup');
}
