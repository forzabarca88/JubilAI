const express = require('express');
const router = express.Router();
const { findDebate } = require('../middleware/debates');
const { createClient } = require('../utils/openai-client');
const { SYSTEM_PROMPT_JUDGE } = require('../utils/prompts');
const { setupSSE, sendChunk, sendDone, sendError } = require('../utils/streaming');

/** POST /api/debate/:id/judge — Set judge model and endpoint */
router.post('/debate/:id/judge', findDebate, (req, res) => {
  const debate = req.debate;

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

/** POST /api/debate/:id/verdict — Get judge verdict (streaming) */
router.post('/debate/:id/verdict', findDebate, async (req, res) => {
  const debate = req.debate;

  if (debate.phase !== 'judging' && debate.phase !== 'awaiting-judge') {
    return res.status(400).json({ error: 'Debate is not in judging phase. Set up a judge first.' });
  }

  // Transition from awaiting-judge to judging
  if (debate.phase === 'awaiting-judge') {
    debate.phase = 'judging';
  }

  // Build judge prompt
  const argsA = debate.messages.filter(m => m.speaker === 'A').map((m, i) =>
    `  Argument ${i + 1}: ${m.content}`
  ).join('\n');
  const argsB = debate.messages.filter(m => m.speaker === 'B').map((m, i) =>
    `  Argument ${i + 1}: ${m.content}`
  ).join('\n');

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT_JUDGE },
    {
      role: 'user',
      content: `Statement: "${debate.statement}"

The Affirmative (arguing TRUE) used model: ${debate.modelA}
Arguments from The Affirmative:
${argsA}

The Negative (arguing FALSE) used model: ${debate.modelB}
Arguments from The Negative:
${argsB}

Evaluate both sides and declare a winner. Explain your reasoning clearly.
Format your response starting with "Winner: The Affirmative" or "Winner: The Negative", followed by your detailed evaluation.`,
    },
  ];

  const client = createClient(debate.endpointJudge, debate.apiKeyJudge);

  setupSSE(res);

  async function runStream() {
    let content = '';
    const stream = await client.chat.completions.create({
      model: debate.judgeModel,
      messages,
      stream: true,
      temperature: 0.5,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content || '';
      if (delta) {
        content += delta;
        sendChunk(res, delta);
      }
    }
    return content;
  }

  try {
    let fullContent;
    fullContent = await runStream();

    debate.verdict = fullContent;
    debate.phase = 'complete';

    const winnerMatch = fullContent.match(/Winner:\s*(The\s+(Affirmative|Negative))/i);
    const winner = winnerMatch ? 'The ' + winnerMatch[2] : null;

    sendDone(res, { winner, verdict: fullContent });
  } catch (err) {
    console.error('Judge streaming error:', err.message);
    sendError(res, err.message);
  }

  res.end();
});

module.exports = router;
