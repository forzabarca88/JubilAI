/**
 * Kiosk mode initialization.
 * Populates app state from server-provided kiosk config,
 * hiding all configuration UI and leaving only the statement textarea.
 */

import { getConfig } from '../config';
import { $ } from '../dom/helpers';
import type { AppState } from '../state/app-state';

export function initKioskMode(state: AppState) {
  const config = getConfig();
  const k = config.kiosk;

  // Populate state directly from kiosk config
  state.maxTurns = k.maxTurns ?? config.debate.maxTurns;

  state.debateData = {
    statement: '',
    modelA: k.modelA,
    modelB: k.modelB,
    endpointA: k.endpointA,
    endpointB: k.endpointB,
    endpointJudge: k.endpointJudge || null,
    messages: [],
    nextSpeaker: null,
    countA: 0,
    countB: 0,
    phase: 'debating' as const,
    judgeModel: k.modelJudge || null,
  };

  state.autoJudge = !!(k.modelJudge && k.endpointJudge);
  state.advancedSettings = {
    promptA: k.promptA || '',
    promptB: k.promptB || '',
    promptJudge: k.promptJudge || '',
    temperature: k.temperature,
    topP: k.topP,
    topK: k.topK,
    maxTokens: k.maxTokens,
    judgeTemperature: k.judgeTemperature,
    judgeTopP: k.judgeTopP,
    judgeTopK: k.judgeTopK,
    judgeMaxTokens: k.judgeMaxTokens,
  };

  // Mark the start button as ready (only statement is needed)
  const btn = $('btnStartDebate');
  if (btn) {
    btn.classList.remove('btn-disabled');
    btn.setAttribute('aria-disabled', 'false');
    (btn as unknown as Record<string, unknown>)._missing = [];
  }

  // Set statement textarea placeholder to hint kiosk mode
  const stmt = $('statement');
  if (stmt) {
    (stmt as HTMLTextAreaElement).placeholder = 'Enter your debate statement...';
  }
}
