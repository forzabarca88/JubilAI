const OpenAI = require('openai');

/**
 * Create an OpenAI-compatible client for a given URL.
 * @param {string} apiUrl - Base URL of the API endpoint
 * @param {string} [apiKey] - API key (defaults to 'ollama')
 * @returns {OpenAI} Configured OpenAI client
 */
function createClient(apiUrl, apiKey) {
  const baseURL = apiUrl.replace(/\/+$/, '');
  return new OpenAI({
    baseURL: baseURL + '/v1',
    apiKey: apiKey || 'ollama',
  });
}

module.exports = { createClient };
