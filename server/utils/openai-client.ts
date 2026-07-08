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
 * Wrap an async operation with a timeout.
 * @param ms - Timeout in milliseconds
 * @param fn - Async function to execute
 * @returns Result of the function
 * @throws TimeoutError if the operation exceeds the given time
 */
export function withTimeout<T>(ms: number, fn: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Timeout after ${ms}ms`));
    }, ms);
  });

  return Promise.race([fn(), timeoutPromise]).then(
    (result) => {
      if (timer) clearTimeout(timer);
      return result;
    },
    (err) => {
      if (timer) clearTimeout(timer);
      throw err;
    }
  );
}

/**
 * Execute an async operation with one retry after a delay.
 * Each attempt is wrapped with a timeout to prevent indefinite hangs.
 * @param fn - Async function to execute
 * @returns Result of the function
 * @throws Error from the retry attempt if both attempts fail
 */
export async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  const timeoutMs = config.debate.retryTimeoutMs;
  try {
    console.log(`[withRetry] Attempt 1/2 (timeout: ${timeoutMs}ms)`);
    return await withTimeout(timeoutMs, fn);
  } catch (err) {
    console.warn(`[withRetry] Attempt 1 failed: ${(err as Error).message}`);
    console.log(`[withRetry] Retrying in ${config.debate.retryDelayMs}ms...`);
    await sleep(config.debate.retryDelayMs);
    console.log(`[withRetry] Attempt 2/2 (timeout: ${timeoutMs}ms)`);
    return await withTimeout(timeoutMs, fn);
  }
}
