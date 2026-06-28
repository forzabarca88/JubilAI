/** TypeScript interface matching config.json structure */

export interface AppConfig {
  name: string;
  realPort: number;
  mockPort: number;
  host: string;
}

export interface DebateConfig {
  maxTurns: number;
  defaultApiKey: string;
  autoAdvanceDelayMs: number;
  autoJudgeDelayMs: number;
  retryDelayMs: number;
  winnerPattern: string;
}

export interface LLMDefaults {
  temperature: number | null;
  topP: number | null;
  topK: number | null;
  maxTokens: number | null;
}

export interface LLMConfig {
  debaterDefaults: LLMDefaults;
  judgeDefaults: LLMDefaults;
}

export interface PromptsConfig {
  affirmative: string;
  negative: string;
  judge: string;
}

export interface TTSConfig {
  modelId: string;
  dtype: string;
  device: string;
  workerTimeoutMs: number;
  sentenceBufferCap: number;
  statusPollIntervalMs: number;
  voicePool: string[];
}

export interface SessionConfig {
  dbName: string;
  dbVersion: number;
  dbStore: string;
  keyRecordId: string;
  localStorageKey: string;
  localStorageKeyPlain: string;
}

export interface UIConfig {
  toastAutoDismissMs: number;
  phases: string[];
}

export interface MockConfig {
  streamChunkSize: number;
  streamDelayMs: number;
  modelFetchDelayMs: number;
  turnGenerationDelayMs: number;
  verdictGenerationDelayMs: number;
  models: string[];
}

export interface RootConfig {
  app: AppConfig;
  debate: DebateConfig;
  llm: LLMConfig;
  prompts: PromptsConfig;
  tts: TTSConfig;
  session: SessionConfig;
  ui: UIConfig;
  mock: MockConfig;
}
