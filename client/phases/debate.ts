/**
 * Debate Phase — progress tracking, status updates, and turn execution.
 * Replaces `public/js/phases/debate.js`.
 */

import { getConfig } from '../config';
import { $, showToast, showPhase, scrollToBottom } from '../dom/helpers';
import { apiClient } from '../api/client';
import type { AppState } from '../state/app-state';
import { startDebateAudio, stopDebateAudio, pauseDebateAudio, resumeDebateAudio, feedAudioText, finishDebateAudio } from '../tts/manager';
import { startTTSStatusPoll, stopTTSStatusPoll, updateTTSEnableButton } from '../dom/tts-ui';
import { renderDebateProgress, updateDebateStatus, showRetryTurn, hideRetryTurn } from './setup';

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
