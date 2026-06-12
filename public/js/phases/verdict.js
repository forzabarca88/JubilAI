/**
 * Verdict Phase — judge verdict streaming, transcript rendering, and markdown export.
 */

/** Run the judge verdict with streaming */
async function runVerdict(judgeModel, endpointJudge) {
  showPhase('phase-verdict');
  const vs = $('verdictStatement');
  if (vs) vs.textContent = `"${appState.debateData.statement}"`;
  const vj = $('verdictJudge');
  if (vj) vj.textContent = judgeModel || appState.debateData.judgeModel || 'N/A';
  const ve = $('verdictEndpoint');
  if (ve) ve.textContent = endpointJudge || appState.debateData.endpointJudge || 'N/A';
  const vw = $('verdictWinner');
  if (vw) { vw.textContent = 'Evaluating...'; vw.className = 'verdict-winner'; }
  const vr = $('verdictReasoning');
  if (vr) { vr.textContent = ''; vr.classList.add('streaming'); }

  const st = $('statusText');
  if (st) st.innerHTML = '<span class="spinner"></span> Judge is evaluating...';

  try {
    const res = await appApi.verdict(appState.debateId);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';

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
            if (vr) vr.innerHTML = marked.parse(fullContent);
            scrollVerdictToBottom();
          } else if (data.type === 'done') {
            hideRetryVerdict();
            if (vr) vr.classList.remove('streaming');
            if (vr) vr.innerHTML = marked.parse(data.verdict);

            if (data.winner && vw) {
              const winnerSide = data.winner.replace('Side', '').trim();
              vw.textContent = `🏆 Winner: Side ${winnerSide}`;
              vw.className = `verdict-winner side-${winnerSide.toLowerCase()}`;
            } else if (vw) {
              vw.textContent = '⚖️ Verdict rendered';
            }

            if (st) st.textContent = 'Debate Complete';
            showToast('Judgment complete!', 'success');
            break;
          } else if (data.type === 'error') {
            if (vr) { vr.classList.remove('streaming'); vr.textContent = `Error: ${data.error}`; }
            showToast('Error: ' + data.error, 'error');
            showRetryVerdict();
            break;
          }
        }
      }
    }
  } catch (err) {
    if (vr) { vr.classList.remove('streaming'); vr.textContent = 'Connection error'; }
    showToast('Network error: ' + err.message, 'error');
    showRetryVerdict();
  }

  // Render transcript
  renderTranscript();
}

/** Render the debate transcript in the verdict phase */
function renderTranscript() {
  const container = $('transcriptContainer');
  const stream = $('transcriptStream');
  const btn = $('btnToggleTranscript');

  if (!stream || !container) return;

  if (appState.debateData && appState.debateData.messages && appState.debateData.messages.length > 0) {
    container.classList.remove('hidden');
    stream.innerHTML = '';

    appState.debateData.messages.forEach(msg => {
      const msgDiv = document.createElement('div');
      msgDiv.className = `message side-${msg.speaker.toLowerCase()}`;
      const speakerLabel = msg.speaker === 'A' ? 'Side A (TRUE)' : 'Side B (FALSE)';

      msgDiv.innerHTML = `
        <div class="message-header">
          <span class="message-label">${speakerLabel}</span>
          <div class="message-meta">
            <span class="message-model">${msg.model || 'N/A'}</span>
            <span class="message-endpoint">${msg.endpoint || 'N/A'}</span>
          </div>
        </div>
        <div class="message-content">${marked.parse(msg.content)}</div>
      `;
      stream.appendChild(msgDiv);
    });

    btn.textContent = '🙈 Hide Debate Transcript';
  } else {
    container.classList.add('hidden');
    btn.textContent = '👁️ Show/Hide Debate Transcript';
  }
}

/** Export debate result as markdown file */
function exportMarkdown() {
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

  const statement = stmtEl ? stmtEl.textContent.replace(/"/g, '').replace(/\n/g, ' ') : 'N/A';
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
  if (appState.debateData && appState.debateData.messages && appState.debateData.messages.length > 0) {
    appState.debateData.messages.forEach((msg, index) => {
      if (index > 0) transcriptMarkdown += '\n\n';

      const speakerLabel = msg.speaker === 'A' ? 'Side A (TRUE)' : 'Side B (FALSE)';
      transcriptMarkdown += `### ${speakerLabel}\n\n`;

      if (msg.model) transcriptMarkdown += `**Model:** \`${msg.model}\`\n`;
      if (msg.endpoint) transcriptMarkdown += `**Endpoint:** \`${msg.endpoint}\`\n`;
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
function showRetryVerdict() {
  const btn = $('btnRetryVerdict');
  if (btn) btn.style.display = '';
}

/** Hide the retry verdict button */
function hideRetryVerdict() {
  const btn = $('btnRetryVerdict');
  if (btn) btn.style.display = 'none';
}

/** Bind verdict phase event listeners */
function initVerdictPhase() {
  $('btnToggleTranscript').onclick = () => {
    const container = $('transcriptContainer');
    const btn = $('btnToggleTranscript');

    if (container.classList.contains('hidden')) {
      renderTranscript();
    } else {
      container.classList.add('hidden');
      btn.textContent = '👁️ Show/Hide Debate Transcript';
    }
  };

  $('btnExportMarkdown').onclick = exportMarkdown;

  $('btnRetryVerdict').onclick = () => {
    hideRetryVerdict();
    const judgeModel = appState.debateData?.judgeModel;
    const endpointJudge = appState.debateData?.endpointJudge;
    if (judgeModel && endpointJudge) {
      runVerdict(judgeModel, endpointJudge);
    }
  };
}
