const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const OpenAI = require('openai');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Store debates in memory
const debates = new Map();

// System prompts for debate roles
const SYSTEM_PROMPT_TRUE = `You are a debater arguing that the following statement is TRUE.
Provide strong, logical arguments supporting this position. Address counterarguments raised
by your opponent. Be persuasive, cite reasoning, and directly respond to points made against
your position. Stay focused on defending the statement. Do not concede or switch sides.

IMPORTANT: Be concise and succinct. Use fewer words — get straight to the point. Make each
argument brief but impactful. Brevity will be a factor in judging the debate outcome.`;

const SYSTEM_PROMPT_FALSE = `You are a debater arguing that the following statement is FALSE.
Provide strong, logical arguments against this position. Address counterarguments raised
by your opponent. Be persuasive, cite reasoning, and directly respond to points made in
favor of your opponent's position. Stay focused on refuting the statement. Do not concede or switch sides.

IMPORTANT: Be concise and succinct. Use fewer words — get straight to the point. Make each
argument brief but impactful. Brevity will be a factor in judging the debate outcome.`;

const SYSTEM_PROMPT_JUDGE = `You are an impartial judge evaluating a debate between two sides.
One side argued that the statement is TRUE, the other argued it is FALSE.
Evaluate both arguments based on: logical reasoning, evidence quality, rhetorical skill,
how well each side addressed the opponent's points, and conciseness. Points made succinctly
and with fewer words will be favored — brevity is a factor in the debate outcome.
Choose the winner and explain why.`;

// Create an OpenAI-compatible client for a given URL
function createClient(apiUrl, apiKey) {
  const baseURL = apiUrl.replace(/\/+$/, '');
  return new OpenAI({
    baseURL: baseURL + '/v1',
    apiKey: apiKey || 'ollama',
  });
}

// Fetch available models from a given endpoint
app.get('/api/models', async (req, res) => {
  const { url, apiKey } = req.query;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  try {
    const client = createClient(url, apiKey);
    const response = await client.models.list();
    const models = response.data.map(m => ({ id: m.id, ...m }));
    res.json({ models });
  } catch (err) {
    console.error('Error fetching models:', err.message);
    res.status(500).json({ error: 'Failed to fetch models', detail: err.message });
  }
});

// Start a new debate — each side can have its own endpoint, judge is optional
app.post('/api/debate', (req, res) => {
  const {
    statement,
    modelA, modelB,
    endpointA, apiKeyA,
    endpointB, apiKeyB,
    judgeModel, endpointJudge, apiKeyJudge,
  } = req.body;

  if (!statement || !modelA || !modelB || !endpointA || !endpointB) {
    return res.status(400).json({
      error: 'statement, modelA, modelB, endpointA, and endpointB are required'
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
    apiKeyJudge: apiKeyJudge || null,
    messages: [],
    nextSpeaker: startsWithA ? 'A' : 'B',
    countA: 0,
    countB: 0,
    maxTurns: 3,
    phase: 'debating',
    judgeModel: judgeModel || null,
    verdict: null,
    // If judge is pre-configured, auto-judge after debate completes
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

// Get debate state
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

// Set judge model and endpoint (called after debate completes)
// Accepts both 'debating' and 'awaiting-judge' phases
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

// Get next turn (streaming) — uses the correct endpoint per side
app.post('/api/debate/:id/next-turn', async (req, res) => {
  const debate = debates.get(req.params.id);
  if (!debate) return res.status(404).json({ error: 'Debate not found' });
  if (debate.phase !== 'debating') return res.status(400).json({ error: 'Debate is not in debating phase' });

  const { speaker } = req.body;
  if (speaker !== debate.nextSpeaker) {
    return res.status(400).json({ error: `Not ${speaker}'s turn. Next speaker: ${debate.nextSpeaker}` });
  }

  const model = speaker === 'A' ? debate.modelA : debate.modelB;
  const systemPrompt = speaker === 'A' ? SYSTEM_PROMPT_TRUE : SYSTEM_PROMPT_FALSE;
  const endpoint = speaker === 'A' ? debate.endpointA : debate.endpointB;
  const apiKey = speaker === 'A' ? debate.apiKeyA : debate.apiKeyB;

  // Build conversation context
  const conversationHistory = debate.messages.map(m => {
    const label = m.speaker === 'A' ? 'Side A (arguing TRUE)' : 'Side B (arguing FALSE)';
    return { role: 'user', content: `[${label}]: "${m.content}"` };
  });

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `The statement to debate is: "${debate.statement}"` },
    ...conversationHistory,
  ];

  const client = createClient(endpoint, apiKey);

  // Set up streaming
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  let fullContent = '';

  try {
    const stream = await client.chat.completions.create({
      model,
      messages,
      stream: true,
      temperature: 0.7,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content || '';
      if (delta) {
        fullContent += delta;
        res.write(`data: ${JSON.stringify({ type: 'chunk', content: delta })}\n\n`);
      }
    }

    // Save the message
    debate.messages.push({
      speaker,
      model,
      content: fullContent,
      timestamp: Date.now(),
    });

    if (speaker === 'A') debate.countA++;
    else debate.countB++;

    // Check if debate is complete (both have sent maxTurns messages)
    const debateComplete = debate.countA >= debate.maxTurns && debate.countB >= debate.maxTurns;

    if (debateComplete) {
      // If judge is pre-configured, go straight to judging phase
      if (debate.autoJudge) {
        debate.phase = 'judging';
      } else {
        debate.phase = 'awaiting-judge';
      }
      debate.nextSpeaker = null;
      res.write(`data: ${JSON.stringify({ type: 'done', debateComplete: true, countA: debate.countA, countB: debate.countB, autoJudge: debate.autoJudge })}\n\n`);
    } else {
      // Switch to other speaker
      debate.nextSpeaker = speaker === 'A' ? 'B' : 'A';
      res.write(`data: ${JSON.stringify({ type: 'done', debateComplete: false, nextSpeaker: debate.nextSpeaker, countA: debate.countA, countB: debate.countB })}\n\n`);
    }

  } catch (err) {
    console.error('Streaming error:', err.message);
    res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
  }

  res.end();
});

// Get judge verdict (streaming) — uses judge's own endpoint
// Accepts both 'judging' and 'awaiting-judge' phases
app.post('/api/debate/:id/verdict', async (req, res) => {
  const debate = debates.get(req.params.id);
  if (!debate) return res.status(404).json({ error: 'Debate not found' });
  if (debate.phase !== 'judging' && debate.phase !== 'awaiting-judge') {
    return res.status(400).json({ error: 'Debate is not in judging phase. Set up a judge first.' });
  }

  // If still in awaiting-judge phase, transition to judging
  if (debate.phase === 'awaiting-judge') {
    debate.phase = 'judging';
  }

  // Build judge prompt
  const argsA = debate.messages.filter(m => m.speaker === 'A').map((m, i) => `  Argument ${i + 1}: ${m.content}`).join('\n');
  const argsB = debate.messages.filter(m => m.speaker === 'B').map((m, i) => `  Argument ${i + 1}: ${m.content}`).join('\n');

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT_JUDGE },
    {
      role: 'user',
      content: `Statement: "${debate.statement}"

Side A (arguing TRUE) used model: ${debate.modelA}
Arguments from Side A:
${argsA}

Side B (arguing FALSE) used model: ${debate.modelB}
Arguments from Side B:
${argsB}

Evaluate both sides and declare a winner. Explain your reasoning clearly.
Format your response starting with "Winner: Side A" or "Winner: Side B", followed by your detailed evaluation.`,
    },
  ];

  const client = createClient(debate.endpointJudge, debate.apiKeyJudge);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  let fullContent = '';

  try {
    const stream = await client.chat.completions.create({
      model: debate.judgeModel,
      messages,
      stream: true,
      temperature: 0.5,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content || '';
      if (delta) {
        fullContent += delta;
        res.write(`data: ${JSON.stringify({ type: 'chunk', content: delta })}\n\n`);
      }
    }

    debate.verdict = fullContent;
    debate.phase = 'complete';

    // Parse winner
    const winnerMatch = fullContent.match(/Winner:\s*(Side\s*[AB])/i);
    const winner = winnerMatch ? winnerMatch[1].replace(/\s/g, '') : null;

    res.write(`data: ${JSON.stringify({ type: 'done', winner, verdict: fullContent })}\n\n`);

  } catch (err) {
    console.error('Judge streaming error:', err.message);
    res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
  }

  res.end();
});

// Delete a debate
app.delete('/api/debate/:id', (req, res) => {
  debates.delete(req.params.id);
  res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🏛️  LLM Debate Arena running at http://localhost:${PORT}\n`);
});
