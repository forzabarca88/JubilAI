const express = require('express');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const debates = new Map();

// ─── Mock data ──────────────────────────────────────────────
const MOCK_MODELS = [
  'llama3.1:8b',
  'mistral:7b',
  'gemma:7b',
  'qwen2.5:7b',
  'phi3:3.8b',
  'deepseek-coder-v2:16b',
];

const MOCK_DEBATE_CONTENT = {
  // Generic content that works for any statement
  A: [
    `The evidence strongly supports this position. Historical data and logical reasoning both point in favor of the statement. When we examine the facts objectively, the pattern becomes clear — this is not merely opinion but a conclusion backed by observable reality.`,

    `I must address Side B's claims directly. Their arguments rest on cherry-picked data and selective interpretation. The broader body of evidence — including peer-reviewed research and real-world observations — consistently validates this position. Side B's counterarguments collapse under scrutiny.`,

    `To conclude: every major line of evidence converges on the same conclusion. The consistency across independent studies, the reproducibility of findings, and the weight of expert consensus all point decisively in favor of this statement. Side B has not presented a single argument that withstands rigorous analysis.`,
  ],
  B: [
    `This statement is fundamentally flawed. The available evidence, when examined comprehensively, contradicts the claim. Side A presents a narrow view that ignores critical counter-evidence. The data tells a different story — one that clearly refutes the statement.`,

    `Side A's reliance on selective evidence is their central weakness. They cite favorable data while ignoring the larger body of research that contradicts their position. When we look at the complete picture — including anomalies, edge cases, and contradictory findings — the statement clearly fails.`,

    `In summary, the weight of evidence decisively refutes this statement. Side A's arguments are built on a foundation of confirmation bias and incomplete data. The broader scientific consensus, the preponderance of contradictory evidence, and the logical inconsistencies in their position all demonstrate that this statement is false.`,
  ],
  judge: `**Winner: Side B**

After careful evaluation of both sides, Side B delivered the stronger performance. Here is my reasoning:

**Logical Reasoning:**
- Side B systematically addressed each of Side A's arguments with specific counter-evidence
- Side A's arguments, while coherent, relied more on assertion than rigorous analysis
- Side B demonstrated a more nuanced understanding of the topic's complexity

**Evidence Quality:**
- Side B cited a broader range of sources and acknowledged counter-evidence
- Side A's evidence was narrower and did not adequately address contradictory data
- Side B's use of specific examples strengthened their position

**Rhetorical Skill:**
- Side B's rebuttals were more targeted and effective
- Side A's responses tended to restate their position rather than directly engage with Side B's points
- Side B's concluding argument was more persuasive and comprehensive

**Conciseness:**
- Side B communicated their arguments more efficiently, using fewer words for greater impact
- Side A's arguments contained redundant phrasing that diluted their effectiveness

**Overall Assessment:**
Side B's combination of thorough evidence, direct rebuttals, and concise communication makes them the clear winner of this debate.`,
};

// ─── Streaming helper ───────────────────────────────────────
// Streams text in chunks with a delay between each chunk.
// Uses process.nextTick + async delay for reliable timing.
function streamText(res, text, chunkSize = 3, delay = 20) {
  return new Promise(resolve => {
    let i = 0;
    const sendChunk = () => {
      if (i >= text.length) {
        resolve();
        return;
      }
      const chunk = text.slice(i, i + chunkSize);
      res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`);
      i += chunkSize;
      setTimeout(sendChunk, delay);
    };
    sendChunk();
  });
}

// ─── GET /api/models ────────────────────────────────────────
app.get('/api/models', (req, res) => {
  const { url, apiKey } = req.query;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  // Small delay to simulate network
  setTimeout(() => {
    res.json({ models: MOCK_MODELS.map(id => ({ id })) });
  }, 200);
});

// ─── POST /api/debate ───────────────────────────────────────
app.post('/api/debate', (req, res) => {
  const {
    statement, modelA, modelB,
    endpointA, apiKeyA,
    endpointB, apiKeyB,
    judgeModel, endpointJudge, apiKeyJudge,
  } = req.body;

  if (!statement || !modelA || !modelB || !endpointA || !endpointB) {
    return res.status(400).json({
      error: 'statement, modelA, modelB, endpointA, and endpointB are required',
    });
  }

  const id = uuidv4();
  const startsWithA = Math.random() < 0.5;

  debates.set(id, {
    id,
    statement,
    modelA, modelB,
    endpointA, apiKeyA: apiKeyA || 'ollama',
    endpointB, apiKeyB: apiKeyB || 'ollama',
    endpointJudge: endpointJudge || null,
    apiKeyJudge: apiKeyJudge || 'ollama',
    messages: [],
    nextSpeaker: startsWithA ? 'A' : 'B',
    countA: 0,
    countB: 0,
    maxTurns: 3,
    phase: 'debating',
    judgeModel: judgeModel || null,
    verdict: null,
    autoJudge: !!(judgeModel && endpointJudge),
  });

  res.json({
    id, phase: 'debating',
    nextSpeaker: startsWithA ? 'A' : 'B',
    modelA, modelB, statement,
    judgeModel: judgeModel || null,
    autoJudge: !!(judgeModel && endpointJudge),
  });
});

// ─── GET /api/debate/:id ────────────────────────────────────
app.get('/api/debate/:id', (req, res) => {
  const debate = debates.get(req.params.id);
  if (!debate) return res.status(404).json({ error: 'Debate not found' });
  res.json({
    id: debate.id,
    statement: debate.statement,
    modelA: debate.modelA,
    modelB: debate.modelB,
    messages: debate.messages,
    nextSpeaker: debate.nextSpeaker,
    countA: debate.countA,
    countB: debate.countB,
    phase: debate.phase,
    judgeModel: debate.judgeModel,
    verdict: debate.verdict,
    autoJudge: debate.autoJudge,
  });
});

// ─── POST /api/debate/:id/judge ─────────────────────────────
app.post('/api/debate/:id/judge', (req, res) => {
  const debate = debates.get(req.params.id);
  if (!debate) return res.status(404).json({ error: 'Debate not found' });
  if (debate.phase !== 'debating' && debate.phase !== 'awaiting-judge') {
    return res.status(400).json({ error: 'Debate is not in debating or awaiting-judge phase' });
  }

  const { judgeModel, endpointJudge, apiKeyJudge } = req.body;
  if (!judgeModel || !endpointJudge) {
    return res.status(400).json({ error: 'judgeModel and endpointJudge are required' });
  }

  debate.phase = 'judging';
  debate.judgeModel = judgeModel;
  debate.endpointJudge = endpointJudge;
  debate.apiKeyJudge = apiKeyJudge || 'ollama';
  res.json({ phase: 'judging', judgeModel });
});

// ─── POST /api/debate/:id/next-turn (streaming) ─────────────
app.post('/api/debate/:id/next-turn', async (req, res) => {
  const debate = debates.get(req.params.id);
  if (!debate) return res.status(404).json({ error: 'Debate not found' });
  if (debate.phase !== 'debating') return res.status(400).json({ error: 'Debate is not in debating phase' });

  const { speaker } = req.body;
  if (speaker !== debate.nextSpeaker) {
    return res.status(400).json({ error: `Not ${speaker}'s turn. Next speaker: ${debate.nextSpeaker}` });
  }

  const model = speaker === 'A' ? debate.modelA : debate.modelB;
  const turnIndex = speaker === 'A' ? debate.countA : debate.countB;
  const content = MOCK_DEBATE_CONTENT[speaker][turnIndex] || `Mock argument ${turnIndex + 1} from Side ${speaker}.`;

  // Set up streaming headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  await new Promise(r => setTimeout(r, 300));

  // Stream the content
  await streamText(res, content, 3, 15);

  // Save the message
  debate.messages.push({
    speaker,
    model,
    content,
    timestamp: Date.now(),
  });

  if (speaker === 'A') debate.countA++;
  else debate.countB++;

  const debateComplete = debate.countA >= debate.maxTurns && debate.countB >= debate.maxTurns;

  if (debateComplete) {
    if (debate.autoJudge) {
      debate.phase = 'judging';
    } else {
      debate.phase = 'awaiting-judge';
    }
    debate.nextSpeaker = null;
    res.write(`data: ${JSON.stringify({ type: 'done', debateComplete: true, countA: debate.countA, countB: debate.countB, autoJudge: debate.autoJudge })}\n\n`);
  } else {
    debate.nextSpeaker = speaker === 'A' ? 'B' : 'A';
    res.write(`data: ${JSON.stringify({ type: 'done', debateComplete: false, nextSpeaker: debate.nextSpeaker, countA: debate.countA, countB: debate.countB })}\n\n`);
  }

  res.end();
});

// ─── POST /api/debate/:id/verdict (streaming) ───────────────
app.post('/api/debate/:id/verdict', async (req, res) => {
  const debate = debates.get(req.params.id);
  if (!debate) return res.status(404).json({ error: 'Debate not found' });
  if (debate.phase !== 'judging' && debate.phase !== 'awaiting-judge') {
    return res.status(400).json({ error: 'Debate is not in judging phase. Set up a judge first.' });
  }

  if (debate.phase === 'awaiting-judge') {
    debate.phase = 'judging';
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  await new Promise(r => setTimeout(r, 400));

  const verdict = MOCK_DEBATE_CONTENT.judge;
  await streamText(res, verdict, 5, 15);

  debate.verdict = verdict;
  debate.phase = 'complete';

  const winnerMatch = verdict.match(/Winner:\s*(Side\s*[AB])/i);
  const winner = winnerMatch ? winnerMatch[1].replace(/\s/g, '') : 'SideB';

  res.write(`data: ${JSON.stringify({ type: 'done', winner, verdict })}\n\n`);
  res.end();
});

// ─── DELETE /api/debate/:id ─────────────────────────────────
app.delete('/api/debate/:id', (req, res) => {
  debates.delete(req.params.id);
  res.json({ success: true });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n🧪 Mock LLM Debate Arena running at http://localhost:${PORT}\n`);
  console.log('  This is a mock server for UI validation.');
  console.log('  No real LLM endpoints are needed.\n');
  console.log('  Quick start:');
  console.log(`    1. Open http://localhost:${PORT}`);
  console.log(`    2. Enter any statement (e.g., "AI will surpass human intelligence")`);
  console.log(`    3. Side A: endpoint = http://localhost:${PORT}, pick any model`);
  console.log(`    4. Side B: endpoint = http://localhost:${PORT}, pick any model`);
  console.log(`    5. Judge:  endpoint = http://localhost:${PORT}, pick any model (optional)`);
  console.log(`    6. Click "Start Debate" — everything runs automatically\n`);
});
