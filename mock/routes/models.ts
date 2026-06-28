/** Mock model fetching routes */

import { Router, Request, Response } from 'express';
import { ModelsResponse, ModelInfo } from '../../shared/types/api';
import config from '../../shared/utils/config';

const router = Router();

/** GET /api/models — Return mock models from config */
router.get('/models', async (req: Request, res: Response): Promise<void> => {
  await new Promise(resolve => setTimeout(resolve, config.mock.modelFetchDelayMs));

  const models: ModelInfo[] = config.mock.models.map(id => ({ id }));
  const result: ModelsResponse = { models };
  res.json(result);
});

export default router;
