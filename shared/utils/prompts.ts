/**
 * Prompt definitions — reads from config, provides fallback defaults.
 * Shared between real server (`server/`) and mock server (`mock/`).
 */

import config from './config';

/**
 * Get the affirmative debater system prompt.
 * Uses custom prompt from debate config if available, otherwise uses config default.
 */
export function getAffirmativePrompt(customPrompt?: string): string {
  return customPrompt && customPrompt.length > 0 ? customPrompt : config.prompts.affirmative;
}

/**
 * Get the negative debater system prompt.
 * Uses custom prompt from debate config if available, otherwise uses config default.
 */
export function getNegativePrompt(customPrompt?: string): string {
  return customPrompt && customPrompt.length > 0 ? customPrompt : config.prompts.negative;
}

/**
 * Get the judge system prompt.
 * Uses custom prompt from debate config if available, otherwise uses config default.
 */
export function getJudgePrompt(customPrompt?: string): string {
  return customPrompt && customPrompt.length > 0 ? customPrompt : config.prompts.judge;
}

/**
 * Get the system prompt for a given speaker.
 * Speaker 'A' → affirmative, 'B' → negative.
 */
export function getSpeakerPrompt(speaker: 'A' | 'B', customPrompt?: string): string {
  return speaker === 'A'
    ? getAffirmativePrompt(customPrompt)
    : getNegativePrompt(customPrompt);
}
