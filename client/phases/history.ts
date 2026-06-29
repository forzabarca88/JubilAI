/**
 * History overlay panel — browse, view, and delete past debates.
 * Renders as a centered overlay that preserves the underlying phase state.
 */

import { $, showToast, showPhase } from '../dom/helpers';
import { apiClient } from '../api/client';
import type { AppState } from '../state/app-state';
import type { SavedDebateSummary, DebatesListResponse, DebateStateResponse } from '../../shared/types/api';
import type { Message, DebatePhase } from '../../shared/types/debate';

/**
 * Bind event listeners for the history panel.
 */
export function initHistoryPanel(state: AppState): void {
  // Open history from nav button
  $('btnHistory')?.addEventListener('click', () => openHistoryPanel(state));

  // Close button
  $('btnCloseHistory')?.addEventListener('click', () => closeHistoryPanel());

  // Click on overlay background to close
  $('historyOverlay')?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).classList.contains('history-overlay')) {
      closeHistoryPanel();
    }
  });

  // Delegate card interactions
  $('historyList')?.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const card = target.closest('.history-card') as HTMLElement | null;
    if (!card) return;

    const id = card.dataset.id;
    if (!id) return;

    if (target.classList.contains('btn-view-debate')) {
      viewDebate(id, state);
    } else if (target.classList.contains('btn-delete-debate')) {
      deleteDebate(id, state);
    }
  });
}

/**
 * Fetch debates from the server and render the overlay.
 */
export async function openHistoryPanel(state: AppState): Promise<void> {
  try {
    const res = await apiClient.listDebates();
    const data = await apiClient.json<DebatesListResponse>(res);

    renderHistoryList(data.debates);

    // Show overlay
    const overlay = $('historyOverlay');
    if (overlay) overlay.classList.remove('hidden');
  } catch (err) {
    showToast('Failed to load debate history: ' + (err as Error).message, 'error');
  }
}

/**
 * Hide the overlay panel.
 */
export function closeHistoryPanel(): void {
  const overlay = $('historyOverlay');
  if (overlay) overlay.classList.add('hidden');
}

/**
 * Render debate cards in the history list.
 */
function renderHistoryList(debates: SavedDebateSummary[]): void {
  const listEl = $('historyList');
  const emptyEl = $('historyEmpty');
  if (!listEl) return;

  listEl.innerHTML = '';

  if (debates.length === 0) {
    listEl.classList.add('hidden');
    if (emptyEl) emptyEl.classList.remove('hidden');
    return;
  }

  listEl.classList.remove('hidden');
  if (emptyEl) emptyEl.classList.add('hidden');

  for (const d of debates) {
    const card = document.createElement('div');
    card.className = 'history-card';
    card.dataset.id = d.id;

    // Winner badge
    let winnerBadge = '';
    if (d.winner?.includes('Affirmative')) {
      winnerBadge = `<span class="history-winner badge-affirmative">🏆 Affirmative</span>`;
    } else if (d.winner?.includes('Negative')) {
      winnerBadge = `<span class="history-winner badge-negative">🏆 Negative</span>`;
    } else {
      winnerBadge = `<span class="history-winner badge-none">⚖️ No winner</span>`;
    }

    // Format date
    const date = new Date(d.timestamp);
    const dateStr = date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    card.innerHTML = `
      <div class="history-card-header">
        <span class="history-statement">${escapeHtml(d.statement)}</span>
        ${winnerBadge}
      </div>
      <div class="history-card-meta">
        <span>${escapeHtml(d.modelA)}</span> ·
        <span>${escapeHtml(d.modelB)}</span> ·
        <span>${dateStr}</span>
      </div>
      <div class="history-card-actions">
        <button class="btn btn-ghost btn-sm btn-view-debate">View</button>
        <button class="btn btn-ghost btn-sm btn-delete-debate">Delete</button>
      </div>
    `;

    listEl.appendChild(card);
  }
}

/**
 * View a debate: fetch full data, populate appState, render in verdict phase.
 */
export async function viewDebate(id: string, state: AppState): Promise<void> {
  try {
    // Close the overlay first
    closeHistoryPanel();

    const res = await apiClient.getDebateHistory(id);
    const data = await apiClient.json<DebateStateResponse>(res);

    // Populate appState with the debate data
    state.debateId = data.id;
    state.debateData = {
      statement: data.statement,
      modelA: data.modelA,
      modelB: data.modelB,
      endpointA: '',
      endpointB: '',
      endpointJudge: data.judgeModel ? '' : null,
      messages: data.messages as Message[],
      nextSpeaker: data.nextSpeaker,
      countA: data.countA,
      countB: data.countB,
      phase: data.phase as DebatePhase,
      judgeModel: data.judgeModel,
    };
    state.autoJudge = data.autoJudge;

    // Render in verdict phase
    renderViewedVerdict(data);

    showToast(`Loaded debate: "${data.statement.slice(0, 40)}..."`, 'info');
  } catch (err) {
    showToast('Failed to load debate: ' + (err as Error).message, 'error');
  }
}

/**
 * Render a viewed debate in the verdict phase (reuses existing DOM elements).
 */
function renderViewedVerdict(data: DebateStateResponse): void {
  showPhase('phase-verdict');

  // Statement
  const vs = $('verdictStatement');
  if (vs) vs.textContent = `"${data.statement}"`;

  // Winner
  const vw = $('verdictWinner');
  if (vw) {
    const winnerMatch = data.verdict?.match(/Winner:\s*(The\s+(Affirmative|Negative))/);
    if (winnerMatch) {
      vw.textContent = `🏆 Winner: ${winnerMatch[1]}`;
      const winnerClass = winnerMatch[2] === 'Affirmative' ? 'affirmative' : 'negative';
      vw.className = `verdict-winner ${winnerClass}`;
    } else if (data.verdict) {
      vw.textContent = '⚖️ Verdict rendered';
    } else {
      vw.textContent = 'No verdict yet';
    }
  }

  // Judge info
  const vj = $('verdictJudge');
  if (vj) vj.textContent = data.judgeModel || 'N/A';
  const ve = $('verdictEndpoint');
  if (ve) ve.textContent = 'N/A';

  // Reasoning
  const vr = $('verdictReasoning');
  if (vr) {
    vr.innerHTML = data.verdict ? marked.parse(data.verdict) : 'No verdict available.';
    vr.classList.remove('streaming');
  }

  // Status badge
  const st = $('statusText');
  if (st) st.textContent = 'Debate Complete';

  // Render transcript
  if (data.messages && data.messages.length > 0) {
    const container = $('transcriptContainer');
    const stream = $('transcriptStream');
    const btn = $('btnToggleTranscript');

    if (stream && container) {
      container.classList.remove('hidden');
      stream.innerHTML = '';

      data.messages.forEach(msg => {
        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${msg.speaker === 'A' ? 'affirmative' : 'negative'}`;
        const speakerLabel = msg.speaker === 'A' ? 'The Affirmative (TRUE)' : 'The Negative (FALSE)';

        msgDiv.innerHTML = `
          <div class="message-header">
            <span class="message-label">${speakerLabel}</span>
            <div class="message-meta">
              <span class="message-model">${msg.model || 'N/A'}</span>
              <span class="message-endpoint">${msg.model ? msg.model : 'N/A'}</span>
            </div>
          </div>
          <div class="message-content">${marked.parse(msg.content)}</div>
        `;
        stream.appendChild(msgDiv);
      });

      if (btn) btn.textContent = '🙈 Hide Debate Transcript';
    }
  }

  // Hide debate stream area (not used for viewed debates)
  const debateStream = $('debateStream');
  if (debateStream) debateStream.innerHTML = '';

  // Hide retry verdict (not applicable for viewed debates)
  const btnRetry = $('btnRetryVerdict');
  if (btnRetry) btnRetry.style.display = 'none';
}

/**
 * Delete a debate: call API, remove card from DOM.
 */
export async function deleteDebate(id: string, state: AppState): Promise<void> {
  try {
    const res = await apiClient.deleteDebateHistory(id);
    const data = await apiClient.json<{ success: boolean }>(res);

    if (data.success) {
      // Remove card from DOM with animation
      const card = document.querySelector(`.history-card[data-id="${id}"]`) as HTMLElement | null;
      if (card) {
        card.style.transition = 'opacity 0.3s ease-out, transform 0.3s ease-out';
        card.style.opacity = '0';
        card.style.transform = 'translateX(20px)';
        await new Promise(resolve => setTimeout(resolve, 300));
        card.remove();

        // Check if list is now empty
        const listEl = $('historyList');
        const emptyEl = $('historyEmpty');
        if (listEl && listEl.children.length === 0) {
          listEl.classList.add('hidden');
          if (emptyEl) emptyEl.classList.remove('hidden');
        }
      }

      showToast('Debate deleted.', 'success');
    } else {
      showToast('Failed to delete debate.', 'error');
    }
  } catch (err) {
    showToast('Failed to delete debate: ' + (err as Error).message, 'error');
  }
}

/** Escape HTML entities for safe text insertion */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
