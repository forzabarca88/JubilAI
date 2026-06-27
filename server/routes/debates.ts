/** Debate CRUD routes for the real server */

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { debates } from '../../shared/middleware/debates';
import { Debate, DebateCreateRequest, DebateResponse, DebateStateResponse } from '../../shared/types/debate';
import config from '../../shared/utils/config';

const router = Router();

/** POST /api/debate — Start a new debate */
router.post('/debate', (req: Request, res: Response): void => {
  const body = req.body as DebateCreateRequest;
  const {
    statement,
    modelA, modelB,
    endpointA, apiKeyA,
    endpointB, apiKeyB,
    judgeModel, endpointJudge, apiKeyJudge,
    // Optional: custom prompts
    promptA, promptB, promptJudge,
    // Optional: LLM parameters for debaters
    temperature, topP, topK, maxTokens,
    // Optional: LLM parameters for judge
    judgeTemperature, judgeTopP, judgeTopK, judgeMaxTokens,
  } = body;

  if (!statement || !modelA || !modelB || !endpointA || !endpointB) {
    res.status(400).json({
      error: 'statement, modelA, modelB, endpointA, and endpointB are required',
    });
    return;
  }

  const id = uuidv4();
  const sideAGoesFirst = Math.random() < 0.5;

  const debate: Debate = {
    id,
    statement,
    modelA, modelB,
    endpointA, apiKeyA: apiKeyA || config.debate.defaultApiKey,
    endpointB, apiKeyB: apiKeyB || config.debate.defaultApiKey,
    endpointJudge: endpointJudge || null,
    apiKeyJudge: apiKeyJudge || null,
    messages: [],
    nextSpeaker: sideAGoesFirst ? 'A' : 'B',
    countA: 0,
    countB: 0,
    maxTurns: config.debate.maxTurns,
    phase: 'debating',
    judgeModel: judgeModel || null,
    verdict: null,
    autoJudge: !!(judgeModel && endpointJudge),
    // Custom prompts (empty strings mean use defaults)
    customPromptA: promptA || '',
    customPromptB: promptB || '',
    customPromptJudge: promptJudge || '',
    // LLM parameters (null means use built-in defaults)
    temperature: typeof temperature === 'number' ? temperature : null,
    topP: typeof topP === 'number' ? topP : null,
    topK: typeof topK === 'number' ? topK : null,
    maxTokens: typeof maxTokens === 'number' ? maxTokens : null,
    // Judge-specific LLM parameters (null means use built-in judge defaults)
    judgeTemperature: typeof judgeTemperature === 'number' ? judgeTemperature : null,
    judgeTopP: typeof judgeTopP === 'number' ? judgeTopP : null,
    judgeTopK: typeof judgeTopK === 'number' ? judgeTopK : null,
    judgeMaxTokens: typeof judgeMaxTokens === 'number' ? judgeMaxTokens : null,
  };

  debates.set(id, debate);

  const response: DebateResponse = {
    id, phase: 'debating',
    nextSpeaker: sideAGoesFirst ? 'A' : 'B',
    modelA, modelB, statement,
    judgeModel: judgeModel || null,
    autoJudge: !!(judgeModel && endpointJudge),
  };

  res.json(response);
});

/** GET /api/debate/:id — Get debate state */
router.get('/debate/:id', (req: Request, res: Response): void => {
  const id = req.params.id;
  if (typeof id !== 'string') {
    res.status(400).json({ error: 'Invalid ID' });
    return;
  }
  const debate = debates.get(id);
  if (!debate) {
    res.status(404).json({ error: 'Debate not found' });
    return;
  }
  const response: DebateStateResponse = {
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
  };
  res.json(response);
});

/** DELETE /api/debate/:id — Delete a debate */
router.delete('/debate/:id', (req: Request, res: Response): void => {
  const id = req.params.id;
  if (typeof id !== 'string') {
    res.status(400).json({ error: 'Invalid ID' });
    return;
  }
  debates.delete(id);
  res.json({ success: true });
});

export default router;
