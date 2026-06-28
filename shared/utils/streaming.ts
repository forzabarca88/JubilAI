/**
 * Unified SSE helpers for streaming endpoints.
 * Shared between real server (`server/`) and mock server (`mock/`).
 */

import { Response } from 'express';
import { SSEChunkEvent, SSDoneEvent, SSEErrorEvent } from '../types/sse';

/**
 * Set up Server-Sent Events (SSE) response headers.
 */
export function setupSSE(res: Response): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });
}

/**
 * Send a streaming text chunk via SSE.
 */
export function sendChunk(res: Response, content: string): void {
  const event: SSEChunkEvent = { type: 'chunk', content };
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

/**
 * Send a done signal via SSE with additional data.
 */
export function sendDone(res: Response, data: Omit<SSDoneEvent, 'type'> = {}): void {
  const event: SSDoneEvent = { type: 'done', ...data };
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

/**
 * Send an error signal via SSE.
 */
export function sendError(res: Response, error: string): void {
  const event: SSEErrorEvent = { type: 'error', error };
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

/**
 * Stream text in chunks with a delay between each chunk.
 * Used by the mock server to simulate generation latency.
 */
export function streamText(
  res: Response,
  text: string,
  chunkSize: number,
  delay: number
): Promise<void> {
  return new Promise((resolve) => {
    let i = 0;
    const sendChunk_ = (): void => {
      if (i >= text.length) {
        resolve();
        return;
      }
      const chunk = text.slice(i, i + chunkSize);
      sendChunk(res, chunk);
      i += chunkSize;
      setTimeout(sendChunk_, delay);
    };
    sendChunk_();
  });
}
