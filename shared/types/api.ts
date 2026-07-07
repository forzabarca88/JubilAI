/** Request/response types for all API endpoints */

// Models endpoint
export interface ModelsQuery {
  url: string;
  apiKey?: string;
}

export interface ModelInfo {
  id: string;
}

export interface ModelsResponse {
  models: ModelInfo[];
}

export interface ModelsQueryParams {
  url: string;
  apiKey?: string;
}

// Debate endpoints
export interface DebateCreateBody {
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
  promptA?: string;
  promptB?: string;
  promptJudge?: string;
  temperature?: number;
  topP?: number;
  topK?: number;
  maxTokens?: number;
  judgeTemperature?: number;
  judgeTopP?: number;
  judgeTopK?: number;
  judgeMaxTokens?: number;
}

export interface DebateCreateResponse {
  id: string;
  phase: string;
  nextSpeaker: string | null;
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
  messages: DebateMessage[];
  nextSpeaker: string | null;
  countA: number;
  countB: number;
  phase: string;
  judgeModel: string | null;
  verdict: string | null;
  autoJudge: boolean;
}

export interface DebateMessage {
  speaker: string;
  model: string;
  content: string;
  timestamp: number;
}

export interface DeleteDebateResponse {
  success: boolean;
}

export interface JudgeSetupBody {
  judgeModel: string;
  endpointJudge: string;
  apiKeyJudge?: string;
}

export interface JudgeSetupResponse {
  phase: string;
  judgeModel: string;
}

export interface TurnRequest {
  speaker: string;
}

export interface VerdictRequest {
  // empty body
}

// Error response
export interface ErrorResponse {
  error: string;
  detail?: string;
}

// Generic success response
export interface SuccessResponse {
  success: boolean;
}

// History (debate list) types
export interface SavedDebateSummary {
  id: string;
  statement: string;
  modelA: string;
  modelB: string;
  phase: string;
  verdict: string | null;
  winner: string | null;
  timestamp: number;
}

export interface DebatesListResponse {
  debates: SavedDebateSummary[];
}

// Pre-flight validation types
export interface ValidateRequest {
  url: string;
  apiKey?: string;
  model?: string;
}

export interface ValidateResponse {
  valid: boolean;
  error?: string;
  models: string[];
  model?: string;
}
