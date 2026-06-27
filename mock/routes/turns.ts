/** Mock debate turn execution with SSE streaming */

import { Router, Request, Response } from 'express';
import { findDebate } from '../../shared/middleware/debates';
import { setupSSE, sendChunk, sendDone, sendError, streamText } from '../../shared/utils/streaming';
import { Debate, Speaker } from '../../shared/types/debate';
import { SSDoneEvent } from '../../shared/types/sse';
import config from '../../shared/utils/config';
import { MOCK_DEBATE_CONTENT } from '../data/mock-data';

const router = Router();

/** POST /api/debate/:id/next-turn — Generate next debate turn (mock, streaming) */
router.post('/debate/:id/next-turn', findDebate, async (req: Request, res: Response): Promise<void> => {
  const debate = (req as Request & { debate: Debate }).debate;

  if (debate.phase !== 'debating') {
    res.status(400).json({ error: 'Debate is not in debating phase' });
    return;
  }

  const body = req.body as { speaker: string };
  const speaker = body.speaker as Speaker;
  if (speaker !== debate.nextSpeaker) {
    res.status(400).json({ error: `Not ${speaker}'s turn. Next speaker: ${debate.nextSpeaker}` });
    return;
  }

  // Simulate generation delay
  await new Promise(resolve => setTimeout(resolve, config.mock.turnGenerationDelayMs));

  // Pick content from mock data
  const turnIndex = speaker === 'A' ? debate.countA : debate.countB;
  const content = MOCK_DEBATE_CONTENT[speaker]?.[turnIndex] ?? 'No mock content available for this turn.';

  setupSSE(res);

  try {
    await streamText(res, content, config.mock.streamChunkSize, config.mock.streamDelayMs);

    // Save the message
    debate.messages.push({
      speaker,
      model: speaker === 'A' ? debate.modelA : debate.modelB,
      content,
      timestamp: Date.now(),
    });

    if (speaker === 'A') debate.countA++;
    else debate.countB++;

    // Check if debate is complete
    const debateComplete = debate.countA >= debate.maxTurns && debate.countB >= debate.maxTurns;

    if (debateComplete) {
      debate.phase = debate.autoJudge ? 'judging' : 'awaiting-judge';
      debate.nextSpeaker = null;
      const doneData: Omit<SSDoneEvent, 'type'> = {
        debateComplete: true,
        countA: debate.countA,
        countB: debate.countB,
        autoJudge: debate.autoJudge,
      };
      sendDone(res, doneData);
    } else {
      debate.nextSpeaker = speaker === 'A' ? 'B' : 'A';
      const doneData: Omit<SSDoneEvent, 'type'> = {
        debateComplete: false,
        nextSpeaker: debate.nextSpeaker,
        countA: debate.countA,
        countB: debate.countB,
      };
      sendDone(res, doneData);
    }
  } catch (err) {
    console.error('Mock streaming error:', (err as Error).message);
    sendError(res, (err as Error).message);
  }

  res.end();
});

export default router;
