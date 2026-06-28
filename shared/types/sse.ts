/** SSE event types for streaming endpoints */

export interface SSEChunkEvent {
  type: 'chunk';
  content: string;
}

export interface SSDoneEvent {
  type: 'done';
  debateComplete?: boolean;
  nextSpeaker?: string | null;
  winner?: string | null;
  verdict?: string;
  countA?: number;
  countB?: number;
  autoJudge?: boolean;
  error?: string;
}

export interface SSEErrorEvent {
  type: 'error';
  error: string;
}

export type SSEEvent = SSEChunkEvent | SSDoneEvent | SSEErrorEvent;
