/**
 * Real-time Text-to-Speech Manager using kokoro-js via Web Worker (typed).
 *
 * Architecture:
 *   Main thread: text buffering, sentence splitting, WAV decode (AudioContext.decodeAudioData), audio playback (AudioContext)
 *   Web Worker: Kokoro model loading, phonemization, ONNX/WASM or WebGPU inference (heavy computation)
 *
 * Communication: postMessage with ArrayBuffer transfer (zero-copy)
 *
 * Worker uses rawAudio.toWav() to produce IEEE-float WAV format. Main thread decodes
 * via AudioContext.decodeAudioData() and plays sequentially through a queue.
 * Different speakers (The Affirmative, The Negative, Judge) get random distinct voices.
 */

import { getConfig } from '../config';
import type { Speaker } from '../../shared/types/debate';
import type { AppState } from '../state/app-state';
import { startTTSStatusPoll, stopTTSStatusPoll } from '../dom/tts-ui';

interface GenerationItem {
  text: string;
  speaker: Speaker | 'judge';
}

interface WorkerMessage {
  type: string;
  id?: number;
  text?: string;
  voice?: string;
  modelId?: string;
  dtype?: string;
  device?: string;
  wav?: ArrayBuffer;
  sampleRate?: number;
  message?: string;
}

type SpeakerKey = Speaker | 'judge';

export class RealtimeTTSManager {
  worker: Worker | null = null;
  audioContext: AudioContext | null = null;
  isInitialized: boolean = false;

  // Configuration
  useStreaming: boolean = false;

  // Audio queue for streaming playback
  audioQueue: AudioBuffer[] = [];
  currentSource: AudioBufferSourceNode | null = null;
  private _isPlaying: boolean = false;
  private _isPaused: boolean = false;

  // Text buffering for sentence segmentation
  sentenceBuffer: string = '';

  // Generation request queue — sent to worker serially
  private _pendingGenerations: GenerationItem[] = [];
  private _workerBusy: boolean = false;

  // Tracking the active request to discard stale chunks on stop/skip
  private _msgId: number = 0;
  private _activeId: number | null = null;

  // Voice assignments: speaker key → Kokoro voice ID
  speakerVoices: Record<string, string> = {};

  constructor() {}

  private VOICE_POOL: string[] = [];

  /** Create worker and load Kokoro model */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    console.log('[TTS] Initializing Kokoro model in worker...');

    try {
      const cfg = getConfig().tts;
      if (this.VOICE_POOL.length === 0) {
        this.VOICE_POOL = [...cfg.voicePool];
      }

      this.worker = new Worker('/dist/js/tts-worker.js', { type: 'module' });
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) throw new Error('AudioContext not supported');
      this.audioContext = new AudioCtx();

      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume().catch(() => {
          console.warn('[TTS] AudioContext could not be resumed. Waiting for user gesture.');
        });
      }

      this.worker.onmessage = (e: MessageEvent<WorkerMessage>) => this._handleWorkerMessage(e);
      this.worker.onerror = (err: ErrorEvent) => console.error('[TTS] Worker error:', err);

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          this.worker?.removeEventListener('message', onInit);
          reject(new Error('TTS initialization timed out after 120s'));
        }, cfg.workerTimeoutMs);

        const onInit = (e: MessageEvent<WorkerMessage>) => {
          if (e.data.type === 'ready') {
            this.worker?.removeEventListener('message', onInit);
            clearTimeout(timeout);
            this.isInitialized = true;
            console.log(`[TTS] Kokoro model loaded successfully using: ${e.data.device} (${e.data.dtype})`);
            resolve();
          } else if (e.data.type === 'initError') {
            this.worker?.removeEventListener('message', onInit);
            clearTimeout(timeout);
            reject(new Error('TTS initialization failed: ' + e.data.message));
          }
        };

        this.worker!.addEventListener('message', onInit);
        this.worker!.postMessage({
          type: 'init',
          modelId: cfg.modelId,
          dtype: cfg.dtype,
          device: cfg.device,
        });
      });
    } catch (error) {
      console.error('[TTS] Initialization failed:', error);
      throw error;
    }
  }

  _handleWorkerMessage(e: MessageEvent<WorkerMessage>) {
    const data = e.data;

    if (data.id && data.id !== this._activeId) {
      return;
    }

    switch (data.type) {
      case 'audio-chunk':
        this._wavToAudioBufferAndPlay(data.wav!);
        break;
      case 'audio-done':
        this._workerBusy = false;
        this._processGenerationQueue();
        break;
      case 'audio':
        this._wavToAudioBufferAndPlay(data.wav!);
        this._workerBusy = false;
        this._processGenerationQueue();
        break;
      case 'error':
        console.error('[TTS] Worker generation error:', data.message);
        this._workerBusy = false;
        this._processGenerationQueue();
        break;
    }
  }

  /** Pick 3 random distinct voices from the pool */
  pickRandomVoices(): Record<string, string> {
    const pool = [...this.VOICE_POOL];
    const shuffled = pool.sort(() => Math.random() - 0.5);
    return {
      A: shuffled[0],
      B: shuffled[1],
      judge: shuffled[2],
    };
  }

  assignVoices(voices: Record<string, string>) {
    this.speakerVoices = { ...voices };
    console.log('[TTS] Voice assignments:', voices);
  }

  /** Feed a text chunk to the TTS pipeline */
  feedTextChunk(chunk: string, speaker: Speaker | 'judge') {
    if (!this.isInitialized) return;
    if (this._isPaused) return;

    this.sentenceBuffer += chunk;

    const sentenceRegex = /([^.!?\n]+[.!?\n]+)/g;
    const sentences = this.sentenceBuffer.match(sentenceRegex);

    if (sentences) {
      for (const sentence of sentences) {
        if (sentence.trim().length > 0) {
          this._queueAudioGeneration(sentence, speaker);
        }
      }

      const lastSent = sentences[sentences.length - 1];
      const searchStart = Math.max(0, this.sentenceBuffer.length - lastSent.length - 100);
      const lastIdx = this.sentenceBuffer.indexOf(lastSent, searchStart);
      if (lastIdx === -1) {
        this.sentenceBuffer = '';
      } else {
        this.sentenceBuffer = this.sentenceBuffer.substring(lastIdx + lastSent.length);
      }
    }

    const cfg = getConfig().tts;
    if (this.sentenceBuffer.length > cfg.sentenceBufferCap) {
      this.sentenceBuffer = this.sentenceBuffer.substring(this.sentenceBuffer.length - 500);
    }
  }

  _queueAudioGeneration(text: string, speaker: Speaker | 'judge') {
    const cleanText = text
      .replace(/<[^>]*>/g, '')
      .replace(/[*_`#\[\]>~]/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .trim();

    if (cleanText.length === 0) return;

    this._pendingGenerations.push({ text: cleanText, speaker });

    if (!this._workerBusy) {
      this._processGenerationQueue();
    }
  }

  _processGenerationQueue() {
    if (this._workerBusy || this._pendingGenerations.length === 0) return;

    this._workerBusy = true;
    const item = this._pendingGenerations.shift()!;
    const voiceId = this.speakerVoices[item.speaker] || this.VOICE_POOL[0];

    this._activeId = ++this._msgId;

    console.log('[TTS] Dispatching task:', item.text.substring(0, 60), 'voice:', voiceId);

    this.worker!.postMessage({
      type: this.useStreaming ? 'stream-generate' : 'generate',
      id: this._activeId,
      text: item.text,
      voice: voiceId,
    });
  }

  async _wavToAudioBufferAndPlay(wavData: ArrayBuffer) {
    try {
      if (!this.audioContext) return;
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      const audioBuffer = await this.audioContext.decodeAudioData(wavData);
      this.audioQueue.push(audioBuffer);

      if (!this._isPlaying) {
        this._playNextInQueue();
      }
    } catch (err) {
      console.error('[TTS] WAV decode failed:', (err as Error).message || String(err));
    }
  }

  _playNextInQueue() {
    if (this._isPaused) return;
    if (this.audioQueue.length === 0) {
      this._isPlaying = false;
      this.currentSource = null;
      return;
    }

    const audioBuffer = this.audioQueue.shift()!;
    this._isPlaying = true;

    if (!this.audioContext) return;
    this.currentSource = this.audioContext.createBufferSource();
    this.currentSource.buffer = audioBuffer;
    this.currentSource.connect(this.audioContext.destination);

    this.currentSource.onended = () => {
      this.currentSource = null;
      this._playNextInQueue();
    };

    this.currentSource.start(0);
  }

  async finishStreaming(speaker: Speaker | 'judge') {
    if (this.sentenceBuffer.trim().length > 0) {
      this._queueAudioGeneration(this.sentenceBuffer, speaker);
      this.sentenceBuffer = '';
    }
    await this._waitForGenerationQueue();
  }

  _waitForGenerationQueue(): Promise<void> {
    return new Promise((resolve) => {
      const check = () => {
        if (this._pendingGenerations.length === 0 && !this._workerBusy) {
          resolve();
        } else {
          setTimeout(check, 50);
        }
      };
      check();
    });
  }

  stopAudio() {
    this._activeId = null;

    if (this.currentSource) {
      try {
        this.currentSource.stop();
      } catch {
        /* already stopped */
      }
      this.currentSource = null;
    }

    this.audioQueue = [];
    this._pendingGenerations = [];
    this._workerBusy = false;
    this._isPlaying = false;
    this._isPaused = false;
    this.sentenceBuffer = '';
  }

  pauseAudio() {
    this._isPaused = true;

    if (this.currentSource) {
      try {
        this.currentSource.stop();
      } catch {
        /* already stopped */
      }
      this.currentSource = null;
    }

    this._isPlaying = false;
  }

  async resumeAudio(): Promise<void> {
    if (!this._isPaused) return;
    this._isPaused = false;

    if (this.audioQueue.length > 0) {
      this._playNextInQueue();
    }

    if (!this._workerBusy && this._pendingGenerations.length > 0) {
      this._processGenerationQueue();
    }
  }

  destroy() {
    if (this.worker) {
      this.worker.postMessage({ type: 'stop' });
      this.worker.terminate();
      this.worker = null;
    }
    this.isInitialized = false;
    this.stopAudio();
  }

  get isPlaying(): boolean {
    return this._isPlaying;
  }

  get isPaused(): boolean {
    return this._isPaused;
  }

  hasQueuedAudio(): boolean {
    return this.audioQueue.length > 0;
  }

  get pendingGenerationsCount(): number {
    return this._pendingGenerations.length;
  }
}

export const ttsManager = new RealtimeTTSManager();

// Helper functions for UI integration
export async function startDebateAudio(state: AppState) {
  await ttsManager.initialize();
  const voices = ttsManager.pickRandomVoices();
  ttsManager.assignVoices(voices);
  state.tts.speakerVoices = voices;
  state.tts.enabled = true;
}

export function stopDebateAudio(state: AppState) {
  ttsManager.stopAudio();
  state.tts.paused = false;
}

export function pauseDebateAudio(state: AppState) {
  ttsManager.pauseAudio();
  state.tts.paused = true;
}

export async function resumeDebateAudio(state: AppState) {
  await ttsManager.resumeAudio();
  state.tts.paused = false;
}

export function feedAudioText(text: string, speaker: Speaker | 'judge') {
  if (ttsManager.isInitialized) {
    ttsManager.feedTextChunk(text, speaker);
  }
}

export async function finishDebateAudio(speaker: Speaker | 'judge') {
  if (ttsManager.isInitialized) {
    await ttsManager.finishStreaming(speaker);
  }
}

/**
 * Play TTS for a viewed historical debate.
 * Feeds all messages (A/B) and the verdict text to the generation queue.
 * Text is already complete, so we skip sentence buffering and feed directly.
 */
export async function playHistoryAudio(
  messages: { speaker: string; content: string }[],
  verdict: string | null,
  state: AppState
): Promise<void> {
  if (!state.tts.enabled) return;

  // Initialize TTS worker if not already loaded
  if (!ttsManager.isInitialized) {
    try {
      await ttsManager.initialize();
    } catch (err) {
      console.warn('[TTS] Init failed for history playback:', (err as Error).message);
      state.tts.enabled = false;
      return;
    }
  }

  // Pick random voices (original voices not stored)
  const voices = ttsManager.pickRandomVoices();
  ttsManager.assignVoices(voices);
  state.tts.speakerVoices = voices;
  state.tts.useHistoryPlayback = true;

  // Stop any existing audio
  ttsManager.stopAudio();

  // Feed all debate messages in order
  for (const msg of messages) {
    const speaker: Speaker | 'judge' = msg.speaker as Speaker;
    // Feed complete text directly (no sentence buffering for history)
    ttsManager._queueAudioGeneration(msg.content, speaker);
  }

  // Feed verdict text with judge voice
  if (verdict) {
    ttsManager._queueAudioGeneration(verdict, 'judge');
  }

  // Process the queue
  if (!ttsManager._workerBusy && ttsManager._pendingGenerations.length > 0) {
    ttsManager._processGenerationQueue();
  }

  // Start status polling so UI reflects playback state
  startTTSStatusPoll(state);

  console.log('[TTS] History playback started:', messages.length, 'messages + verdict');
}

/**
 * Stop history playback and reset to normal mode.
 */
export function stopHistoryAudio(state: AppState): void {
  ttsManager.stopAudio();
  state.tts.useHistoryPlayback = false;
  state.tts.paused = false;
  state.tts.pendingHistoryPlayback = null;
  stopTTSStatusPoll();
}
