/** Mock debate CRUD routes */

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { debates } from '../../shared/middleware/debates';
import { Debate, DebateCreateRequest, DebateResponse, DebateStateResponse } from '../../shared/types/debate';
import { deleteDebate, loadDebate, listDebates } from '../../shared/utils/debate-storage';
import config from '../../shared/utils/config';

const router = Router();

/** POST /api/debate — Start a new debate (mock) */
router.post('/debate', (req: Request, res: Response): void => {
  const body = req.body as DebateCreateRequest;
  const {
    statement,
    modelA, modelB,
    endpointA, endpointB,
    judgeModel, endpointJudge,
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
    endpointA, apiKeyA: config.debate.defaultApiKey,
    endpointB, apiKeyB: config.debate.defaultApiKey,
    endpointJudge: endpointJudge || null,
    apiKeyJudge: config.debate.defaultApiKey,
    messages: [],
    nextSpeaker: sideAGoesFirst ? 'A' : 'B',
    countA: 0,
    countB: 0,
    maxTurns: config.debate.maxTurns,
    phase: 'debating',
    judgeModel: judgeModel || null,
    verdict: null,
    autoJudge: !!(judgeModel && endpointJudge),
    customPromptA: '',
    customPromptB: '',
    customPromptJudge: '',
    temperature: null,
    topP: null,
    topK: null,
    maxTokens: null,
    judgeTemperature: null,
    judgeTopP: null,
    judgeTopK: null,
    judgeMaxTokens: null,
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

/** GET /api/debate/:id — Get debate state (mock) */
router.get('/debate/:id', (req: Request, res: Response): void => {
  const id = req.params.id;
  if (typeof id !== 'string') {
    res.status(400).json({ error: 'Invalid ID' });
    return;
  }
  let debate = debates.get(id);
  // Fall back to disk storage for completed debates not in memory
  if (!debate) {
    debate = loadDebate(id) ?? undefined;
  }
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

/** DELETE /api/debate/:id — Delete a debate (mock) */
router.delete('/debate/:id', (req: Request, res: Response): void => {
  const id = req.params.id;
  if (typeof id !== 'string') {
    res.status(400).json({ error: 'Invalid ID' });
    return;
  }
  debates.delete(id);
  deleteDebate(id); // also remove disk file
  res.json({ success: true });
});

/** GET /api/debates — List all persisted debates (mock) */
router.get('/debates', (req: Request, res: Response): void => {
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
  const debatesList = listDebates(limit);
  res.json({ debates: debatesList });
});

/** GET /api/debates/:id — Get a persisted debate's full data (mock) */
router.get('/debates/:id', (req: Request, res: Response): void => {
  const id = req.params.id;
  if (typeof id !== 'string') {
    res.status(400).json({ error: 'Invalid ID' });
    return;
  }
  // Try in-memory first, then disk
  let debate = debates.get(id);
  if (!debate) {
    debate = loadDebate(id) ?? undefined;
  }
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

/** DELETE /api/debates/:id — Delete a persisted debate (mock) */
router.delete('/debates/:id', (req: Request, res: Response): void => {
  const id = req.params.id;
  if (typeof id !== 'string') {
    res.status(400).json({ error: 'Invalid ID' });
    return;
  }
  // Remove from in-memory map (active debates)
  debates.delete(id);
  // Remove from disk (persisted completed debates)
  deleteDebate(id);
  res.json({ success: true });
});

export default router;
