/** Express app factory for the real server */

import express, { Express } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import routes from './routes';
import type { RootConfig } from '../shared/types/config';

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

  app.use(express.static('public'));
  app.use('/dist', express.static('dist'));

  // Serve config.json to the frontend (with env overrides applied)
  app.get('/config.json', (req, res) => {
    res.json(config);
  });

  // In kiosk mode, serve HTML with data-kiosk attribute injected
  if (config.kiosk.enabled) {
    const htmlPath = path.join(__dirname, '../../public/index.html');
    app.get('/', (req, res) => {
      let html = fs.readFileSync(htmlPath, 'utf-8');
      html = html.replace('<html lang="en" data-kiosk="false">', '<html lang="en" data-kiosk="true">');
      res.type('html').send(html);
    });
  }

  // Mount API routes
  app.use('/api', routes);

  return app;
}
