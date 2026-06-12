/**
 * API helper functions — thin wrappers around fetch.
 * Accessed globally as `appApi`.
 */
const appApi = {
  /** Fetch available models from an endpoint */
  async fetchModels(url, apiKey) {
    const res = await fetch(`/api/models?url=${encodeURIComponent(url)}${apiKey ? '&apiKey=' + encodeURIComponent(apiKey) : ''}`);
    return res;
  },

  /** Create a new debate */
  async createDebate(data) {
    return fetch('/api/debate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },

  /** Get debate state */
  async getDebate(id) {
    return fetch(`/api/debate/${id}`);
  },

  /** Delete a debate */
  async deleteDebate(id) {
    return fetch(`/api/debate/${id}`, { method: 'DELETE' });
  },

  /** Set up judge for a debate */
  async setJudge(id, data) {
    return fetch(`/api/debate/${id}/judge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },

  /** Start next debate turn (returns Response for SSE reading) */
  async nextTurn(id, speaker) {
    return fetch(`/api/debate/${id}/next-turn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ speaker }),
    });
  },

  /** Get judge verdict (returns Response for SSE reading) */
  async verdict(id) {
    return fetch(`/api/debate/${id}/verdict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
  },
};
