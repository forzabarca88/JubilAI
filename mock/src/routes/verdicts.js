const express = require('express');
const router = express.Router();
const { findDebate } = require('../middleware/debates');
const { MOCK_DEBATE_CONTENT } = require('../utils/mock-data');
const { streamText } = require('../utils/streaming');

/** POST /api/debate/:id/judge — Set judge for mock debate */
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

/** POST /api/debate/:id/verdict — Get mock judge verdict (streaming) */
router.post('/debate/:id/verdict', findDebate, async (req, res) => {
  const debate = req.debate;

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

  const winnerMatch = verdict.match(/Winner:\s*(The\s+(Affirmative|Negative))/i);
  const winner = winnerMatch ? 'The ' + winnerMatch[2] : 'The Negative';

  res.write(`data: ${JSON.stringify({ type: 'done', winner, verdict })}\n\n`);
  res.end();
});

module.exports = router;
