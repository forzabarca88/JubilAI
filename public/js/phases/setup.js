/**
 * Setup Phase — model fetching, readiness checks, and debate start.
 */

/**
 * Fetch models for a given panel (A, B, or Judge).
 * @param {string} panel - 'A' | 'B' | 'Judge'
 */
async function fetchModelsFor(panel) {
  const endpointId = panel === 'A' ? 'endpointA' : panel === 'B' ? 'endpointB' : 'endpointJudge';
  const apiKeyId = panel === 'A' ? 'apiKeyA' : panel === 'B' ? 'apiKeyB' : 'apiKeyJudge';
  const modelSelectId = panel === 'A' ? 'modelA' : panel === 'B' ? 'modelB' : 'judgeModelSelect';
  const fetchBtnId = panel === 'A' ? 'btnFetchA' : panel === 'B' ? 'btnFetchB' : 'btnFetchJudge';
  const modelsInfoId = panel === 'A' ? 'modelsAInfo' : panel === 'B' ? 'modelsBInfo' : 'modelsJudgeInfo';
  const modelsDivId = panel === 'A' ? 'modelsA' : panel === 'B' ? 'modelsB' : 'modelsJudge';

  const endpointEl = $(endpointId);
  const apiKeyEl = $(apiKeyId);
  if (!endpointEl) { showToast(`Missing element: ${endpointId}`, 'error'); return; }

  const url = endpointEl.value.trim().replace(/\/+$/, '');
  const apiKey = apiKeyEl ? apiKeyEl.value.trim() : '';

  if (!url) { showToast('Please enter an endpoint URL', 'error'); return; }

  const fetchBtn = $(fetchBtnId);
  if (fetchBtn) {
    fetchBtn.innerHTML = '<span class="spinner"></span> Fetching...';
    fetchBtn.disabled = true;
  }

  try {
    const res = await appApi.fetchModels(url, apiKey);
    const data = await res.json();

    if (!res.ok) { showToast(data.error || 'Failed to fetch models', 'error'); return; }

    const models = data.models || [];

    // Store models
    if (panel === 'A') appState.modelsA = models;
    else if (panel === 'B') appState.modelsB = models;
    else appState.modelsJudge = models;

    // Populate dropdown
    const select = $(modelSelectId);
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

    const modelsDiv = $(modelsDivId);
    const modelsInfo = $(modelsInfoId);
    if (modelsDiv) modelsDiv.classList.remove('hidden');
    if (modelsInfo) modelsInfo.textContent = `${models.length} models available`;

    if (fetchBtn) {
      fetchBtn.innerHTML = '🔄 Refresh';
      fetchBtn.disabled = false;
    }

    showToast(`Found ${models.length} models for ${panel === 'Judge' ? 'Judge' : 'Side ' + panel}`, 'success');
  } catch (err) {
    showToast('Network error: ' + err.message, 'error');
  }

  if (fetchBtn) {
    fetchBtn.innerHTML = '🔄 Refresh';
    fetchBtn.disabled = false;
  }

  checkSetupReady();
}

/** Check if all required fields are filled to enable start button */
function checkSetupReady() {
  const stmt = $('statement');
  const mA = $('modelA');
  const mB = $('modelB');
  const eA = $('endpointA');
  const eB = $('endpointB');
  const btn = $('btnStartDebate');

  const hasStatement = stmt && stmt.value.trim().length > 0;
  const hasModelA = mA && mA.value !== '';
  const hasModelB = mB && mB.value !== '';
  const hasEndpointA = eA && eA.value.trim().length > 0;
  const hasEndpointB = eB && eB.value.trim().length > 0;

  if (btn) btn.disabled = !(hasStatement && hasModelA && hasModelB && hasEndpointA && hasEndpointB);
}

/** Bind setup phase event listeners */
function initSetupPhase() {
  $('btnFetchA').onclick = () => fetchModelsFor('A');
  $('btnFetchB').onclick = () => fetchModelsFor('B');
  $('btnFetchJudge').onclick = () => fetchModelsFor('Judge');
  $('statement').oninput = checkSetupReady;
  $('endpointA').oninput = checkSetupReady;
  $('endpointB').oninput = checkSetupReady;

  $('btnStartDebate').onclick = async () => {
    const stmt = $('statement');
    const statement = stmt ? stmt.value.trim() : '';
    if (!statement) { showToast('Please enter a statement', 'error'); return; }

    const btn = $('btnStartDebate');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Starting...';
    }

    // Gather judge config (optional)
    const judgeModel = $('judgeModelSelect')?.value || '';
    const endpointJudge = $('endpointJudge')?.value.trim().replace(/\/+$/, '') || '';
    const apiKeyJudge = $('apiKeyJudge')?.value.trim() || '';

    try {
      const res = await appApi.createDebate({
        statement,
        modelA: $('modelA')?.value || '',
        modelB: $('modelB')?.value || '',
        endpointA: $('endpointA')?.value.trim().replace(/\/+$/, '') || '',
        apiKeyA: $('apiKeyA')?.value.trim() || '',
        endpointB: $('endpointB')?.value.trim().replace(/\/+$/, '') || '',
        apiKeyB: $('apiKeyB')?.value.trim() || '',
        judgeModel: judgeModel || null,
        endpointJudge: endpointJudge || null,
        apiKeyJudge: apiKeyJudge || null,
      });

      const data = await res.json();
      if (!res.ok) { showToast(data.error || 'Failed to start debate', 'error'); return; }

      appState.debateId = data.id;
      appState.debateData = {
        statement: data.statement,
        modelA: data.modelA,
        modelB: data.modelB,
        endpointA: $('endpointA')?.value.trim().replace(/\/+$/, '') || '',
        endpointB: $('endpointB')?.value.trim().replace(/\/+$/, '') || '',
        endpointJudge: endpointJudge || null,
        messages: [],
        nextSpeaker: data.nextSpeaker,
        countA: 0,
        countB: 0,
        phase: data.phase,
        judgeModel: data.judgeModel || null,
      };
      appState.currentSpeaker = data.nextSpeaker;
      appState.countA = 0;
      appState.countB = 0;
      appState.autoJudge = data.autoJudge || false;

      // Setup debate view
      const ds = $('debateStatement');
      if (ds) ds.textContent = `"${statement}"`;
      const dMA = $('debateModelA');
      if (dMA) dMA.textContent = `Model: ${appState.debateData.modelA}`;
      const dEA = $('debateEndpointA');
      if (dEA) dEA.textContent = `Endpoint: ${appState.debateData.endpointA}`;
      const dMB = $('debateModelB');
      if (dMB) dMB.textContent = `Model: ${appState.debateData.modelB}`;
      const dEB = $('debateEndpointB');
      if (dEB) dEB.textContent = `Endpoint: ${appState.debateData.endpointB}`;
      const ds2 = $('debateStream');
      if (ds2) ds2.innerHTML = '';

      renderDebateProgress();
      showPhase('phase-debate');
      updateDebateStatus();
      const autoMsg = appState.autoJudge ? ' (auto-judge enabled)' : '';
      showToast(`Debate started! Turns advance automatically.${autoMsg}`, 'success');

      // Auto-start the first turn
      appState.isStreaming = false;
      await executeNextTurn();
    } catch (err) {
      showToast('Network error: ' + err.message, 'error');
    }

    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '⚔️ Start Debate';
    }
  };
}
