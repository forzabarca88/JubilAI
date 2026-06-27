/** Judge verdict routes with SSE streaming */

import { Router, Request, Response } from 'express';
import { findDebate } from '../../shared/middleware/debates';
import { createClient, withRetry } from '../utils/openai-client';
import { getJudgePrompt } from '../../shared/utils/prompts';
import { setupSSE, sendChunk, sendDone, sendError } from '../../shared/utils/streaming';
import { Debate } from '../../shared/types/debate';
import { SSDoneEvent } from '../../shared/types/sse';
import config from '../../shared/utils/config';

const router = Router();

/** POST /api/debate/:id/judge — Set judge model and endpoint */
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

/** POST /api/debate/:id/verdict — Get judge verdict (streaming) */
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

  // Build judge prompt
  const argsA = debate.messages.filter((m) => m.speaker === 'A').map((m, i) =>
    `  Argument ${i + 1}: ${m.content}`
  ).join('\n');
  const argsB = debate.messages.filter((m) => m.speaker === 'B').map((m, i) =>
    `  Argument ${i + 1}: ${m.content}`
  ).join('\n');

  const messages = [
    { role: 'system' as const, content: getJudgePrompt(debate.customPromptJudge) },
    {
      role: 'user' as const,
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

  const client = createClient(debate.endpointJudge!, debate.apiKeyJudge ?? undefined);

  setupSSE(res);

  async function runStream(): Promise<string> {
    let content = '';

    // Build stream options with flexible typing for non-standard params (top_k, etc.)
    const streamOptions: Record<string, unknown> = {
      model: debate.judgeModel!,
      messages,
      stream: true,
      temperature: debate.judgeTemperature ?? config.llm.judgeDefaults.temperature ?? 0.5,
    };
    if (debate.judgeTopP !== null && debate.judgeTopP !== undefined) {
      streamOptions.top_p = debate.judgeTopP;
    }
    if (debate.judgeTopK !== null && debate.judgeTopK !== undefined && debate.judgeTopK > 0) {
      streamOptions.top_k = debate.judgeTopK;
    }
    if (debate.judgeMaxTokens !== null && debate.judgeMaxTokens !== undefined && debate.judgeMaxTokens > 0) {
      streamOptions.max_tokens = debate.judgeMaxTokens;
    }

    const result = await withRetry(() => client.chat.completions.create(streamOptions as any));

    // Handle both streaming (async iterable) and non-streaming responses
    if (Symbol.asyncIterator in result) {
      for await (const chunk of (result as any)) {
        const delta = chunk.choices?.[0]?.delta?.content || '';
        if (delta) {
          content += delta;
          sendChunk(res, delta);
        }
      }
    } else {
      // Non-streaming response (single completion)
      const text = (result as any).choices?.[0]?.message?.content || '';
      if (text) {
        content = text;
        sendChunk(res, text);
      }
    }
    return content;
  }

  try {
    let fullContent;
    fullContent = await runStream();

    debate.verdict = fullContent;
    debate.phase = 'complete';

    const winnerMatch = fullContent.match(config.debate.winnerPattern);
    const winner = winnerMatch ? 'The ' + winnerMatch[2] : null;

    const doneData: Omit<SSDoneEvent, 'type'> = {
      winner,
      verdict: fullContent,
    };
    sendDone(res, doneData);
  } catch (err) {
    console.error('Judge streaming error:', (err as Error).message);
    sendError(res, (err as Error).message);
  }

  res.end();
});

export default router;
