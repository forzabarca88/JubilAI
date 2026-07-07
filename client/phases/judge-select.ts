/**
 * Judge-Select Phase — shown when debate completes without pre-configured judge.
 * Replaces `public/js/phases/judge-select.js`.
 */

import { getConfig } from '../config';
import { $, showToast, showPhase } from '../dom/helpers';
import { resetDomToDefaults, JUDGE_SELECT_BINDINGS } from '../dom/bindings';
import { apiClient } from '../api/client';
import type { AppState } from '../state/app-state';
import type { ErrorResponse } from '../../shared/types/api';
import { runVerdict } from './verdict';

/** Transition to the judge-select phase */
export async function transitionToJudgeSelect(state: AppState) {
  // Skip in kiosk mode — the phase DOM is hidden via CSS
  if (getConfig().kiosk.enabled) return;

  showPhase('phase-judge-select');
  const js = $('judgeStatement');
  if (js) js.textContent = `"${state.debateData!.statement}"`;
  const badge = $('statusBadge');
  if (badge) { badge.classList.remove('hidden'); badge.className = 'status-badge waiting'; }
  const st = $('statusText');
  if (st) st.textContent = 'Select a judge';

  // Reset judge-select form via binding layer
  resetDomToDefaults(JUDGE_SELECT_BINDINGS);

  // Pre-fill judge endpoint with The Affirmative's endpoint as default
  const ej = $('endpointJudge2');
  if (ej) (ej as HTMLInputElement).value = state.debateData!.endpointA || '';
}

/** Check if judge-select form is ready */
function checkJudgeSelectReady(state: AppState) {
  const m = $('judgeModelSelect2');
  const e = $('endpointJudge2');
  const btn = $('btnStartJudge2');

  const hasModel = m && (m as HTMLSelectElement).value !== '';
  const hasEndpoint = e && (e as HTMLInputElement).value.trim().length > 0;

  if (btn) {
    (btn as HTMLButtonElement).disabled = !(hasModel && hasEndpoint);
  }
}

/** Fetch models for the judge-select phase */
async function fetchModelsForJudgeSelect(state: AppState) {
  const endpointEl = $('endpointJudge2');
  const apiKeyEl = $('apiKeyJudge2');
  if (!endpointEl) { showToast('Missing element: endpointJudge2', 'error'); return; }

  const url = (endpointEl as HTMLInputElement).value.trim().replace(/\/+$/, '');
  const apiKey = apiKeyEl ? (apiKeyEl as HTMLInputElement).value.trim() : '';

  if (!url) { showToast('Please enter an endpoint URL', 'error'); return; }

  const fetchBtn = $('btnFetchJudge2');
  if (fetchBtn) {
    fetchBtn.innerHTML = '<span class="spinner"></span> Fetching...';
    (fetchBtn as HTMLButtonElement).disabled = true;
  }

  try {
    const res = await apiClient.fetchModels(url, apiKey || undefined);
    const data = await apiClient.parseJson<{ models: { id: string }[] }>(res);

    if (!res.ok) { showToast((data as unknown as ErrorResponse).error || 'Failed to fetch models', 'error'); return; }

    const models = data.models || [];
    state.modelsJudge = models;

    const select = $('judgeModelSelect2');
    if (select) {
      const oldOnChange = (select as HTMLSelectElement).onchange;
      (select as HTMLSelectElement).onchange = null;
      select.innerHTML = '<option value="">— select a model —</option>';
      models.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = m.id;
        select.appendChild(opt);
      });
      (select as HTMLSelectElement).disabled = false;
      (select as HTMLSelectElement).onchange = oldOnChange;
    }

    const modelsDiv = $('modelsJudge2');
    const modelsInfo = $('modelsJudge2Info');
    if (modelsDiv) modelsDiv.classList.remove('hidden');
    if (modelsInfo) modelsInfo.textContent = `${models.length} models available`;

    showToast(`Found ${models.length} models for Judge`, 'success');
  } catch (err) {
    showToast('Network error: ' + (err as Error).message, 'error');
  } finally {
    if (fetchBtn) {
      fetchBtn.innerHTML = '🔄 Refresh';
      (fetchBtn as HTMLButtonElement).disabled = false;
    }
  }

  checkJudgeSelectReady(state);
}

/** Bind judge-select phase event listeners */
export function initJudgeSelectPhase(state: AppState) {
  $('btnFetchJudge2')?.addEventListener('click', () => fetchModelsForJudgeSelect(state));
  $('judgeModelSelect2')?.addEventListener('change', () => checkJudgeSelectReady(state));
  $('endpointJudge2')?.addEventListener('input', () => checkJudgeSelectReady(state));

  $('btnStartJudge2')?.addEventListener('click', async () => {
    const jms = $('judgeModelSelect2');
    const ej = $('endpointJudge2');
    const akj = $('apiKeyJudge2');
    const judgeModel = jms ? (jms as HTMLSelectElement).value : '';
    const endpointJudge = ej ? (ej as HTMLInputElement).value.trim().replace(/\/+$/, '') : '';
    const apiKeyJudge = akj ? (akj as HTMLInputElement).value.trim() : '';

    if (!judgeModel) { showToast('Please select a judge model', 'error'); return; }
    if (!endpointJudge) { showToast('Please enter a judge endpoint URL', 'error'); return; }

    const btn = $('btnStartJudge2');
    if (btn) {
      (btn as HTMLButtonElement).disabled = true;
      (btn as HTMLButtonElement).innerHTML = '<span class="spinner"></span> Setting up judge...';
    }

    try {
      const res = await apiClient.setJudge(state.debateId!, { judgeModel, endpointJudge, apiKeyJudge });
      const data = await apiClient.parseJson<{ phase: string; judgeModel: string }>(res);
      if (!res.ok) { showToast((data as unknown as ErrorResponse).error || 'Failed', 'error'); return; }

      state.debateData!.judgeModel = judgeModel;
      state.debateData!.endpointJudge = endpointJudge;
      state.debateData!.phase = data.phase as 'judging';

      await runVerdict(judgeModel, endpointJudge, state);
    } catch (err) {
      showToast('Network error: ' + (err as Error).message, 'error');
      if (btn) {
        (btn as HTMLButtonElement).disabled = false;
        (btn as HTMLButtonElement).innerHTML = '⚖️ Begin Judgment';
      }
    }
  });
}
