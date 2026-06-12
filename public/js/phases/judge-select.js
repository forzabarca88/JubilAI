/**
 * Judge-Select Phase — shown when debate completes without pre-configured judge.
 */

/** Transition to the judge-select phase */
async function transitionToJudgeSelect() {
  showPhase('phase-judge-select');
  const js = $('judgeStatement');
  if (js) js.textContent = `"${appState.debateData.statement}"`;
  const badge = $('statusBadge');
  if (badge) { badge.classList.remove('hidden'); badge.className = 'status-badge waiting'; }
  const st = $('statusText');
  if (st) st.textContent = 'Select a judge';

  // Pre-fill judge endpoint with The Affirmative's endpoint as default
  const ej = $('endpointJudge2');
  if (ej) ej.value = appState.debateData.endpointA || '';
  const akj = $('apiKeyJudge2');
  if (akj) akj.value = '';
  const jms = $('judgeModelSelect2');
  if (jms) {
    jms.innerHTML = '<option value="">— fetch models first —</option>';
    jms.disabled = true;
  }
  const mj = $('modelsJudge2');
  if (mj) mj.classList.add('hidden');
  const bsj = $('btnStartJudge2');
  if (bsj) bsj.disabled = true;
}

/** Check if judge-select form is ready */
function checkJudgeSelectReady() {
  const m = $('judgeModelSelect2');
  const e = $('endpointJudge2');
  const btn = $('btnStartJudge2');

  const hasModel = m && m.value !== '';
  const hasEndpoint = e && e.value.trim().length > 0;

  if (btn) btn.disabled = !(hasModel && hasEndpoint);
}

/** Bind judge-select phase event listeners */
function initJudgeSelectPhase() {
  $('btnFetchJudge2').onclick = () => fetchModelsFor('Judge');
  $('judgeModelSelect2').onchange = checkJudgeSelectReady;
  $('endpointJudge2').oninput = checkJudgeSelectReady;

  $('btnStartJudge2').onclick = async () => {
    const jms = $('judgeModelSelect2');
    const ej = $('endpointJudge2');
    const akj = $('apiKeyJudge2');
    const judgeModel = jms ? jms.value : '';
    const endpointJudge = ej ? ej.value.trim().replace(/\/+$/, '') : '';
    const apiKeyJudge = akj ? akj.value.trim() : '';

    if (!judgeModel) { showToast('Please select a judge model', 'error'); return; }
    if (!endpointJudge) { showToast('Please enter a judge endpoint URL', 'error'); return; }

    const btn = $('btnStartJudge2');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Setting up judge...'; }

    try {
      const res = await appApi.setJudge(appState.debateId, { judgeModel, endpointJudge, apiKeyJudge });
      const data = await res.json();
      if (!res.ok) { showToast(data.error || 'Failed', 'error'); return; }

      appState.debateData.judgeModel = judgeModel;
      appState.debateData.endpointJudge = endpointJudge;
      appState.debateData.phase = 'judging';

      await runVerdict(judgeModel, endpointJudge);
    } catch (err) {
      showToast('Network error: ' + err.message, 'error');
      if (btn) { btn.disabled = false; btn.innerHTML = '⚖️ Begin Judgment'; }
    }
  };
}
