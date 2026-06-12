const express = require('express');
const router = express.Router();
const { findDebate } = require('../middleware/debates');
const { MOCK_DEBATE_CONTENT } = require('../utils/mock-data');
const { streamText } = require('../utils/streaming');

/** POST /api/debate/:id/next-turn — Generate next mock debate turn (streaming) */
router.post('/debate/:id/next-turn', findDebate, async (req, res) => {
  const debate = req.debate;

  if (debate.phase !== 'debating') {
    return res.status(400).json({ error: 'Debate is not in debating phase' });
  }

  const { speaker } = req.body;
  if (speaker !== debate.nextSpeaker) {
    return res.status(400).json({ error: `Not ${speaker}'s turn. Next speaker: ${debate.nextSpeaker}` });
  }

  const model = speaker === 'A' ? debate.modelA : debate.modelB;
  const turnIndex = speaker === 'A' ? debate.countA : debate.countB;
  const content = MOCK_DEBATE_CONTENT[speaker][turnIndex]
    || `Mock argument ${turnIndex + 1} from Side ${speaker}.`;

  // Set up streaming headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  // Simulate generation delay
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
    debate.phase = debate.autoJudge ? 'judging' : 'awaiting-judge';
    debate.nextSpeaker = null;
    res.write(`data: ${JSON.stringify({ type: 'done', debateComplete: true, countA: debate.countA, countB: debate.countB, autoJudge: debate.autoJudge })}\n\n`);
  } else {
    debate.nextSpeaker = speaker === 'A' ? 'B' : 'A';
    res.write(`data: ${JSON.stringify({ type: 'done', debateComplete: false, nextSpeaker: debate.nextSpeaker, countA: debate.countA, countB: debate.countB })}\n\n`);
  }

  res.end();
});

module.exports = router;
