/**
 * Typed API client class.
 * Replaces global `appApi` object.
 */

import type {
  ModelsQueryParams,
  ModelsResponse,
  DebateCreateBody,
  DebateCreateResponse,
  DebateStateResponse,
  DeleteDebateResponse,
  JudgeSetupBody,
  JudgeSetupResponse,
  TurnRequest,
  VerdictRequest,
  ErrorResponse,
  SavedDebateSummary,
  DebatesListResponse,
  ValidateRequest,
  ValidateResponse,
} from '../../shared/types/api';
import type { SSEEvent } from '../../shared/types/sse';

export class ApiClient {
  /** Fetch available models from an endpoint */
  async fetchModels(url: string, apiKey?: string): Promise<Response> {
    const params = new URLSearchParams({ url });
    if (apiKey) params.set('apiKey', apiKey);
    return fetch(`/api/models?${params}`);
  }

  /** Create a new debate */
  async createDebate(data: DebateCreateBody): Promise<Response> {
    return fetch('/api/debate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  }

  /** Get debate state */
  async getDebate(id: string): Promise<Response> {
    return fetch(`/api/debate/${id}`);
  }

  /** Delete a debate */
  async deleteDebate(id: string): Promise<Response> {
    return fetch(`/api/debate/${id}`, { method: 'DELETE' });
  }

  /** Set up judge for a debate */
  async setJudge(id: string, data: JudgeSetupBody): Promise<Response> {
    return fetch(`/api/debate/${id}/judge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  }

  /** Start next debate turn (returns Response for SSE reading) */
  async nextTurn(id: string, speaker: string): Promise<Response> {
    return fetch(`/api/debate/${id}/next-turn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ speaker }),
    });
  }

  /** Get judge verdict (returns Response for SSE reading) */
  async verdict(id: string): Promise<Response> {
    return fetch(`/api/debate/${id}/verdict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
  }

  /** List all persisted debates */
  async listDebates(): Promise<Response> {
    return fetch('/api/debates');
  }

  /** Get a single persisted debate */
  async getDebateHistory(id: string): Promise<Response> {
    return fetch(`/api/debates/${id}`);
  }

  /** Delete a persisted debate */
  async deleteDebateHistory(id: string): Promise<Response> {
    return fetch(`/api/debates/${id}`, { method: 'DELETE' });
  }

  /** Validate an endpoint/API key/model combination before starting a debate */
  async validate(data: ValidateRequest): Promise<Response> {
    return fetch('/api/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  }

  /** Parse JSON response, throwing on non-OK */
  async json<T>(res: Response): Promise<T> {
    const data = await res.json();
    if (!res.ok) {
      const err = data as ErrorResponse;
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return data as T;
  }
}

export const apiClient = new ApiClient();
