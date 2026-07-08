/** Config loader — reads config.json, validates shape, exports typed singleton */

import * as fs from 'fs';
import * as path from 'path';
import { RootConfig } from '../types/config';

const CONFIG_PATH = path.resolve(process.cwd(), 'config.json');

let _config: RootConfig | null = null;

/** Overlay environment variables onto the kiosk config section */
function resolveKioskConfig(parsed: RootConfig): void {
  const env = process.env;
  const k = parsed.kiosk;

  k.enabled = env.JUBILAI_KIOSK_MODE === 'true';

  if (k.enabled) {
    k.endpointA = env.JUBILAI_KIOSK_ENDPOINT_A ?? k.endpointA;
    k.apiKeyA = env.JUBILAI_KIOSK_API_KEY_A ?? k.apiKeyA;
    k.modelA = env.JUBILAI_KIOSK_MODEL_A ?? k.modelA;
    k.endpointB = env.JUBILAI_KIOSK_ENDPOINT_B ?? k.endpointB;
    k.apiKeyB = env.JUBILAI_KIOSK_API_KEY_B ?? k.apiKeyB;
    k.modelB = env.JUBILAI_KIOSK_MODEL_B ?? k.modelB;
    k.endpointJudge = env.JUBILAI_KIOSK_ENDPOINT_JUDGE ?? k.endpointJudge;
    k.apiKeyJudge = env.JUBILAI_KIOSK_API_KEY_JUDGE ?? k.apiKeyJudge;
    k.modelJudge = env.JUBILAI_KIOSK_MODEL_JUDGE ?? k.modelJudge;
    k.promptA = env.JUBILAI_KIOSK_PROMPT_A ?? k.promptA;
    k.promptB = env.JUBILAI_KIOSK_PROMPT_B ?? k.promptB;
    k.promptJudge = env.JUBILAI_KIOSK_PROMPT_JUDGE ?? k.promptJudge;
    k.maxTurns = env.JUBILAI_KIOSK_MAX_TURNS ? parseInt(env.JUBILAI_KIOSK_MAX_TURNS, 10) : k.maxTurns;

    k.temperature = env.JUBILAI_KIOSK_TEMPERATURE ? parseFloat(env.JUBILAI_KIOSK_TEMPERATURE) : k.temperature;
    k.topP = env.JUBILAI_KIOSK_TOP_P ? parseFloat(env.JUBILAI_KIOSK_TOP_P) : k.topP;
    k.topK = env.JUBILAI_KIOSK_TOP_K ? parseInt(env.JUBILAI_KIOSK_TOP_K, 10) : k.topK;
    k.maxTokens = env.JUBILAI_KIOSK_MAX_TOKENS ? parseInt(env.JUBILAI_KIOSK_MAX_TOKENS, 10) : k.maxTokens;
    k.judgeTemperature = env.JUBILAI_KIOSK_JUDGE_TEMPERATURE ? parseFloat(env.JUBILAI_KIOSK_JUDGE_TEMPERATURE) : k.judgeTemperature;
    k.judgeTopP = env.JUBILAI_KIOSK_JUDGE_TOP_P ? parseFloat(env.JUBILAI_KIOSK_JUDGE_TOP_P) : k.judgeTopP;
    k.judgeTopK = env.JUBILAI_KIOSK_JUDGE_TOP_K ? parseInt(env.JUBILAI_KIOSK_JUDGE_TOP_K, 10) : k.judgeTopK;
    k.judgeMaxTokens = env.JUBILAI_KIOSK_JUDGE_MAX_TOKENS ? parseInt(env.JUBILAI_KIOSK_JUDGE_MAX_TOKENS, 10) : k.judgeMaxTokens;
  }
}

/**
 * Load config from config.json and validate required fields.
 * Returns the typed config singleton.
 */
function loadConfig(): RootConfig {
  if (_config) return _config;

  const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
  const parsed: RootConfig = JSON.parse(raw);

  // Resolve environment variable overrides for kiosk mode
  resolveKioskConfig(parsed);

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
    ['debate.retryTimeoutMs', () => typeof parsed.debate.retryTimeoutMs === 'number'],
    ['debate.startupTimeoutMs', () => typeof parsed.debate.startupTimeoutMs === 'number'],
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

  // Kiosk mode validation — required fields when enabled
  if (parsed.kiosk.enabled) {
    const kioskRequired: [string, () => boolean][] = [
      ['kiosk.endpointA', () => typeof parsed.kiosk.endpointA === 'string' && parsed.kiosk.endpointA.length > 0],
      ['kiosk.modelA', () => typeof parsed.kiosk.modelA === 'string' && parsed.kiosk.modelA.length > 0],
      ['kiosk.endpointB', () => typeof parsed.kiosk.endpointB === 'string' && parsed.kiosk.endpointB.length > 0],
      ['kiosk.modelB', () => typeof parsed.kiosk.modelB === 'string' && parsed.kiosk.modelB.length > 0],
      ['kiosk.endpointJudge', () => typeof parsed.kiosk.endpointJudge === 'string' && parsed.kiosk.endpointJudge.length > 0],
      ['kiosk.modelJudge', () => typeof parsed.kiosk.modelJudge === 'string' && parsed.kiosk.modelJudge.length > 0],
    ];
    for (const [field, check] of kioskRequired) {
      if (!check()) {
        throw new Error(`Config validation failed: kiosk mode enabled but '${field}' is missing or empty`);
      }
    }
  }

  _config = parsed;
  return _config;
}

export const config = loadConfig();
export default config;
