/** Mock judge verdict routes with SSE streaming */

import { Router, Request, Response } from 'express';
import { findDebate } from '../../shared/middleware/debates';
import { setupSSE, sendChunk, sendDone, sendError, streamText } from '../../shared/utils/streaming';
import { Debate } from '../../shared/types/debate';
import { SSDoneEvent } from '../../shared/types/sse';
import { saveDebate } from '../../shared/utils/debate-storage';
import config from '../../shared/utils/config';
import { MOCK_JUDGE_VERDICTS } from '../data/mock-data';

const router = Router();

/** POST /api/debate/:id/judge — Set judge model and endpoint (mock) */
router.post('/debate/:id/judge', findDebate, (req: Request, res: Response): void => {
  const debate = (req as Request & { debate: Debate }).debate;

  if (debate.phase !== 'debating' && debate.phase !== 'awaiting-judge') {
    res.status(400).json({ error: 'Debate is not in debating or awaiting-judge phase' });
    return;
  }

  const body = req.body as { judgeModel: string; endpointJudge: string; apiKeyJudge?: string };
  const { judgeModel, endpointJudge, apiKeyJudge } = body;
  if (!judgeModel || !endpointJudge) {
    res.status(400).json({ error: 'judgeModel and endpointJudge are required' });
    return;
  }

  debate.phase = 'judging';
  debate.judgeModel = judgeModel;
  debate.endpointJudge = endpointJudge;
  debate.apiKeyJudge = apiKeyJudge || config.debate.defaultApiKey;

  res.json({ phase: 'judging', judgeModel });
});

/** POST /api/debate/:id/verdict — Get judge verdict (mock, streaming) */
router.post('/debate/:id/verdict', findDebate, async (req: Request, res: Response): Promise<void> => {
  const debate = (req as Request & { debate: Debate }).debate;

  if (debate.phase !== 'judging' && debate.phase !== 'awaiting-judge' && debate.phase !== 'complete') {
    res.status(400).json({ error: 'Debate is not in judging phase. Set up a judge first.' });
    return;
  }

  // Transition from awaiting-judge to judging
  if (debate.phase === 'awaiting-judge') {
    debate.phase = 'judging';
  }

  // Simulate generation delay
  await new Promise(resolve => setTimeout(resolve, config.mock.verdictGenerationDelayMs));

  const content = MOCK_JUDGE_VERDICTS[Math.floor(Math.random() * MOCK_JUDGE_VERDICTS.length)];

  setupSSE(res);

  try {
    await streamText(res, content, config.mock.streamChunkSize, config.mock.streamDelayMs);

    debate.verdict = content;
    debate.phase = 'complete';

    // Persist completed debate to disk
    saveDebate(debate);

    const winnerMatch = content.match(config.debate.winnerPattern);
    const winner = winnerMatch ? 'The ' + winnerMatch[2] : null;

    const doneData: Omit<SSDoneEvent, 'type'> = {
      winner,
      verdict: content,
    };
    sendDone(res, doneData);
  } catch (err) {
    console.error('Mock judge streaming error:', (err as Error).message);
    sendError(res, (err as Error).message);
  }

  res.end();
});

export default router;
