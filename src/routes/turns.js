const express = require('express');
const router = express.Router();
const { findDebate } = require('../middleware/debates');
const { createClient } = require('../utils/openai-client');
const { SYSTEM_PROMPT_TRUE, SYSTEM_PROMPT_FALSE } = require('../utils/prompts');
const { setupSSE, sendChunk, sendDone, sendError } = require('../utils/streaming');

/** POST /api/debate/:id/next-turn — Generate next debate turn (streaming) */
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

  setupSSE(res);

  async function runStream() {
    let content = '';
    const stream = await client.chat.completions.create({
      model,
      messages,
      stream: true,
      temperature: 0.7,
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

    // Save the message
    debate.messages.push({
      speaker,
      model,
      content: fullContent,
      timestamp: Date.now(),
    });

    if (speaker === 'A') debate.countA++;
    else debate.countB++;

    // Check if debate is complete
    const debateComplete = debate.countA >= debate.maxTurns && debate.countB >= debate.maxTurns;

    if (debateComplete) {
      debate.phase = debate.autoJudge ? 'judging' : 'awaiting-judge';
      debate.nextSpeaker = null;
      sendDone(res, { debateComplete: true, countA: debate.countA, countB: debate.countB, autoJudge: debate.autoJudge });
    } else {
      debate.nextSpeaker = speaker === 'A' ? 'B' : 'A';
      sendDone(res, { debateComplete: false, nextSpeaker: debate.nextSpeaker, countA: debate.countA, countB: debate.countB });
    }
  } catch (err) {
    console.error('Streaming error:', err.message);
    sendError(res, err.message);
  }

  res.end();
});

module.exports = router;
