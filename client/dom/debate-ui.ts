/**
 * Debate UI helpers — progress bars, status badge, and retry button.
 * Shared between setup.ts and debate.ts to avoid circular dependency.
 */

import { $ } from './helpers';
import type { AppState } from '../state/app-state';

/** Render progress for both sides */
export function renderDebateProgress(state: AppState) {
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
export function updateDebateStatus(state: AppState) {
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

/** Show the retry turn button */
export function showRetryTurn() {
  const btn = $('btnRetryTurn');
  if (btn) btn.style.display = '';
}

/** Hide the retry turn button */
export function hideRetryTurn() {
  const btn = $('btnRetryTurn');
  if (btn) btn.style.display = 'none';
}
