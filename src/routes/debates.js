const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { debates } = require('../middleware/debates');

/** POST /api/debate — Start a new debate */
router.post('/debate', (req, res) => {
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
  } = req.body;

  if (!statement || !modelA || !modelB || !endpointA || !endpointB) {
    return res.status(400).json({
      error: 'statement, modelA, modelB, endpointA, and endpointB are required',
    });
  }

  const id = uuidv4();
  const sideAGoesFirst = Math.random() < 0.5;

  debates.set(id, {
    id,
    statement,
    modelA, modelB,
    endpointA, apiKeyA: apiKeyA || 'ollama',
    endpointB, apiKeyB: apiKeyB || 'ollama',
    endpointJudge: endpointJudge || null,
    apiKeyJudge: apiKeyJudge || null,
    messages: [],
    nextSpeaker: sideAGoesFirst ? 'A' : 'B',
    countA: 0,
    countB: 0,
    maxTurns: 3,
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
  });

  res.json({
    id, phase: 'debating',
    nextSpeaker: sideAGoesFirst ? 'A' : 'B',
    modelA, modelB, statement,
    judgeModel: judgeModel || null,
    autoJudge: !!(judgeModel && endpointJudge),
  });
});

/** GET /api/debate/:id — Get debate state */
router.get('/debate/:id', (req, res) => {
  const debate = debates.get(req.params.id);
  if (!debate) return res.status(404).json({ error: 'Debate not found' });
  res.json({
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
  });
});

/** DELETE /api/debate/:id — Delete a debate */
router.delete('/debate/:id', (req, res) => {
  debates.delete(req.params.id);
  res.json({ success: true });
});

module.exports = router;
