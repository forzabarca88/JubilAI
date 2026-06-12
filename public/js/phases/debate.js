/**
 * Debate Phase — progress tracking, status updates, and turn execution.
 */

/** Render progress dots for both sides */
function renderDebateProgress() {
  const progA = $('progressA');
  const progB = $('progressB');
  if (progA) progA.innerHTML = '';
  if (progB) progB.innerHTML = '';

  for (let i = 0; i < appState.maxTurns; i++) {
    if (progA) {
      const dotA = document.createElement('div');
      dotA.className = 'progress-dot' + (i < appState.countA ? ' filled-a' : '');
      progA.appendChild(dotA);
    }
    if (progB) {
      const dotB = document.createElement('div');
      dotB.className = 'progress-dot' + (i < appState.countB ? ' filled-b' : '');
      progB.appendChild(dotB);
    }
  }
}

/** Update the status badge based on current debate state */
function updateDebateStatus() {
  const badge = $('statusBadge');
  const text = $('statusText');

  if (appState.isStreaming) {
    const speakerName = appState._activeSpeaker === 'A' ? 'The Affirmative' : 'The Negative';
    if (text) text.innerHTML = `<span class="spinner"></span> ${speakerName} generating...`;
    if (badge) badge.className = 'status-badge active';
  } else if (appState.countA >= appState.maxTurns && appState.countB >= appState.maxTurns) {
    if (appState.autoJudge) {
      if (text) text.innerHTML = '<span class="spinner"></span> Debate complete — judge evaluating...';
    } else {
      if (text) text.textContent = 'Debate Complete';
    }
    if (badge) badge.className = 'status-badge waiting';
  } else {
    const speakerName = appState.currentSpeaker === 'A' ? 'The Affirmative' : 'The Negative';
    const model = appState.currentSpeaker === 'A' ? appState.debateData?.modelA : appState.debateData?.modelB;
    if (text) text.textContent = `${speakerName}'s turn (${model})`;
    if (badge) badge.className = 'status-badge active';
  }
}

/** Execute a single debate turn with streaming */
async function executeNextTurn() {
  if (appState.isStreaming) return;
  if (!appState.currentSpeaker) return;

  const activeSpeaker = appState.currentSpeaker;
  appState.isStreaming = true;
  appState._activeSpeaker = activeSpeaker;
  updateDebateStatus();

  const model = activeSpeaker === 'A' ? appState.debateData.modelA : appState.debateData.modelB;
  const endpoint = activeSpeaker === 'A' ? appState.debateData.endpointA : appState.debateData.endpointB;

  // Create message card
  const msgDiv = document.createElement('div');
  msgDiv.className = `message side-${activeSpeaker.toLowerCase()}`;
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
  const contentEl = msgDiv.querySelector('.message-content');

  let fullContent = '';

  try {
    const res = await appApi.nextTurn(appState.debateId, activeSpeaker);

    // Check for non-200 responses (e.g., 400 Bad Request)
    if (!res.ok) {
      const errBody = await res.text();
      contentEl.classList.remove('streaming');
      contentEl.textContent = `Server error (${res.status}): ${errBody}`;
      contentEl.style.color = '#e74c3c';
      showToast(`Server error (${res.status}): ${errBody}`, 'error');
      if (appState.ttsEnabled) { stopDebateAudio(); }
      appState.isStreaming = false;
      updateDebateStatus();
      showRetryTurn();
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = JSON.parse(line.slice(6));

          if (data.type === 'chunk') {
            fullContent += data.content;
            contentEl.innerHTML = marked.parse(fullContent);
            scrollToBottom();

            // Feed text to TTS for real-time audio
            if (appState.ttsEnabled) {
              feedAudioText(data.content, activeSpeaker);
            }
          } else if (data.type === 'done') {
            contentEl.classList.remove('streaming');
            contentEl.innerHTML = marked.parse(fullContent);

            // Flush remaining TTS buffer
            if (appState.ttsEnabled) {
              finishDebateAudio(activeSpeaker);
            }

            appState.debateData.messages.push({
              speaker: activeSpeaker,
              content: fullContent,
              model: model,
              endpoint: endpoint,
            });
            appState.countA = data.countA;
            appState.countB = data.countB;
            renderDebateProgress();

            if (data.debateComplete) {
              appState.currentSpeaker = null;
              appState.isStreaming = false;
              hideRetryTurn();
              updateDebateStatus();

              if (data.autoJudge) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                await runVerdict(appState.debateData.judgeModel, appState.debateData.endpointJudge);
              } else {
                await transitionToJudgeSelect();
              }
              return;
            } else {
              appState.currentSpeaker = data.nextSpeaker;
              appState.isStreaming = false;
              hideRetryTurn();
              updateDebateStatus();

              // Auto-advance to next turn
              await new Promise(resolve => setTimeout(resolve, 1500));
              await executeNextTurn();
              break;
            }
          } else if (data.type === 'error') {
            contentEl.classList.remove('streaming');
            contentEl.textContent = `Error: ${data.error}`;
            contentEl.style.color = '#e74c3c';
            showToast('Error: ' + data.error, 'error');
            if (appState.ttsEnabled) { await finishDebateAudio(activeSpeaker); }
            appState.isStreaming = false;
            updateDebateStatus();
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
    showToast('Network error: ' + err.message, 'error');
    if (appState.ttsEnabled) { stopDebateAudio(); }
    appState.isStreaming = false;
    updateDebateStatus();
    showRetryTurn();
  }
}

/** Show the retry turn button */
function showRetryTurn() {
  const btn = $('btnRetryTurn');
  if (btn) btn.style.display = '';
}

/** Hide the retry turn button */
function hideRetryTurn() {
  const btn = $('btnRetryTurn');
  if (btn) btn.style.display = 'none';
}

/** Bind debate phase event listeners */
function initDebatePhase() {
  $('btnAbortDebate').onclick = () => {
    if (confirm('Abort this debate?')) {
      stopDebateAudio();
      appState.debateId && appApi.deleteDebate(appState.debateId);
      resetToSetup();
    }
  };

  $('btnRetryTurn').onclick = () => {
    hideRetryTurn();
    if (appState.currentSpeaker) {
      executeNextTurn();
    }
  };
}
