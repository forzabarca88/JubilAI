/**
 * Debate Phase — progress tracking, status updates, and turn execution.
 * Replaces `public/js/phases/debate.js`.
 */

import { getConfig } from '../config';
import { $, showToast, showPhase, scrollToBottom, safeJsonParse } from '../dom/helpers';
import { apiClient } from '../api/client';
import type { AppState } from '../state/app-state';
import { startDebateAudio, stopDebateAudio, pauseDebateAudio, resumeDebateAudio, feedAudioText, finishDebateAudio } from '../tts/manager';
import { startTTSStatusPoll, stopTTSStatusPoll } from '../dom/tts-ui';
import { renderDebateProgress, updateDebateStatus, showRetryTurn, hideRetryTurn } from '../dom/debate-ui';
import { runVerdict } from './verdict';
import { transitionToJudgeSelect } from './judge-select';
import { resetToSetup } from '../app';

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
  const contentEl = msgDiv.querySelector('.message-content')! as HTMLElement;

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
    let sseBuffer = '';

    while (true) {
      const { done, value } = await reader.read();

      // Accumulate decoded text in buffer
      sseBuffer += decoder.decode(value, { stream: true });

      // Split on SSE event boundary (double newline)
      const parts = sseBuffer.split('\n\n');
      // Keep the last (possibly incomplete) part in buffer
      sseBuffer = parts.pop() ?? '';

      if (done && sseBuffer.trim() !== '') {
        // Stream ended with incomplete event — process it as best we can
        parts.push(sseBuffer);
        sseBuffer = '';
      }

      let finished = false;
      for (const event of parts) {
        if (finished) break;
        const lines = event.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = safeJsonParse(line.slice(6));
            if (!data || typeof data !== 'object') continue;
            const d = data as any;

            if (d.type === 'chunk') {
              fullContent += d.content!;
              contentEl.innerHTML = marked.parse(fullContent);
              scrollToBottom();

              if (state.tts.enabled) {
                feedAudioText(d.content!, activeSpeaker);
              }
            } else if (d.type === 'done') {
              contentEl.classList.remove('streaming');
              contentEl.innerHTML = marked.parse(fullContent);

              if (state.tts.enabled) {
                finishDebateAudio(activeSpeaker);
              }

              state.debateData!.messages.push({
                speaker: activeSpeaker,
                content: fullContent,
                model: model,
                timestamp: Date.now(),
              });
              state.countA = d.countA ?? state.countA;
              state.countB = d.countB ?? state.countB;
              renderDebateProgress(state);

              if (d.debateComplete) {
                state.currentSpeaker = null;
                state.isStreaming = false;
                hideRetryTurn();
                stopTTSStatusPoll();
                updateDebateStatus(state);

                if (d.autoJudge) {
                  await new Promise(resolve => setTimeout(resolve, getConfig().debate.autoJudgeDelayMs));
                  await runVerdict(state.debateData!.judgeModel!, state.debateData!.endpointJudge!, state);
                } else if (getConfig().kiosk.enabled) {
                  showToast('No judge configured — debate complete', 'info');
                } else {
                  await transitionToJudgeSelect(state);
                }
                return;
              } else {
                state.currentSpeaker = d.nextSpeaker as 'A' | 'B' | null;
                state.isStreaming = false;
                hideRetryTurn();
                stopTTSStatusPoll();
                updateDebateStatus(state);

                await new Promise(resolve => setTimeout(resolve, getConfig().debate.autoAdvanceDelayMs));
                await executeNextTurn(state);
                finished = true;
                break;
              }
            } else if (d.type === 'error') {
              contentEl.classList.remove('streaming');
              contentEl.textContent = `Error: ${d.error}`;
              contentEl.style.color = '#e74c3c';
              showToast('Error: ' + d.error!, 'error');
              if (state.tts.enabled) await finishDebateAudio(activeSpeaker);
              state.isStreaming = false;
              stopTTSStatusPoll();
              updateDebateStatus(state);
              showRetryTurn();
              finished = true;
              break;
            }
          }
        }
      }

      if (done || finished) break;
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

/** Bind debate phase event listeners */
export function initDebatePhase(state: AppState) {
  $('btnAbortDebate')?.addEventListener('click', () => {
    if (confirm('Abort this debate?')) {
      stopDebateAudio(state);
      state.debateId && apiClient.deleteDebate(state.debateId);
      resetToSetup(state);
    }
  });

  $('btnRetryTurn')?.addEventListener('click', () => {
    hideRetryTurn();
    if (state.currentSpeaker) {
      executeNextTurn(state);
    }
  });
}
