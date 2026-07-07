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

export interface PromptVersion {
  description: string;
  text: string;
}

export interface PromptsConfig {
  affirmative: string;
  negative: string;
  judge: string;
  /** Active prompt version IDs (e.g., "v1"). Resolved from prompts.json at runtime. */
  versionAffirmative?: string;
  versionNegative?: string;
  versionJudge?: string;
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

export interface DebateStorageConfig {
  defaultDirName: string;
  maxListCount: number;
}

export interface UIConfig {
  toastAutoDismissMs: number;
  phases: string[];
}

export interface KioskConfig {
  enabled: boolean;
  endpointA: string;
  apiKeyA: string;
  modelA: string;
  endpointB: string;
  apiKeyB: string;
  modelB: string;
  endpointJudge: string;
  apiKeyJudge: string;
  modelJudge: string;
  promptA: string;
  promptB: string;
  promptJudge: string;
  temperature: number | null;
  topP: number | null;
  topK: number | null;
  maxTokens: number | null;
  judgeTemperature: number | null;
  judgeTopP: number | null;
  judgeTopK: number | null;
  judgeMaxTokens: number | null;
  maxTurns: number | null;
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
  debateStorage: DebateStorageConfig;
  ui: UIConfig;
  kiosk: KioskConfig;
  mock: MockConfig;
}
