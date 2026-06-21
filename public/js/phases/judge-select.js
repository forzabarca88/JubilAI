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

/** Fetch models for the judge-select phase (reads from *2 elements, not setup-phase elements) */
async function fetchModelsForJudgeSelect() {
  const endpointEl = $('endpointJudge2');
  const apiKeyEl = $('apiKeyJudge2');
  if (!endpointEl) { showToast('Missing element: endpointJudge2', 'error'); return; }

  const url = endpointEl.value.trim().replace(/\/+$/, '');
  const apiKey = apiKeyEl ? apiKeyEl.value.trim() : '';

  if (!url) { showToast('Please enter an endpoint URL', 'error'); return; }

  const fetchBtn = $('btnFetchJudge2');
  if (fetchBtn) {
    fetchBtn.innerHTML = '<span class="spinner"></span> Fetching...';
    fetchBtn.disabled = true;
  }

  try {
    const res = await appApi.fetchModels(url, apiKey);
    const data = await res.json();

    if (!res.ok) { showToast(data.error || 'Failed to fetch models', 'error'); return; }

    const models = data.models || [];
    appState.modelsJudge = models;

    const select = $('judgeModelSelect2');
    if (select) {
      const oldOnChange = select.onchange;
      select.onchange = null;
      select.innerHTML = '<option value="">— select a model —</option>';
      models.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = m.id;
        select.appendChild(opt);
      });
      select.disabled = false;
      select.onchange = oldOnChange;
    }

    const modelsDiv = $('modelsJudge2');
    const modelsInfo = $('modelsJudge2Info');
    if (modelsDiv) modelsDiv.classList.remove('hidden');
    if (modelsInfo) modelsInfo.textContent = `${models.length} models available`;

    showToast(`Found ${models.length} models for Judge`, 'success');
  } catch (err) {
    showToast('Network error: ' + err.message, 'error');
  } finally {
    if (fetchBtn) {
      fetchBtn.innerHTML = '🔄 Refresh';
      fetchBtn.disabled = false;
    }
  }

  checkJudgeSelectReady();
}

/** Bind judge-select phase event listeners */
function initJudgeSelectPhase() {
  $('btnFetchJudge2').onclick = () => fetchModelsForJudgeSelect();
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
