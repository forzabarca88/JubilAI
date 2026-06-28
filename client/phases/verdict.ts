/**
 * Verdict Phase — judge verdict streaming, transcript rendering, and markdown export.
 * Replaces `public/js/phases/verdict.js`.
 */

import { getConfig } from '../config';
import { $, showToast, showPhase, scrollVerdictToBottom } from '../dom/helpers';
import { apiClient } from '../api/client';
import type { AppState } from '../state/app-state';
import { startDebateAudio, stopDebateAudio, pauseDebateAudio, resumeDebateAudio, feedAudioText, finishDebateAudio, ttsManager } from '../tts/manager';
import { startTTSStatusPoll, stopTTSStatusPoll, updateTTSEnableButton } from '../dom/tts-ui';

/** Run the judge verdict with streaming */
export async function runVerdict(judgeModel: string, endpointJudge: string, state: AppState) {
  showPhase('phase-verdict');
  const vs = $('verdictStatement');
  if (vs) vs.textContent = `"${state.debateData!.statement}"`;
  const vj = $('verdictJudge');
  if (vj) vj.textContent = judgeModel || state.debateData!.judgeModel || 'N/A';
  const ve = $('verdictEndpoint');
  if (ve) ve.textContent = endpointJudge || state.debateData!.endpointJudge || 'N/A';
  const vw = $('verdictWinner');
  if (vw) { vw.textContent = 'Evaluating...'; vw.className = 'verdict-winner'; }
  const vr = $('verdictReasoning');
  if (vr) { vr.textContent = ''; vr.classList.add('streaming'); }

  const st = $('statusText');
  if (st) st.innerHTML = '<span class="spinner"></span> Judge is evaluating...';

  if (state.tts.enabled) startTTSStatusPoll(state);

  try {
    const res = await apiClient.verdict(state.debateId!);

    if (!res.ok) {
      const errBody = await res.text();
      if (vr) { vr.classList.remove('streaming'); vr.textContent = `Server error (${res.status}): ${errBody}`; }
      showToast(`Server error (${res.status}): ${errBody}`, 'error');
      if (state.tts.enabled) { stopDebateAudio(state); }
      stopTTSStatusPoll();
      showRetryVerdict(state);
      renderTranscript(state);
      return;
    }

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';

    // Initialize TTS for judge verdict (non-blocking — verdict proceeds even if TTS fails)
    if (state.tts.enabled) {
      try { await ttsManager.initialize(); }
      catch (err) { console.warn('[TTS] Init failed for verdict:', (err as Error).message); state.tts.enabled = false; }
    }

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
            if (vr) vr.innerHTML = marked.parse(fullContent);
            scrollVerdictToBottom();

            // Feed text to TTS for judge voice
            if (state.tts.enabled) {
              feedAudioText(data.content!, 'judge');
            }
          } else if (data.type === 'done') {
            hideRetryVerdict(state);
            if (vr) { vr.classList.remove('streaming'); vr.innerHTML = marked.parse(data.verdict!); }
            if (data.winner && vw) {
              vw.textContent = `🏆 Winner: ${data.winner}`;
              const winnerClass = data.winner!.includes('Affirmative') ? 'affirmative' : 'negative';
              vw.className = `verdict-winner ${winnerClass}`;
            } else if (vw) {
              vw.textContent = '⚖️ Verdict rendered';
            }
            if (st) st.textContent = 'Debate Complete';
            showToast('Judgment complete!', 'success');

            // Flush TTS buffer after UI is updated (non-blocking for user)
            if (state.tts.enabled) {
              await finishDebateAudio('judge');
            }
            stopTTSStatusPoll();
            break;
          } else if (data.type === 'error') {
            if (vr) { vr.classList.remove('streaming'); vr.textContent = `Error: ${data.error}`; }
            showToast('Error: ' + data.error, 'error');
            showRetryVerdict(state);
            stopTTSStatusPoll();

            if (state.tts.enabled) { await finishDebateAudio('judge'); }
            break;
          }
        }
      }
    }

    // Post-loop safeguard: if stream ended without a 'done' event, finalize UI
    if (vr && vr.classList.contains('streaming')) {
      vr.classList.remove('streaming');
      if (fullContent.trim()) vr.innerHTML = marked.parse(fullContent);
    }
    if (vw && vw.textContent === 'Evaluating...') {
      vw.textContent = '⚖️ Verdict rendered';
    }
    if (st) st.textContent = 'Debate Complete';
    hideRetryVerdict(state);

    if (state.tts.enabled) { await finishDebateAudio('judge'); }
    stopTTSStatusPoll();
  } catch (err) {
    if (vr) { vr.classList.remove('streaming'); vr.textContent = 'Connection error'; }
    showToast('Network error: ' + (err as Error).message, 'error');
    showRetryVerdict(state);
    stopTTSStatusPoll();

    if (state.tts.enabled) { await finishDebateAudio('judge'); }
  }

  renderTranscript(state);
}

/** Render the debate transcript in the verdict phase */
function renderTranscript(state: AppState) {
  const container = $('transcriptContainer');
  const stream = $('transcriptStream');
  const btn = $('btnToggleTranscript');

  if (!stream || !container) return;

  if (state.debateData && state.debateData.messages && state.debateData.messages.length > 0) {
    container.classList.remove('hidden');
    stream.innerHTML = '';

    state.debateData.messages.forEach(msg => {
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
  } else {
    if (container) container.classList.add('hidden');
    if (btn) btn.textContent = '👁️ Show/Hide Debate Transcript';
  }
}

/** Export debate result as markdown file */
function exportMarkdown(state: AppState) {
  const vs = $('verdictWinner');
  const vr = $('verdictReasoning');
  const vj = $('verdictJudge');
  const ve = $('verdictEndpoint');
  const stmtEl = $('verdictStatement');
  const stream = $('transcriptStream');

  if (!stream || stream.innerHTML.trim() === '') {
    showToast('No debate transcript to export', 'error');
    return;
  }

  const statement = stmtEl ? stmtEl.textContent!.replace(/"/g, '').replace(/\n/g, ' ') : 'N/A';
  const winner = vs ? vs.textContent : 'N/A';
  const verdictReasoning = vr ? vr.innerHTML : 'N/A';
  const judgeModel = vj ? vj.textContent : 'N/A';
  const endpoint = ve ? ve.textContent : 'N/A';

  // Convert verdict HTML to markdown
  let verdictMarkdown = '';
  if (typeof marked !== 'undefined' && marked.parse) {
    verdictMarkdown = marked.parse(verdictReasoning, { gfm: true });
  } else {
    verdictMarkdown = verdictReasoning
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/\n/g, '\n');
  }

  // Build transcript markdown from state
  let transcriptMarkdown = '';
  if (state.debateData && state.debateData.messages && state.debateData.messages.length > 0) {
    state.debateData.messages.forEach((msg, index) => {
      if (index > 0) transcriptMarkdown += '\n\n';

      const speakerLabel = msg.speaker === 'A' ? 'The Affirmative (TRUE)' : 'The Negative (FALSE)';
      transcriptMarkdown += `### ${speakerLabel}\n\n`;

      if (msg.model) transcriptMarkdown += `**Model:** \`${msg.model}\`\n`;
      transcriptMarkdown += '\n';

      if (msg.content) {
        if (typeof marked !== 'undefined' && marked.parse) {
          transcriptMarkdown += marked.parse(msg.content, { gfm: true });
        } else {
          transcriptMarkdown += msg.content
            .replace(/<[^>]+>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/\n/g, '\n');
        }
      }
    });
  }

  const exportContent = `# 🏆 Debate Result

## 📝 Statement
> ${statement}

## ⚖️ Verdict

**Winner:** ${winner}

**Judge Model:** ${judgeModel}
**Endpoint:** ${endpoint}

---

## 📜 Judge's Reasoning

${verdictMarkdown}

---

## 💬 Debate Transcript

${transcriptMarkdown}
`;

  const blob = new Blob([exportContent], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `debate-result-${Date.now()}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast('Exported as markdown!', 'success');
}

/** Show the retry verdict button */
function showRetryVerdict(state: AppState) {
  const btn = $('btnRetryVerdict');
  if (btn) btn.style.display = '';
}

/** Hide the retry verdict button */
function hideRetryVerdict(state: AppState) {
  const btn = $('btnRetryVerdict');
  if (btn) btn.style.display = 'none';
}

/** Bind verdict phase event listeners */
export function initVerdictPhase(state: AppState) {
  $('btnToggleTranscript')?.addEventListener('click', () => {
    const container = $('transcriptContainer');
    const btn = $('btnToggleTranscript');

    if (container && container.classList.contains('hidden')) {
      renderTranscript(state);
    } else if (container) {
      container.classList.add('hidden');
      if (btn) btn.textContent = '👁️ Show/Hide Debate Transcript';
    }
  });

  $('btnExportMarkdown')?.addEventListener('click', () => exportMarkdown(state));

  const btnRetry = $('btnRetryVerdict');
  if (btnRetry) {
    btnRetry.addEventListener('click', () => {
      hideRetryVerdict(state);
      const judgeModel = state.debateData?.judgeModel;
      const endpointJudge = state.debateData?.endpointJudge;
      if (judgeModel && endpointJudge) {
        runVerdict(judgeModel, endpointJudge, state);
      }
    });
  }
}
