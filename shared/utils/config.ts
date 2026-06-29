/** Config loader — reads config.json, validates shape, exports typed singleton */

import * as fs from 'fs';
import * as path from 'path';
import { RootConfig } from '../types/config';

const CONFIG_PATH = path.resolve(process.cwd(), 'config.json');

let _config: RootConfig | null = null;

/**
 * Load config from config.json and validate required fields.
 * Returns the typed config singleton.
 */
function loadConfig(): RootConfig {
  if (_config) return _config;

  const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
  const parsed: RootConfig = JSON.parse(raw);

  // Runtime validation
  const required: [string, () => boolean][] = [
    ['app.name', () => typeof parsed.app.name === 'string'],
    ['app.realPort', () => typeof parsed.app.realPort === 'number'],
    ['app.mockPort', () => typeof parsed.app.mockPort === 'number'],
    ['app.host', () => typeof parsed.app.host === 'string'],
    ['debate.maxTurns', () => typeof parsed.debate.maxTurns === 'number'],
    ['debate.defaultApiKey', () => typeof parsed.debate.defaultApiKey === 'string'],
    ['debate.autoAdvanceDelayMs', () => typeof parsed.debate.autoAdvanceDelayMs === 'number'],
    ['debate.autoJudgeDelayMs', () => typeof parsed.debate.autoJudgeDelayMs === 'number'],
    ['debate.retryDelayMs', () => typeof parsed.debate.retryDelayMs === 'number'],
    ['debate.winnerPattern', () => typeof parsed.debate.winnerPattern === 'string'],
    ['llm.debaterDefaults.temperature', () => typeof parsed.llm.debaterDefaults.temperature === 'number' || parsed.llm.debaterDefaults.temperature === null],
    ['llm.judgeDefaults.temperature', () => typeof parsed.llm.judgeDefaults.temperature === 'number' || parsed.llm.judgeDefaults.temperature === null],
    ['prompts.affirmative', () => typeof parsed.prompts.affirmative === 'string'],
    ['prompts.negative', () => typeof parsed.prompts.negative === 'string'],
    ['prompts.judge', () => typeof parsed.prompts.judge === 'string'],
    ['tts.modelId', () => typeof parsed.tts.modelId === 'string'],
    ['tts.dtype', () => typeof parsed.tts.dtype === 'string'],
    ['tts.device', () => typeof parsed.tts.device === 'string'],
    ['tts.voicePool', () => Array.isArray(parsed.tts.voicePool)],
    ['session.dbName', () => typeof parsed.session.dbName === 'string'],
    ['session.dbVersion', () => typeof parsed.session.dbVersion === 'number'],
    ['ui.phases', () => Array.isArray(parsed.ui.phases)],
    ['debateStorage.defaultDirName', () => typeof parsed.debateStorage.defaultDirName === 'string'],
    ['debateStorage.maxListCount', () => typeof parsed.debateStorage.maxListCount === 'number'],
    ['mock.models', () => Array.isArray(parsed.mock.models)],
  ];

  for (const [field, check] of required) {
    if (!check()) {
      throw new Error(`Config validation failed: '${field}' is missing or invalid`);
    }
  }

  _config = parsed;
  return _config;
}

export const config = loadConfig();
export default config;
