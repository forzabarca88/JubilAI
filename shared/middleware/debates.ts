/**
 * In-memory store for active debates + findDebate middleware.
 * Shared between real server (`server/`) and mock server (`mock/`).
 */

import { Request, Response, NextFunction } from 'express';
import { Debate } from '../types/debate';

/** In-memory store for active debates */
export const debates = new Map<string, Debate>();

/**
 * Express middleware: look up a debate by :id and attach to request.
 * Returns 404 if not found.
 */
export function findDebate(req: Request, res: Response, next: NextFunction): void {
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
  (req as Request & { debate: Debate }).debate = debate;
  next();
}
