const OpenAI = require('openai');

const RETRY_DELAY_MS = 5000;

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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

/**
 * Execute an async operation with one retry after a delay.
 * @param {Function} fn - Async function to execute
 * @returns {Promise<*>} Result of the function
 * @throws {Error} Error from the retry attempt if both attempts fail
 */
async function withRetry(fn) {
  try {
    return await fn();
  } catch (err) {
    console.warn('Request failed, retrying in 5s...', err.message);
    await sleep(RETRY_DELAY_MS);
    return await fn();
  }
}

module.exports = { createClient, withRetry };
