/**
 * Typed application state class.
 * Replaces global `appState` object with class-based encapsulation.
 */

import type { Speaker, DebatePhase, Message } from '../../shared/types/debate';
import type { ModelInfo } from '../../shared/types/api';
import type { ClientConfig } from '../config';

export interface AdvancedSettings {
  promptA: string;
  promptB: string;
  promptJudge: string;
  temperature: number | undefined;
  topP: number | undefined;
  topK: number | undefined;
  maxTokens: number | undefined;
  judgeTemperature: number | undefined;
  judgeTopP: number | undefined;
  judgeTopK: number | undefined;
  judgeMaxTokens: number | undefined;
}

export interface TTSState {
  enabled: boolean;
  speakerVoices: Record<string, string>;
  activeSpeaker: Speaker | 'judge' | null;
  paused: boolean;
  useHistoryPlayback: boolean;
  pendingHistoryPlayback: {
    messages: { speaker: Speaker; content: string }[];
    verdict: string | null;
  } | null;
}

export interface DebateData {
  statement: string;
  modelA: string;
  modelB: string;
  endpointA: string;
  endpointB: string;
  endpointJudge: string | null;
  messages: Message[];
  nextSpeaker: Speaker | null;
  countA: number;
  countB: number;
  phase: DebatePhase;
  judgeModel: string | null;
}

export class AppState {
  modelsA: ModelInfo[] = [];
  modelsB: ModelInfo[] = [];
  modelsJudge: ModelInfo[] = [];
  debateId: string | null = null;
  debateData: DebateData | null = null;
  currentSpeaker: Speaker | null = null;
  countA: number = 0;
  countB: number = 0;
  maxTurns: number = 3;
  isStreaming: boolean = false;
  autoJudge: boolean = false;

  // Internal tracking for active speaker during streaming
  _activeSpeaker: Speaker | null = null;

  // TTS state
  tts: TTSState = {
    enabled: false,
    speakerVoices: {},
    activeSpeaker: null,
    paused: false,
    useHistoryPlayback: false,
    pendingHistoryPlayback: null,
  };

  // Advanced settings
  advancedSettings: AdvancedSettings = {
    promptA: '',
    promptB: '',
    promptJudge: '',
    temperature: undefined,
    topP: undefined,
    topK: undefined,
    maxTokens: undefined,
    judgeTemperature: undefined,
    judgeTopP: undefined,
    judgeTopK: undefined,
    judgeMaxTokens: undefined,
  };

  // Session persistence state
  sessionRestored: boolean = false;

  /** Reset all state to initial values */
  reset(config: ClientConfig) {
    this.sessionRestored = false;
    this.debateId = null;
    this.debateData = null;
    this.currentSpeaker = null;
    this.countA = 0;
    this.countB = 0;
    this.isStreaming = false;
    this.autoJudge = false;
    this._activeSpeaker = null;

    this.tts = {
      enabled: false,
      speakerVoices: {},
      activeSpeaker: null,
      paused: false,
      useHistoryPlayback: false,
      pendingHistoryPlayback: null,
    };

    this.advancedSettings = {
      promptA: '',
      promptB: '',
      promptJudge: '',
      temperature: undefined,
      topP: undefined,
      topK: undefined,
      maxTokens: undefined,
      judgeTemperature: undefined,
      judgeTopP: undefined,
      judgeTopK: undefined,
      judgeMaxTokens: undefined,
    };

    this.modelsA = [];
    this.modelsB = [];
    this.modelsJudge = [];
    this.maxTurns = config.debate.maxTurns;
  }
}

// Singleton instance
export const appState = new AppState();
