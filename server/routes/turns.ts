/** Debate turn execution with SSE streaming */

import { Router, Request, Response } from 'express';
import { findDebate } from '../../shared/middleware/debates';
import { createClient, withRetry } from '../utils/openai-client';
import { getSpeakerPrompt } from '../../shared/utils/prompts';
import { setupSSE, sendChunk, sendDone, sendError } from '../../shared/utils/streaming';
import { Debate, Speaker } from '../../shared/types/debate';
import { SSDoneEvent } from '../../shared/types/sse';
import config from '../../shared/utils/config';

const router = Router();

/** POST /api/debate/:id/next-turn — Generate next debate turn (streaming) */
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

  const model = speaker === 'A' ? debate.modelA : debate.modelB;
  const systemPrompt = getSpeakerPrompt(
    speaker,
    speaker === 'A' ? debate.customPromptA : debate.customPromptB
  );
  const endpoint = speaker === 'A' ? debate.endpointA : debate.endpointB;
  const apiKey = speaker === 'A' ? debate.apiKeyA : debate.apiKeyB;

  // Build conversation context
  const conversationHistory = debate.messages.map((m) => {
    const label = m.speaker === 'A' ? 'The Affirmative (arguing TRUE)' : 'The Negative (arguing FALSE)';
    return { role: 'user' as const, content: `[${label}]: "${m.content}"` };
  });

  const messages = [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: `The statement to debate is: "${debate.statement}"` },
    ...conversationHistory,
  ];

  const client = createClient(endpoint, apiKey);

  console.log(`[Turn] Speaker ${speaker} (${model}) @ ${endpoint}`);
  console.log(`[Turn] System prompt: ${systemPrompt.substring(0, 120)}...`);
  console.log(`[Turn] Conversation history: ${debate.messages.length} messages`);

  setupSSE(res);

  async function runStream(): Promise<string> {
    let content = '';
    let chunkCount = 0;

    // Build stream options with flexible typing for non-standard params (top_k, etc.)
    const streamOptions: Record<string, unknown> = {
      model,
      messages,
      stream: true,
      temperature: debate.temperature ?? config.llm.debaterDefaults.temperature ?? 0.7,
    };
    if (debate.topP !== null && debate.topP !== undefined) {
      streamOptions.top_p = debate.topP;
    }
    if (debate.topK !== null && debate.topK !== undefined && debate.topK > 0) {
      streamOptions.top_k = debate.topK;
    }
    if (debate.maxTokens !== null && debate.maxTokens !== undefined && debate.maxTokens > 0) {
      streamOptions.max_tokens = debate.maxTokens;
    }

    console.log(`[Turn] Stream options: model=${model}, temperature=${streamOptions.temperature}`);

    const result = await withRetry(() => client.chat.completions.create(streamOptions as any));

    // Handle both streaming (async iterable) and non-streaming responses
    if (Symbol.asyncIterator in result) {
      for await (const chunk of (result as any)) {
        const delta = chunk.choices?.[0]?.delta?.content || '';
        if (delta) {
          content += delta;
          chunkCount++;
          sendChunk(res, delta);
        }
      }
      console.log(`[Turn] Stream complete: ${chunkCount} chunks, ${content.length} chars`);
    } else {
      // Non-streaming response (single completion)
      const text = (result as any).choices?.[0]?.message?.content || '';
      if (text) {
        content = text;
        sendChunk(res, text);
      }
      console.log(`[Turn] Non-streaming response: ${content.length} chars`);
    }
    return content;
  }

  try {
    console.log(`[Turn] Starting stream for speaker ${speaker}...`);
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
    console.error('Streaming error:', (err as Error).message);
    sendError(res, (err as Error).message);
  }

  res.end();
});

export default router;
