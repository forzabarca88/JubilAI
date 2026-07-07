/**
 * Prompt definitions — reads from prompts.json for versioned prompts,
 * falls back to config.json defaults.
 *
 * Shared between real server (`server/`) and mock server (`mock/`).
 *
 * To add a new prompt version:
 *   1. Add an entry to shared/prompts/prompts.json (e.g., "v2")
 *   2. Update config.json: set prompts.versionAffirmative to "v2"
 *   3. No rebuild needed — prompts are loaded at runtime
 */

import * as fs from 'fs';
import * as path from 'path';
import config from './config';

// ── Prompt registry (loaded from prompts.json) ────────────────────

interface PromptVersion {
  description: string;
  text: string;
}

interface PromptRegistry {
  affirmative: Record<string, PromptVersion>;
  negative: Record<string, PromptVersion>;
  judge: Record<string, PromptVersion>;
}

const PROMPTS_JSON_PATH = path.resolve(__dirname, '../prompts/prompts.json');

let _registry: PromptRegistry | null = null;

function loadPromptRegistry(): PromptRegistry {
  if (_registry) return _registry;

  try {
    const raw = fs.readFileSync(PROMPTS_JSON_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as PromptRegistry;
    _registry = parsed;
    console.log(`[Prompts] Loaded registry from prompts.json`);
  } catch (err) {
    console.warn(`[Prompts] Could not load prompts.json: ${(err as Error).message}. Using config defaults.`);
    _registry = { affirmative: {}, negative: {}, judge: {} };
  }

  return _registry;
}

/**
 * Resolve a prompt by role and version.
 * If version is specified and exists in registry, use it.
 * Otherwise fall back to config.json default.
 */
function resolveDefaultPrompt(role: 'affirmative' | 'negative' | 'judge', version?: string): string {
  if (version) {
    const registry = loadPromptRegistry();
    const versionData = registry[role]?.[version];
    if (versionData) {
      return versionData.text;
    }
    console.warn(`[Prompts] Version "${version}" not found for "${role}", using config default.`);
  }

  // Fallback to config.json
  return config.prompts[role];
}

// ── Public API ────────────────────────────────────────────────────

/**
 * Get the affirmative debater system prompt.
 * Uses custom prompt from debate config if available, otherwise resolves
 * from prompts.json version or config.json default.
 */
export function getAffirmativePrompt(customPrompt?: string): string {
  if (customPrompt && customPrompt.length > 0) return customPrompt;
  return resolveDefaultPrompt('affirmative', config.prompts.versionAffirmative);
}

/**
 * Get the negative debater system prompt.
 * Uses custom prompt from debate config if available, otherwise resolves
 * from prompts.json version or config.json default.
 */
export function getNegativePrompt(customPrompt?: string): string {
  if (customPrompt && customPrompt.length > 0) return customPrompt;
  return resolveDefaultPrompt('negative', config.prompts.versionNegative);
}

/**
 * Get the judge system prompt.
 * Uses custom prompt from debate config if available, otherwise resolves
 * from prompts.json version or config.json default.
 */
export function getJudgePrompt(customPrompt?: string): string {
  if (customPrompt && customPrompt.length > 0) return customPrompt;
  return resolveDefaultPrompt('judge', config.prompts.versionJudge);
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

/**
 * Get the list of available prompt versions for a role.
 * Useful for UI to show available versions.
 */
export function getAvailableVersions(role: 'affirmative' | 'negative' | 'judge'): string[] {
  const registry = loadPromptRegistry();
  return Object.keys(registry[role] || {});
}

/**
 * Get prompt metadata (description) for a specific version.
 */
export function getPromptInfo(role: 'affirmative' | 'negative' | 'judge', version: string): { description: string } | null {
  const registry = loadPromptRegistry();
  return registry[role]?.[version] ?? null;
}
