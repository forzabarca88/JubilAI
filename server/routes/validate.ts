/** Pre-flight validation route — verifies endpoint/key/model before debate starts */

import { Router, Request, Response } from 'express';
import { createClient } from '../utils/openai-client';

const router = Router();

/** POST /api/validate — Test an endpoint/API key/model combination */
router.post('/validate', async (req: Request, res: Response): Promise<void> => {
  const body = req.body as { url: string; apiKey?: string; model?: string };
  const { url, apiKey, model } = body;

  if (!url) {
    res.status(400).json({ valid: false, error: 'url is required' });
    return;
  }

  try {
    const client = createClient(url, apiKey);

    // Test 1: Reach the endpoint's /v1/models list (confirms connectivity + auth)
    const models = await client.models.list();
    const modelIds = models.data.map((m: { id: string }) => m.id);

    if (modelIds.length === 0) {
      res.json({ valid: false, error: 'Endpoint returned no models', models: [] });
      return;
    }

    // Test 2: If a specific model was provided, verify it exists
    if (model) {
      const found = modelIds.includes(model);
      if (!found) {
        res.json({
          valid: false,
          error: `Model "${model}" not found. Available: ${modelIds.slice(0, 10).join(', ')}${modelIds.length > 10 ? '...' : ''}`,
          models: modelIds,
        });
        return;
      }
    }

    // Test 3: Make a lightweight completion request to confirm the model works
    if (model) {
      try {
        const completion = await client.chat.completions.create({
          model,
          messages: [{ role: 'user', content: 'Say "ok" and nothing else.' }],
          max_tokens: 5,
          temperature: 0,
        });
        const content = completion.choices?.[0]?.message?.content?.trim() || '';
        if (!content) {
          res.json({
            valid: false,
            error: 'Model returned empty response',
            models: modelIds,
          });
          return;
        }
      } catch (err) {
        res.json({
          valid: false,
          error: `Model test failed: ${(err as Error).message}`,
          models: modelIds,
        });
        return;
      }
    }

    res.json({
      valid: true,
      models: modelIds,
      model,
    });
  } catch (err) {
    res.json({
      valid: false,
      error: `Connection failed: ${(err as Error).message}`,
      models: [],
    });
  }
});

export default router;
