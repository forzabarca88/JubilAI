/** Types for debate entities */

export type Speaker = 'A' | 'B';

export type DebatePhase = 'debating' | 'awaiting-judge' | 'judging' | 'complete';

export interface Message {
  speaker: Speaker;
  model: string;
  content: string;
  timestamp: number;
}

export interface LLMParams {
  temperature: number | null;
  topP: number | null;
  topK: number | null;
  maxTokens: number | null;
}

export interface JudgeLLMParams {
  judgeTemperature: number | null;
  judgeTopP: number | null;
  judgeTopK: number | null;
  judgeMaxTokens: number | null;
}

export interface Debate {
  id: string;
  statement: string;
  modelA: string;
  modelB: string;
  endpointA: string;
  apiKeyA: string;
  endpointB: string;
  apiKeyB: string;
  endpointJudge: string | null;
  apiKeyJudge: string | null;
  messages: Message[];
  nextSpeaker: Speaker | null;
  countA: number;
  countB: number;
  maxTurns: number;
  phase: DebatePhase;
  judgeModel: string | null;
  verdict: string | null;
  autoJudge: boolean;
  // Custom prompts (empty strings mean use defaults)
  customPromptA: string;
  customPromptB: string;
  customPromptJudge: string;
  // LLM parameters (null means use built-in defaults)
  temperature: number | null;
  topP: number | null;
  topK: number | null;
  maxTokens: number | null;
  // Judge-specific LLM parameters (null means use built-in judge defaults)
  judgeTemperature: number | null;
  judgeTopP: number | null;
  judgeTopK: number | null;
  judgeMaxTokens: number | null;
}

export interface DebateCreateRequest {
  statement: string;
  modelA: string;
  modelB: string;
  endpointA: string;
  apiKeyA?: string;
  endpointB: string;
  apiKeyB?: string;
  judgeModel?: string;
  endpointJudge?: string;
  apiKeyJudge?: string;
  // Optional: custom prompts
  promptA?: string;
  promptB?: string;
  promptJudge?: string;
  // Optional: LLM parameters for debaters
  temperature?: number;
  topP?: number;
  topK?: number;
  maxTokens?: number;
  // Optional: LLM parameters for judge
  judgeTemperature?: number;
  judgeTopP?: number;
  judgeTopK?: number;
  judgeMaxTokens?: number;
}

export interface DebateResponse {
  id: string;
  phase: DebatePhase;
  nextSpeaker: Speaker | null;
  modelA: string;
  modelB: string;
  statement: string;
  judgeModel: string | null;
  autoJudge: boolean;
}

export interface DebateStateResponse {
  id: string;
  statement: string;
  modelA: string;
  modelB: string;
  messages: Message[];
  nextSpeaker: Speaker | null;
  countA: number;
  countB: number;
  phase: DebatePhase;
  judgeModel: string | null;
  verdict: string | null;
  autoJudge: boolean;
}

export interface JudgeSetupRequest {
  judgeModel: string;
  endpointJudge: string;
  apiKeyJudge?: string;
}

export interface JudgeSetupResponse {
  phase: DebatePhase;
  judgeModel: string;
}
