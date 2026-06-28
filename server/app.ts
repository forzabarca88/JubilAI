/** Express app factory for the real server */

import express, { Express } from 'express';
import cors from 'cors';
import path from 'path';
import routes from './routes';

export function createApp(): Express {
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

  // Serve config.json to the frontend
  app.get('/config.json', (req, res) => {
    res.sendFile(path.join(__dirname, '../../../config.json'));
  });

  // Mount API routes
  app.use('/api', routes);

  return app;
}
