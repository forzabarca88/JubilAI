/** Express app factory for the mock server */

import express, { Express } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import routes from './routes';
import type { RootConfig } from '../shared/types/config';
import { getAffirmativePrompt, getNegativePrompt, getJudgePrompt } from '../shared/utils/prompts';

export function createApp(config: RootConfig): Express {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());

  // COOP + COEP headers — required for SharedArrayBuffer (multi-threaded WASM in TTS worker)
  app.use((req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    next();
  });

  // Route handlers registered BEFORE express.static to take priority
  // Serve config.json to the frontend (with env overrides applied)
  // Resolve prompt versions so the client gets the actual prompt text
  app.get('/config.json', (req, res) => {
    const resolved = { ...config };
    resolved.prompts = {
      ...config.prompts,
      affirmative: getAffirmativePrompt(),
      negative: getNegativePrompt(),
      judge: getJudgePrompt(),
    };
    res.json(resolved);
  });

  // In kiosk mode, serve HTML with data-kiosk attribute injected
  if (config.kiosk.enabled) {
    const htmlPath = path.join(process.cwd(), 'public/index.html');
    app.get('/', (req, res) => {
      let html = fs.readFileSync(htmlPath, 'utf-8');
      html = html.replace('<html lang="en" data-kiosk="false">', '<html lang="en" data-kiosk="true">');
      res.type('html').send(html);
    });
  }

  app.use(express.static('public'));
  app.use('/dist', express.static('dist'));

  // Mount API routes
  app.use('/api', routes);

  return app;
}
