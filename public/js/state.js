/**
 * Application state — shared across all frontend modules.
 * Accessed globally as `appState`.
 */
const appState = {
  modelsA: [],
  modelsB: [],
  modelsJudge: [],
  debateId: null,
  debateData: null,
  currentSpeaker: null,
  countA: 0,
  countB: 0,
  maxTurns: 3,
  isStreaming: false,
  autoJudge: false,

  // TTS state
  ttsEnabled: false,
  ttsSpeakerVoices: {},
  ttsActiveSpeaker: null,
  ttsPaused: false,

  // Advanced settings (prompts + LLM params)
  advancedSettings: {
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
  },

  // Session persistence state
  sessionRestored: false,
};
