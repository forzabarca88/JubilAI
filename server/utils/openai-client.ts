/** Typed OpenAI client factory + retry wrapper */

import OpenAI from 'openai';
import config from '../../shared/utils/config';

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create an OpenAI-compatible client for a given URL.
 * @param apiUrl - Base URL of the API endpoint
 * @param apiKey - API key (defaults to config value)
 * @returns Configured OpenAI client
 */
export function createClient(apiUrl: string, apiKey?: string): OpenAI {
  const baseURL = apiUrl.replace(/\/+$/, '');
  return new OpenAI({
    baseURL: baseURL + '/v1',
    apiKey: apiKey || config.debate.defaultApiKey,
  });
}

/**
 * Execute an async operation with one retry after a delay.
 * @param fn - Async function to execute
 * @returns Result of the function
 * @throws Error from the retry attempt if both attempts fail
 */
export async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.warn('Request failed, retrying in 5s...', (err as Error).message);
    await sleep(config.debate.retryDelayMs);
    return await fn();
  }
}
