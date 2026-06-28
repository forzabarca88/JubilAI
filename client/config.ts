/**
 * Client-side config loader.
 * Fetches config.json from the server at runtime and exposes typed config.
 */

import type { AppConfig, DebateConfig, LLMConfig, TTSConfig, SessionConfig, UIConfig, MockConfig } from '../shared/types/config';

export interface ClientConfig {
  app: AppConfig;
  debate: DebateConfig;
  llm: LLMConfig;
  prompts: {
    affirmative: string;
    negative: string;
    judge: string;
  };
  tts: TTSConfig;
  session: SessionConfig;
  ui: UIConfig;
  mock: MockConfig;
}

let _config: ClientConfig | null = null;
let _loadingPromise: Promise<ClientConfig> | null = null;

/**
 * Load config from the server. Cached after first load.
 */
export async function loadConfig(): Promise<ClientConfig> {
  if (_config) return _config;
  if (_loadingPromise) return _loadingPromise;

  _loadingPromise = (async () => {
    try {
      const res = await fetch('/config.json');
      if (!res.ok) throw new Error(`Failed to load config: ${res.status}`);
      const data = await res.json();
      _config = data as ClientConfig;
      return _config;
    } finally {
      _loadingPromise = null;
    }
  })();

  return _loadingPromise;
}

/**
 * Get config (synchronous). Must be called after loadConfig() resolves.
 */
export function getConfig(): ClientConfig {
  if (!_config) throw new Error('Config not loaded yet. Call loadConfig() first.');
  return _config;
}
