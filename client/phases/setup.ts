/**
 * Setup Phase — model fetching, readiness checks, and debate start (typed).
 * Uses `addEventListener` instead of HTML `onclick`.
 */

import { getConfig } from '../config';
import { $, showToast, showPhase } from '../dom/helpers';
import { gatherAdvancedSettingsFromDom } from '../dom/bindings';
import { renderDebateProgress, updateDebateStatus, showRetryTurn, hideRetryTurn } from '../dom/debate-ui';
import { apiClient } from '../api/client';
import { sessionStorage } from '../session/session-storage';
import type { AppState } from '../state/app-state';
import type { ModelInfo, DebateCreateBody, ValidateResponse } from '../../shared/types/api';
import { startDebateAudio, stopDebateAudio } from '../tts/manager';
import { updateTTSEnableButton } from '../dom/tts-ui';
import { initDebatePhase, executeNextTurn } from './debate';
import { runVerdict } from './verdict';
import { transitionToJudgeSelect } from './judge-select';

type Panel = 'A' | 'B' | 'Judge';

const PANEL_CONFIG: Record<Panel, {
  endpointId: string;
  apiKeyId: string;
  modelSelectId: string;
  fetchBtnId: string;
  modelsInfoId: string;
  modelsDivId: string;
  stateKey: 'modelsA' | 'modelsB' | 'modelsJudge';
  label: string;
}> = {
  A: {
    endpointId: 'endpointA',
    apiKeyId: 'apiKeyA',
    modelSelectId: 'modelA',
    fetchBtnId: 'btnFetchA',
    modelsInfoId: 'modelsAInfo',
    modelsDivId: 'modelsA',
    stateKey: 'modelsA',
    label: 'The Affirmative',
  },
  B: {
    endpointId: 'endpointB',
    apiKeyId: 'apiKeyB',
    modelSelectId: 'modelB',
    fetchBtnId: 'btnFetchB',
    modelsInfoId: 'modelsBInfo',
    modelsDivId: 'modelsB',
    stateKey: 'modelsB',
    label: 'The Negative',
  },
  Judge: {
    endpointId: 'endpointJudge',
    apiKeyId: 'apiKeyJudge',
    modelSelectId: 'judgeModelSelect',
    fetchBtnId: 'btnFetchJudge',
    modelsInfoId: 'modelsJudgeInfo',
    modelsDivId: 'modelsJudge',
    stateKey: 'modelsJudge',
    label: 'Judge',
  },
};

/** Fetch models for a given panel */
async function fetchModelsFor(panel: Panel, state: AppState) {
  const cfg = PANEL_CONFIG[panel];
  const endpointEl = $(cfg.endpointId);
  const apiKeyEl = $(cfg.apiKeyId);
  if (!endpointEl) { showToast(`Missing element: ${cfg.endpointId}`, 'error'); return; }

  const url = (endpointEl as HTMLInputElement).value.trim().replace(/\/+$/, '');
  const apiKey = apiKeyEl ? (apiKeyEl as HTMLInputElement).value.trim() : '';

  if (!url) { showToast('Please enter an endpoint URL', 'error'); return; }

  const fetchBtn = $(cfg.fetchBtnId);
  if (fetchBtn) {
    fetchBtn.innerHTML = '<span class="spinner"></span> Fetching...';
    (fetchBtn as HTMLButtonElement).disabled = true;
  }

  try {
    const res = await apiClient.fetchModels(url, apiKey || undefined);
    const data = await apiClient.json<{ models: ModelInfo[] }>(res);

    const models = data.models || [];
    state[cfg.stateKey] = models;

    const select = $(cfg.modelSelectId);
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

    const modelsDiv = $(cfg.modelsDivId);
    const modelsInfo = $(cfg.modelsInfoId);
    if (modelsDiv) modelsDiv.classList.remove('hidden');
    if (modelsInfo) modelsInfo.textContent = `${models.length} models available`;

    showToast(`Found ${models.length} models for ${cfg.label}`, 'success');
  } catch (err) {
    showToast('Network error: ' + (err as Error).message, 'error');
  } finally {
    if (fetchBtn) {
      fetchBtn.innerHTML = '🔄 Refresh';
      (fetchBtn as HTMLButtonElement).disabled = false;
    }
  }

  checkSetupReady(state);
}

/** Check if all required fields are filled to enable start button */
function checkSetupReady(state: AppState) {
  const config = getConfig();

  // Kiosk mode: only statement is required
  if (config.kiosk.enabled) {
    const stmt = $('statement');
    const btn = $('btnStartDebate');
    const hasStatement = stmt && (stmt as HTMLTextAreaElement).value.trim().length > 0;
    if (btn) {
      btn.classList.toggle('btn-disabled', !hasStatement);
      btn.setAttribute('aria-disabled', hasStatement ? 'false' : 'true');
    }
    if (btn) (btn as unknown as Record<string, unknown>)._missing = hasStatement ? [] : ['Statement'];
    return;
  }

  const stmt = $('statement');
  const mA = $('modelA');
  const mB = $('modelB');
  const eA = $('endpointA');
  const eB = $('endpointB');
  const btn = $('btnStartDebate');

  const hasStatement = stmt && (stmt as HTMLTextAreaElement).value.trim().length > 0;
  const hasModelA = mA && (mA as HTMLSelectElement).value !== '';
  const hasModelB = mB && (mB as HTMLSelectElement).value !== '';
  const hasEndpointA = eA && (eA as HTMLInputElement).value.trim().length > 0;
  const hasEndpointB = eB && (eB as HTMLInputElement).value.trim().length > 0;

  const ready = hasStatement && hasModelA && hasModelB && hasEndpointA && hasEndpointB;
  if (btn) {
    btn.classList.toggle('btn-disabled', !ready);
    btn.setAttribute('aria-disabled', ready ? 'false' : 'true');
  }

  const missing: string[] = [];
  if (!hasStatement) missing.push('Statement');
  if (!hasEndpointA) missing.push('Affirmative endpoint');
  if (!hasModelA) missing.push('Affirmative model');
  if (!hasEndpointB) missing.push('Negative endpoint');
  if (!hasModelB) missing.push('Negative model');
  if (btn) (btn as unknown as Record<string, unknown>)._missing = missing;
}



/** Bind setup phase event listeners using addEventListener */
export function initSetupPhase(state: AppState) {
  const config = getConfig();

  // Model fetch buttons
  $('btnFetchA')?.addEventListener('click', () => fetchModelsFor('A', state));
  $('btnFetchB')?.addEventListener('click', () => fetchModelsFor('B', state));
  $('btnFetchJudge')?.addEventListener('click', () => fetchModelsFor('Judge', state));

  // Readiness checks on input
  $('statement')?.addEventListener('input', () => checkSetupReady(state));
  $('endpointA')?.addEventListener('input', () => checkSetupReady(state));
  $('endpointB')?.addEventListener('input', () => checkSetupReady(state));
  $('modelA')?.addEventListener('change', () => checkSetupReady(state));
  $('modelB')?.addEventListener('change', () => checkSetupReady(state));

  // Advanced settings toggle
  $('btnAdvancedToggle')?.addEventListener('click', () => {
    const panel = $('advancedSettingsPanel');
    const btn = $('btnAdvancedToggle');
    if (!panel) return;

    const isExpanded = panel.classList.toggle('hidden');
    if (btn) {
      btn.innerHTML = isExpanded ? '⚙️ Advanced Settings' : '⚙️ Hide Advanced Settings';
    }

    // Pre-fill prompts with defaults on first expand if blank
    if (isExpanded === false) {
      const promptA = $('promptA') as HTMLTextAreaElement | null;
      const promptB = $('promptB') as HTMLTextAreaElement | null;
      const promptJudge = $('promptJudge') as HTMLTextAreaElement | null;
      if (promptA && !promptA.value.trim()) promptA.value = config.prompts.affirmative;
      if (promptB && !promptB.value.trim()) promptB.value = config.prompts.negative;
      if (promptJudge && !promptJudge.value.trim()) promptJudge.value = config.prompts.judge;
    }
  });

  // Reset prompt buttons
  $('promptA')?.parentElement?.querySelector<HTMLButtonElement>('button[onclick]')
    ?.addEventListener('click', () => resetPrompt('A', config.prompts.affirmative));
  $('promptB')?.parentElement?.querySelector<HTMLButtonElement>('button[onclick]')
    ?.addEventListener('click', () => resetPrompt('B', config.prompts.negative));
  $('promptJudge')?.parentElement?.querySelector<HTMLButtonElement>('button[onclick]')
    ?.addEventListener('click', () => resetPrompt('Judge', config.prompts.judge));

  // Session restore
  sessionStorage.restore().then(restored => {
    if (restored) {
      state.sessionRestored = true;
      const promises: Promise<void>[] = [];
      if ($('endpointA')?.textContent?.trim()) promises.push(fetchModelsFor('A', state));
      if ($('endpointB')?.textContent?.trim()) promises.push(fetchModelsFor('B', state));
      if ($('endpointJudge')?.textContent?.trim()) promises.push(fetchModelsFor('Judge', state));

      // Check actual input values
      const epA = $('endpointA') as HTMLInputElement | null;
      const epB = $('endpointB') as HTMLInputElement | null;
      const epJ = $('endpointJudge') as HTMLInputElement | null;
      const p2: Promise<void>[] = [];
      if (epA?.value.trim()) p2.push(fetchModelsFor('A', state));
      if (epB?.value.trim()) p2.push(fetchModelsFor('B', state));
      if (epJ?.value.trim()) p2.push(fetchModelsFor('Judge', state));

      if (p2.length > 0) {
        Promise.all(p2).finally(() => {
          sessionStorage.applyModelSelections(state);
          checkSetupReady(state);
        });
      } else {
        sessionStorage.applyModelSelections(state);
        checkSetupReady(state);
      }
    }
  }).catch(err => {
    console.warn('[Session] Restore failed:', (err as Error).message);
  });

  // Start debate button
  $('btnStartDebate')?.addEventListener('click', async () => {
    const btn = $('btnStartDebate');
    if (btn?.classList.contains('btn-disabled') && (btn as unknown as Record<string, unknown>)._missing) {
      const missing = (btn as unknown as Record<string, string[]>)._missing;
      if (missing && missing.length > 0) {
        showToast('Need: ' + missing.join(', '), 'error');
        return;
      }
    }

    const stmt = $('statement') as HTMLTextAreaElement | null;
    const statement = stmt?.value.trim() || '';
    if (!statement) { showToast('Please enter a statement', 'error'); return; }

    if (btn) {
      btn.classList.add('btn-disabled');
      btn.setAttribute('aria-disabled', 'true');
      btn.innerHTML = '<span class="spinner"></span> Starting...';
    }

    const config = getConfig();
    let body: DebateCreateBody;

    if (config.kiosk.enabled) {
      // Kiosk mode: construct body from config
      body = {
        statement,
        modelA: config.kiosk.modelA,
        modelB: config.kiosk.modelB,
        endpointA: config.kiosk.endpointA,
        apiKeyA: config.kiosk.apiKeyA || undefined,
        endpointB: config.kiosk.endpointB,
        apiKeyB: config.kiosk.apiKeyB || undefined,
        judgeModel: config.kiosk.modelJudge || undefined,
        endpointJudge: config.kiosk.endpointJudge || undefined,
        apiKeyJudge: config.kiosk.apiKeyJudge || undefined,
        promptA: config.kiosk.promptA || undefined,
        promptB: config.kiosk.promptB || undefined,
        promptJudge: config.kiosk.promptJudge || undefined,
        temperature: config.kiosk.temperature,
        topP: config.kiosk.topP,
        topK: config.kiosk.topK,
        maxTokens: config.kiosk.maxTokens,
        judgeTemperature: config.kiosk.judgeTemperature,
        judgeTopP: config.kiosk.judgeTopP,
        judgeTopK: config.kiosk.judgeTopK,
        judgeMaxTokens: config.kiosk.judgeMaxTokens,
      };

      // Set state from kiosk config
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
    } else {
      // Normal mode: gather from DOM
      const endpointA = $('endpointA') ? ($('endpointA') as HTMLInputElement).value.trim().replace(/\/+$/, '') : '';
      const apiKeyA = $('apiKeyA') ? ($('apiKeyA') as HTMLInputElement).value.trim() : '';
      const modelA = $('modelA') ? ($('modelA') as HTMLSelectElement).value : '';
      const endpointB = $('endpointB') ? ($('endpointB') as HTMLInputElement).value.trim().replace(/\/+$/, '') : '';
      const apiKeyB = $('apiKeyB') ? ($('apiKeyB') as HTMLInputElement).value.trim() : '';
      const modelB = $('modelB') ? ($('modelB') as HTMLSelectElement).value : '';
      const judgeModel = $('judgeModelSelect') ? ($('judgeModelSelect') as HTMLSelectElement).value : '';
      const endpointJudge = $('endpointJudge') ? ($('endpointJudge') as HTMLInputElement).value.trim().replace(/\/+$/, '') : '';
      const apiKeyJudge = $('apiKeyJudge') ? ($('apiKeyJudge') as HTMLInputElement).value.trim() : '';

      const settings = gatherAdvancedSettingsFromDom();
      state.advancedSettings = settings;

      body = {
        statement,
        modelA,
        modelB,
        endpointA,
        apiKeyA,
        endpointB,
        apiKeyB,
        judgeModel: judgeModel || undefined,
        endpointJudge: endpointJudge || undefined,
        apiKeyJudge: apiKeyJudge || undefined,
        promptA: settings.promptA || undefined,
        promptB: settings.promptB || undefined,
        promptJudge: settings.promptJudge || undefined,
        temperature: settings.temperature !== undefined ? settings.temperature : undefined,
        topP: settings.topP !== undefined ? settings.topP : undefined,
        topK: settings.topK !== undefined ? settings.topK : undefined,
        maxTokens: settings.maxTokens !== undefined ? settings.maxTokens : undefined,
        judgeTemperature: settings.judgeTemperature !== undefined ? settings.judgeTemperature : undefined,
        judgeTopP: settings.judgeTopP !== undefined ? settings.judgeTopP : undefined,
        judgeTopK: settings.judgeTopK !== undefined ? settings.judgeTopK : undefined,
        judgeMaxTokens: settings.judgeMaxTokens !== undefined ? settings.judgeMaxTokens : undefined,
      };
    }

    // Pre-flight validation: verify endpoints and models are accessible
    // (non-blocking — warns on failure but allows debate to proceed)
    if (!config.kiosk.enabled) {
      const validations: Promise<ValidateResponse>[] = [];

      // Validate Affirmative endpoint
      const epA = $('endpointA') ? ($('endpointA') as HTMLInputElement).value.trim().replace(/\/+$/, '') : '';
      const akA = $('apiKeyA') ? ($('apiKeyA') as HTMLInputElement).value.trim() : '';
      const mA = $('modelA') ? ($('modelA') as HTMLSelectElement).value : '';
      if (epA && mA) {
        validations.push(
          apiClient.json<ValidateResponse>(
            apiClient.validate({ url: epA, apiKey: akA || undefined, model: mA })
          ).catch(err => ({ valid: false, error: `Affirmative: ${err instanceof Error ? err.message : String(err)}`, models: [] }))
        );
      }

      // Validate Negative endpoint
      const epB = $('endpointB') ? ($('endpointB') as HTMLInputElement).value.trim().replace(/\/+$/, '') : '';
      const akB = $('apiKeyB') ? ($('apiKeyB') as HTMLInputElement).value.trim() : '';
      const mB = $('modelB') ? ($('modelB') as HTMLSelectElement).value : '';
      if (epB && mB) {
        validations.push(
          apiClient.json<ValidateResponse>(
            apiClient.validate({ url: epB, apiKey: akB || undefined, model: mB })
          ).catch(err => ({ valid: false, error: `Negative: ${err instanceof Error ? err.message : String(err)}`, models: [] }))
        );
      }

      // Validate Judge endpoint (if configured)
      const jm = $('judgeModelSelect') ? ($('judgeModelSelect') as HTMLSelectElement).value : '';
      const epJ = $('endpointJudge') ? ($('endpointJudge') as HTMLInputElement).value.trim().replace(/\/+$/, '') : '';
      const akJ = $('apiKeyJudge') ? ($('apiKeyJudge') as HTMLInputElement).value.trim() : '';
      if (epJ && jm) {
        validations.push(
          apiClient.json<ValidateResponse>(
            apiClient.validate({ url: epJ, apiKey: akJ || undefined, model: jm })
          ).catch(err => ({ valid: false, error: `Judge: ${err instanceof Error ? err.message : String(err)}`, models: [] }))
        );
      }

      if (validations.length > 0) {
        btn.innerHTML = '<span class="spinner"></span> Validating endpoints...';
        const results = await Promise.all(validations);
        const failures = results.filter(r => !r.valid);
        if (failures.length > 0) {
          const errorMsg = failures.map(f => f.error || 'unknown error').join('; ');
          showToast(`Warning: ${errorMsg} — proceeding anyway`, 'error');
        } else {
          showToast('Endpoints validated successfully', 'success');
        }
        btn.innerHTML = '<span class="spinner"></span> Starting...';
      }
    }

    try {
      const res = await apiClient.createDebate(body);
      const data = await apiClient.json<{
        id: string;
        statement: string;
        modelA: string;
        modelB: string;
        nextSpeaker: string | null;
        phase: string;
        judgeModel: string | null;
        autoJudge: boolean;
      }>(res);

      // Save session only in non-kiosk mode
      if (!config.kiosk.enabled) {
        const saveConfig = {
          statement,
          endpointA: body.endpointA, apiKeyA: body.apiKeyA, modelA: body.modelA,
          endpointB: body.endpointB, apiKeyB: body.apiKeyB, modelB: body.modelB,
          endpointJudge: body.endpointJudge, apiKeyJudge: body.apiKeyJudge,
          modelJudge: body.judgeModel,
          promptA: state.advancedSettings.promptA,
          promptB: state.advancedSettings.promptB,
          promptJudge: state.advancedSettings.promptJudge,
          temperature: state.advancedSettings.temperature,
          topP: state.advancedSettings.topP,
          topK: state.advancedSettings.topK,
          maxTokens: state.advancedSettings.maxTokens,
          judgeTemperature: state.advancedSettings.judgeTemperature,
          judgeTopP: state.advancedSettings.judgeTopP,
          judgeTopK: state.advancedSettings.judgeTopK,
          judgeMaxTokens: state.advancedSettings.judgeMaxTokens,
        };
        sessionStorage.save(saveConfig).catch(err => {
          console.warn('[Session] Save failed:', (err as Error).message);
        });
      }

      state.debateId = data.id;
      state.debateData = {
        statement: data.statement,
        modelA: data.modelA,
        modelB: data.modelB,
        endpointA: body.endpointA,
        endpointB: body.endpointB,
        endpointJudge: body.endpointJudge || null,
        messages: [],
        nextSpeaker: data.nextSpeaker as 'A' | 'B' | null,
        countA: 0,
        countB: 0,
        phase: data.phase as 'debating' | 'awaiting-judge' | 'judging' | 'complete',
        judgeModel: data.judgeModel || null,
      };
      state.currentSpeaker = data.nextSpeaker as 'A' | 'B' | null;
      state.countA = 0;
      state.countB = 0;
      state.autoJudge = data.autoJudge || false;

      // Setup debate view
      const ds = $('debateStatement');
      if (ds) ds.textContent = `"${statement}"`;
      const dMA = $('debateModelA');
      if (dMA) dMA.textContent = `Model: ${state.debateData.modelA}`;
      const dEA = $('debateEndpointA');
      if (dEA) dEA.textContent = `Endpoint: ${state.debateData.endpointA}`;
      const dMB = $('debateModelB');
      if (dMB) dMB.textContent = `Model: ${state.debateData.modelB}`;
      const dEB = $('debateEndpointB');
      if (dEB) dEB.textContent = `Endpoint: ${state.debateData.endpointB}`;
      const ds2 = $('debateStream');
      if (ds2) ds2.innerHTML = '';

      renderDebateProgress(state);
      showPhase('phase-debate');
      updateDebateStatus(state);

      // Initialize TTS
      try {
        await startDebateAudio(state);
      } catch (err) {
        console.warn('[TTS] Initialization failed, continuing without audio:', (err as Error).message);
        state.tts.enabled = false;
      }
      updateTTSEnableButton(state);

      const autoMsg = state.autoJudge ? ' (auto-judge enabled)' : '';
      showToast(`Debate started! Turns advance automatically.${autoMsg}`, 'success');

      // Auto-start first turn
      state.isStreaming = false;
      initDebatePhase(state);
      await executeNextTurn(state);
    } catch (err) {
      showToast('Network error: ' + (err as Error).message, 'error');
    }

    if (btn) {
      btn.classList.remove('btn-disabled');
      btn.setAttribute('aria-disabled', 'false');
      btn.innerHTML = '⚔️ Start Debate';
    }
  });

  checkSetupReady(state);
}

/** Reset a prompt textarea to its default value */
export function resetPrompt(role: 'A' | 'B' | 'Judge', defaultPrompt: string) {
  const el = role === 'A' ? $('promptA') : role === 'B' ? $('promptB') : $('promptJudge');
  if (el) {
    (el as HTMLTextAreaElement).value = defaultPrompt;
    showToast(`${role === 'Judge' ? 'Judge' : role === 'A' ? 'Affirmative' : 'Negative'} prompt reset to default`, 'info');
  }
}
