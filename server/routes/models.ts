/** Model fetching routes for the real server */

import { Router, Request, Response } from 'express';
import { createClient } from '../utils/openai-client';
import { ModelsResponse, ModelInfo } from '../../shared/types/api';

const router = Router();

/** GET /api/models — Fetch available models from a given endpoint */
router.get('/models', async (req: Request, res: Response): Promise<void> => {
  const { url, apiKey } = req.query;
  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: 'URL is required' });
    return;
  }

  try {
    const client = createClient(url, apiKey as string | undefined);
    const response = await client.models.list();
    const models: ModelInfo[] = response.data.map(m => ({ id: m.id }));
    const result: ModelsResponse = { models };
    res.json(result);
  } catch (err) {
    console.error('Error fetching models:', (err as Error).message);
    res.status(500).json({ error: 'Failed to fetch models', detail: (err as Error).message });
  }
});

export default router;
