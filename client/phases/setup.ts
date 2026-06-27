/**
 * Setup Phase — model fetching, readiness checks, and debate start (typed).
 * Uses `addEventListener` instead of HTML `onclick`.
 */

import { getConfig } from '../config';
import { $, showToast, showPhase } from '../dom/helpers';
import { apiClient } from '../api/client';
import { sessionStorage } from '../session/session-storage';
import type { AppState } from '../state/app-state';
import type { ModelInfo } from '../../shared/types/api';
import type { DebateCreateBody } from '../../shared/types/debate';

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

/** Gather advanced settings from DOM */
function gatherAdvancedSettings(): {
  promptA: string;
  promptB: string;
  promptJudge: string;
  temperature: number | undefined;
  topP: number | undefined;
  topK: number | undefined;
  maxTokens: number | undefined;
  judgeTemperature: number | undefined;
  judgeTopP: number | undefined;
  judgeTopK: number | undefined;
  judgeMaxTokens: number | undefined;
} {
  const promptA = $('promptA') as HTMLTextAreaElement | null;
  const promptB = $('promptB') as HTMLTextAreaElement | null;
  const promptJudge = $('promptJudge') as HTMLTextAreaElement | null;
  const temperature = $('temperature') as HTMLInputElement | null;
  const topP = $('topP') as HTMLInputElement | null;
  const topK = $('topK') as HTMLInputElement | null;
  const maxTokens = $('maxTokens') as HTMLInputElement | null;
  const judgeTemperature = $('judgeTemperature') as HTMLInputElement | null;
  const judgeTopP = $('judgeTopP') as HTMLInputElement | null;
  const judgeTopK = $('judgeTopK') as HTMLInputElement | null;
  const judgeMaxTokens = $('judgeMaxTokens') as HTMLInputElement | null;

  return {
    promptA: promptA?.value.trim() || '',
    promptB: promptB?.value.trim() || '',
    promptJudge: promptJudge?.value.trim() || '',
    temperature: temperature?.value ? parseFloat(temperature.value) : undefined,
    topP: topP?.value ? parseFloat(topP.value) : undefined,
    topK: topK?.value ? parseInt(topK.value, 10) : undefined,
    maxTokens: maxTokens?.value ? parseInt(maxTokens.value, 10) : undefined,
    judgeTemperature: judgeTemperature?.value ? parseFloat(judgeTemperature.value) : undefined,
    judgeTopP: judgeTopP?.value ? parseFloat(judgeTopP.value) : undefined,
    judgeTopK: judgeTopK?.value ? parseInt(judgeTopK.value, 10) : undefined;
    judgeMaxTokens: judgeMaxTokens?.value ? parseInt(judgeMaxTokens.value, 10) : undefined,
  };
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

    // Gather config values
    const endpointA = $('endpointA')?.value.trim().replace(/\/+$/, '') || '';
    const apiKeyA = $('apiKeyA')?.value.trim() || '';
    const modelA = $('modelA')?.value || '';
    const endpointB = $('endpointB')?.value.trim().replace(/\/+$/, '') || '';
    const apiKeyB = $('apiKeyB')?.value.trim() || '';
    const modelB = $('modelB')?.value || '';
    const judgeModel = $('judgeModelSelect')?.value || '';
    const endpointJudge = $('endpointJudge')?.value.trim().replace(/\/+$/, '') || '';
    const apiKeyJudge = $('apiKeyJudge')?.value.trim() || '';

    const settings = gatherAdvancedSettings();
    state.advancedSettings = settings;

    try {
      const body: DebateCreateBody = {
        statement,
        modelA,
        modelB,
        endpointA,
        apiKeyA,
        endpointB,
        apiKeyB,
        judgeModel: judgeModel || null,
        endpointJudge: endpointJudge || null,
        apiKeyJudge: apiKeyJudge || null,
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

      // Silently save config
      const saveConfig = {
        statement,
        endpointA, apiKeyA, modelA,
        endpointB, apiKeyB, modelB,
        endpointJudge, apiKeyJudge,
        modelJudge: judgeModel,
        promptA: settings.promptA,
        promptB: settings.promptB,
        promptJudge: settings.promptJudge,
        temperature: settings.temperature,
        topP: settings.topP,
        topK: settings.topK,
        maxTokens: settings.maxTokens,
        judgeTemperature: settings.judgeTemperature,
        judgeTopP: settings.judgeTopP,
        judgeTopK: settings.judgeTopK,
        judgeMaxTokens: settings.judgeMaxTokens,
      };
      sessionStorage.save(saveConfig).catch(err => {
        console.warn('[Session] Save failed:', (err as Error).message);
      });

      state.debateId = data.id;
      state.debateData = {
        statement: data.statement,
        modelA: data.modelA,
        modelB: data.modelB,
        endpointA,
        endpointB,
        endpointJudge: endpointJudge || null,
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
      state.tts.enabled = true;
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

/** Render progress for both sides */
function renderDebateProgress(state: AppState) {
  const fillA = $('progressA');
  const fillB = $('progressB');
  if (fillA) {
    const percentage = (state.countA / state.maxTurns) * 100;
    fillA.style.width = `${percentage}%`;
  }
  if (fillB) {
    const percentage = (state.countB / state.maxTurns) * 100;
    fillB.style.width = `${percentage}%`;
  }
}

/** Update the status badge */
function updateDebateStatus(state: AppState) {
  const badge = $('statusBadge');
  const text = $('statusText');

  if (state.isStreaming) {
    const speakerName = state._activeSpeaker === 'A' ? 'The Affirmative' : 'The Negative';
    if (text) text.innerHTML = `<span class="spinner"></span> ${speakerName} generating...`;
    if (badge) badge.className = 'status-badge active';
  } else if (state.countA >= state.maxTurns && state.countB >= state.maxTurns) {
    if (state.autoJudge) {
      if (text) text.innerHTML = '<span class="spinner"></span> Debate complete — judge evaluating...';
    } else {
      if (text) text.textContent = 'Debate Complete';
    }
    if (badge) badge.className = 'status-badge waiting';
  } else {
    const speakerName = state.currentSpeaker === 'A' ? 'The Affirmative' : 'The Negative';
    const model = state.currentSpeaker === 'A' ? state.debateData?.modelA : state.debateData?.modelB;
    if (text) text.textContent = `${speakerName}'s turn (${model})`;
    if (badge) badge.className = 'status-badge active';
  }
}

/** Execute a single debate turn with streaming */
export async function executeNextTurn(state: AppState) {
  if (state.isStreaming) return;
  if (!state.currentSpeaker) return;

  const activeSpeaker = state.currentSpeaker;
  state.isStreaming = true;
  state._activeSpeaker = activeSpeaker;
  updateDebateStatus(state);

  if (state.tts.enabled) {
    startTTSStatusPoll(state);
  }

  const model = activeSpeaker === 'A' ? state.debateData!.modelA : state.debateData!.modelB;
  const endpoint = activeSpeaker === 'A' ? state.debateData!.endpointA : state.debateData!.endpointB;

  const msgDiv = document.createElement('div');
  msgDiv.className = `message ${activeSpeaker === 'A' ? 'affirmative' : 'negative'}`;
  const speakerLabel = activeSpeaker === 'A' ? 'The Affirmative (TRUE)' : 'The Negative (FALSE)';

  msgDiv.innerHTML = `
    <div class="message-header">
      <span class="message-label">${speakerLabel}</span>
      <div class="message-meta">
        <span class="message-model">${model}</span>
        <span class="message-endpoint">${endpoint}</span>
      </div>
    </div>
    <div class="message-content streaming"></div>
  `;
  const stream = $('debateStream');
  if (stream) stream.appendChild(msgDiv);
  const contentEl = msgDiv.querySelector('.message-content')!;

  let fullContent = '';

  try {
    const res = await apiClient.nextTurn(state.debateId!, activeSpeaker);

    if (!res.ok) {
      const errBody = await res.text();
      contentEl.classList.remove('streaming');
      contentEl.textContent = `Server error (${res.status}): ${errBody}`;
      contentEl.style.color = '#e74c3c';
      showToast(`Server error (${res.status}): ${errBody}`, 'error');
      if (state.tts.enabled) stopDebateAudio(state);
      state.isStreaming = false;
      stopTTSStatusPoll();
      updateDebateStatus(state);
      showRetryTurn();
      return;
    }

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = JSON.parse(line.slice(6)) as {
            type: string;
            content?: string;
            debateComplete?: boolean;
            nextSpeaker?: string | null;
            winner?: string | null;
            verdict?: string;
            countA?: number;
            countB?: number;
            autoJudge?: boolean;
            error?: string;
          };

          if (data.type === 'chunk') {
            fullContent += data.content!;
            contentEl.innerHTML = marked.parse(fullContent);
            scrollToBottom();

            if (state.tts.enabled) {
              feedAudioText(data.content!, activeSpeaker);
            }
          } else if (data.type === 'done') {
            contentEl.classList.remove('streaming');
            contentEl.innerHTML = marked.parse(fullContent);

            if (state.tts.enabled) {
              await finishDebateAudio(activeSpeaker);
            }

            state.debateData!.messages.push({
              speaker: activeSpeaker,
              content: fullContent,
              model: model,
              timestamp: Date.now(),
            });
            state.countA = data.countA ?? state.countA;
            state.countB = data.countB ?? state.countB;
            renderDebateProgress(state);

            if (data.debateComplete) {
              state.currentSpeaker = null;
              state.isStreaming = false;
              hideRetryTurn();
              stopTTSStatusPoll();
              updateDebateStatus(state);

              if (data.autoJudge) {
                await new Promise(resolve => setTimeout(resolve, getConfig().debate.autoJudgeDelayMs));
                await runVerdict(state.debateData!.judgeModel!, state.debateData!.endpointJudge!, state);
              } else {
                await transitionToJudgeSelect(state);
              }
              return;
            } else {
              state.currentSpeaker = data.nextSpeaker as 'A' | 'B' | null;
              state.isStreaming = false;
              hideRetryTurn();
              stopTTSStatusPoll();
              updateDebateStatus(state);

              await new Promise(resolve => setTimeout(resolve, getConfig().debate.autoAdvanceDelayMs));
              await executeNextTurn(state);
              break;
            }
          } else if (data.type === 'error') {
            contentEl.classList.remove('streaming');
            contentEl.textContent = `Error: ${data.error}`;
            contentEl.style.color = '#e74c3c';
            showToast('Error: ' + data.error!, 'error');
            if (state.tts.enabled) await finishDebateAudio(activeSpeaker);
            state.isStreaming = false;
            stopTTSStatusPoll();
            updateDebateStatus(state);
            showRetryTurn();
            break;
          }
        }
      }
    }
  } catch (err) {
    contentEl.classList.remove('streaming');
    contentEl.textContent = 'Connection error';
    contentEl.style.color = '#e74c3c';
    showToast('Network error: ' + (err as Error).message, 'error');
    if (state.tts.enabled) stopDebateAudio(state);
    state.isStreaming = false;
    stopTTSStatusPoll();
    updateDebateStatus(state);
    showRetryTurn();
  }
}

function showRetryTurn() {
  const btn = $('btnRetryTurn');
  if (btn) btn.style.display = '';
}

function hideRetryTurn() {
  const btn = $('btnRetryTurn');
  if (btn) btn.style.display = 'none';
}
