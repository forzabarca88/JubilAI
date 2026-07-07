/** Mock pre-flight validation — always succeeds for UI testing */

import { Router, Request, Response } from 'express';
import config from '../../shared/utils/config';

const router = Router();

/** POST /api/validate — Mock validation (always succeeds) */
router.post('/validate', async (req: Request, res: Response): Promise<void> => {
  const body = req.body as { url: string; apiKey?: string; model?: string };
  const { model } = body;

  await new Promise(resolve => setTimeout(resolve, 200));

  if (model && !config.mock.models.includes(model)) {
    res.json({
      valid: false,
      error: `Model "${model}" not found in mock. Available: ${config.mock.models.join(', ')}`,
      models: config.mock.models,
    });
    return;
  }

  res.json({
    valid: true,
    models: config.mock.models,
    model,
  });
});

export default router;
