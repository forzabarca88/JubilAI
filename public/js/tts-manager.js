/**
 * Real-time Text-to-Speech Manager using kokoro-js via Web Worker
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
 *
 * Streaming: Uses kokoro.stream() for reduced Time-To-First-Audio (TTFA).
 * Each sentence triggers a stream-generate; audio-chunk events arrive progressively.
 */
class RealtimeTTSManager {
  constructor() {
    this.worker = null;
    this.audioContext = null;
    this.isInitialized = false;

    // Configuration
    this.useStreaming = false; // Avoid kokoro-js stream() string hang bug; pipelined generate() is fast enough (~200ms/sentence)

    // Audio queue for streaming playback
    this.audioQueue = [];
    this.currentSource = null;
    this._isPlaying = false; // Prefixed to avoid collision with getter
    this._isPaused = false;

    // Text buffering for sentence segmentation
    this.sentenceBuffer = '';

    // Generation request queue — sent to worker serially
    this._pendingGenerations = [];
    this._workerBusy = false;

    // Tracking the active request to discard stale chunks on stop/skip
    this._msgId = 0;
    this._activeId = null;

    // Voice assignments: speaker key → Kokoro voice ID (e.g., 'af_bella')
    this.speakerVoices = {};

    // Available Kokoro voices (American + British English)
    this.VOICE_POOL = [
      // American English female
      'af_alloy', 'af_aoede', 'af_bella', 'af_heart', 'af_jessica',
      'af_kore', 'af_nicole', 'af_nova', 'af_river', 'af_sarah', 'af_sky',
      // American English male
      'am_adam', 'am_echo', 'am_eric', 'am_fenrir', 'am_liam',
      'am_michael', 'am_onyx', 'am_puck', 'am_santa',
      // British English female
      'bf_alice', 'bf_emma', 'bf_isabella', 'bf_lily',
      // British English male
      'bm_daniel', 'bm_fable', 'bm_george', 'bm_lewis',
    ];
  }

  /** Create worker and load Kokoro model */
  async initialize() {
    if (this.isInitialized) return;

    console.log('[TTS] Initializing Kokoro model in worker...');

    try {
      this.worker = new Worker('js/tts-worker.js', { type: 'module' });
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();

      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume().catch(() => {
          console.warn('[TTS] AudioContext could not be resumed. Waiting for user gesture.');
        });
      }

      this.worker.onmessage = (e) => this._handleWorkerMessage(e);
      this.worker.onerror = (err) => console.error('[TTS] Worker error:', err);

      // Clean promise-based initialization
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          this.worker.removeEventListener('message', onInit);
          reject(new Error('TTS initialization timed out after 120s'));
        }, 120000);

        const onInit = (e) => {
          if (e.data.type === 'ready') {
            this.worker.removeEventListener('message', onInit);
            clearTimeout(timeout);
            this.isInitialized = true;
            console.log(`[TTS] Kokoro model loaded successfully using: ${e.data.device} (${e.data.dtype})`);
            resolve();
          } else if (e.data.type === 'initError') {
            this.worker.removeEventListener('message', onInit);
            clearTimeout(timeout);
            reject(new Error('TTS initialization failed: ' + e.data.message));
          }
        };

        this.worker.addEventListener('message', onInit);
        this.worker.postMessage({
          type: 'init',
          modelId: 'onnx-community/Kokoro-82M-v1.0-ONNX',
          dtype: 'q4',
          device: 'wasm', // WASM with multi-threading (requires COOP+COEP headers)
        });
      });

    } catch (error) {
      console.error('[TTS] Initialization failed:', error);
      throw error;
    }
  }

  /** Handle messages from worker */
  _handleWorkerMessage(e) {
    const data = e.data;

    // Discard any incoming messages from previous generations that were cancelled/stopped
    if (data.id && data.id !== this._activeId) {
      return;
    }

    switch (data.type) {
      case 'audio-chunk':
        // Received a real-time chunk during streaming
        this._wavToAudioBufferAndPlay(data.wav);
        break;

      case 'audio-done':
        // Streaming generation is complete for this sentence.
        // Worker is now free to pre-generate the next sentence in the queue.
        this._workerBusy = false;
        this._processGenerationQueue();
        break;

      case 'audio':
        // Standard non-streaming generation complete
        this._wavToAudioBufferAndPlay(data.wav);
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

  /**
   * Pick 3 random distinct voices from the pool.
   * @returns {Object} { A, B, judge }
   */
  pickRandomVoices() {
    const pool = [...this.VOICE_POOL];
    const shuffled = pool.sort(() => Math.random() - 0.5);
    return {
      A: shuffled[0],  // The Affirmative
      B: shuffled[1],  // The Negative
      judge: shuffled[2],
    };
  }

  /**
   * Assign voices to speaker roles.
   * @param {Object} voices - { A: 'af_bella', B: 'bm_george', judge: 'bf_lily' }
   */
  assignVoices(voices) {
    this.speakerVoices = { ...voices };
    console.log('[TTS] Voice assignments:', voices);
  }

  /** Feed a text chunk to the TTS pipeline.
   * Text is buffered and segmented at sentence boundaries.
   * @param {string} chunk - Partial text from streaming
   * @param {string} speaker - 'A', 'B', or 'judge'
   */
  feedTextChunk(chunk, speaker) {
    if (!this.isInitialized) return;

    // While paused, discard incoming text. Resume continues playback from
    // the last completed sentence (or where it stopped).
    if (this._isPaused) return;

    this.sentenceBuffer += chunk;

    // Extract complete sentences
    const sentenceRegex = /([^.!?\n]+[.!?\n]+)/g;
    const sentences = this.sentenceBuffer.match(sentenceRegex);

    if (sentences) {
      for (const sentence of sentences) {
        if (sentence.trim().length > 0) {
          this._queueAudioGeneration(sentence, speaker);
        }
      }

      // Keep only unprocessed remainder (everything after the last matched sentence)
      const lastSent = sentences[sentences.length - 1];
      // Use indexOf from near the end to find the actual last occurrence,
      // not an earlier duplicate
      const searchStart = Math.max(0, this.sentenceBuffer.length - lastSent.length - 100);
      const lastIdx = this.sentenceBuffer.indexOf(lastSent, searchStart);
      if (lastIdx === -1) {
        // Fallback: clear buffer if we can't find the anchor
        this.sentenceBuffer = '';
      } else {
        this.sentenceBuffer = this.sentenceBuffer.substring(lastIdx + lastSent.length);
      }
    }

    // Safety: cap buffer to prevent memory leaks
    if (this.sentenceBuffer.length > 5000) {
      this.sentenceBuffer = this.sentenceBuffer.substring(this.sentenceBuffer.length - 500);
    }
  }

  /** Queue a sentence for audio generation via worker */
  _queueAudioGeneration(text, speaker) {
    // Strip markdown and HTML for cleaner speech output
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

  /** Send next queued sentence to worker */
  _processGenerationQueue() {
    if (this._workerBusy || this._pendingGenerations.length === 0) return;

    this._workerBusy = true;
    const item = this._pendingGenerations.shift();
    const voiceId = this.speakerVoices[item.speaker] || this.VOICE_POOL[0];

    this._activeId = ++this._msgId;

    console.log('[TTS] Dispatching task:', item.text.substring(0, 60), 'voice:', voiceId);

    this.worker.postMessage({
      type: this.useStreaming ? 'stream-generate' : 'generate',
      id: this._activeId,
      text: item.text,
      voice: voiceId,
    });
  }

  /** Decode WAV ArrayBuffer from worker to AudioBuffer, enqueue for playback */
  async _wavToAudioBufferAndPlay(wavData) {
    try {
      // Ensure AudioContext is active
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      // Promise-based decoding (compatible with modern browsers)
      const audioBuffer = await this.audioContext.decodeAudioData(wavData);
      this.audioQueue.push(audioBuffer);

      if (!this._isPlaying) {
        this._playNextInQueue();
      }
    } catch (err) {
      console.error('[TTS] WAV decode failed:', err.message || String(err));
    }
  }

  /** Play the next audio buffer in the queue */
  _playNextInQueue() {
    if (this._isPaused) return;
    if (this.audioQueue.length === 0) {
      this._isPlaying = false;
      this.currentSource = null;
      return;
    }

    const audioBuffer = this.audioQueue.shift();
    this._isPlaying = true;

    this.currentSource = this.audioContext.createBufferSource();
    this.currentSource.buffer = audioBuffer;
    this.currentSource.connect(this.audioContext.destination);

    this.currentSource.onended = () => {
      this.currentSource = null;
      this._playNextInQueue();
    };

    this.currentSource.start(0);
  }

  /** Flush remaining buffered text when streaming ends */
  async finishStreaming(speaker) {
    if (this.sentenceBuffer.trim().length > 0) {
      this._queueAudioGeneration(this.sentenceBuffer, speaker);
      this.sentenceBuffer = '';
    }
    // Wait for all pending generations to complete
    await this._waitForGenerationQueue();
  }

  /** Wait for all pending generations to complete */
  _waitForGenerationQueue() {
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

  /** Stop playback and clear all queued audio */
  stopAudio() {
    // Invalidate current and upcoming chunks from current generation request
    this._activeId = null;

    if (this.currentSource) {
      try {
        this.currentSource.stop();
      } catch (e) {
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

  /** Pause playback — preserves audio queue and pending generations for resume */
  pauseAudio() {
    this._isPaused = true;
    // Do NOT invalidate _activeId — let the worker's current result arrive and
    // be added to the audio queue so it can be played on resume.

    if (this.currentSource) {
      try {
        this.currentSource.stop();
      } catch (e) {
        /* already stopped */
      }
      this.currentSource = null;
    }

    this._isPlaying = false;
    // audioQueue and _pendingGenerations are preserved for resume
  }

  /** Resume playback from where it paused */
  async resumeAudio() {
    if (!this._isPaused) return;
    this._isPaused = false;

    // Resume playback of queued audio
    if (this.audioQueue.length > 0) {
      this._playNextInQueue();
    }

    // If worker is idle and there are pending generations, start processing
    if (!this._workerBusy && this._pendingGenerations.length > 0) {
      this._processGenerationQueue();
    }
  }

  /** Clean up worker and resources */
  destroy() {
    if (this.worker) {
      this.worker.postMessage({ type: 'stop' });
      this.worker.terminate();
      this.worker = null;
    }
    this.isInitialized = false;
    this.stopAudio();
  }

  // Getters to fix the property name clash
  get isPlaying() {
    return this._isPlaying;
  }

  get isPaused() {
    return this._isPaused;
  }

  hasQueuedAudio() {
    return this.audioQueue.length > 0;
  }
}

// Singleton instance
const ttsManager = new RealtimeTTSManager();

/**
 * Initialize TTS and assign random voices for a debate.
 */
async function startDebateAudio(debateId) {
  await ttsManager.initialize();
  ttsManager.assignVoices(ttsManager.pickRandomVoices());
}

/** Feed streaming text to TTS */
function feedAudioText(chunk, speaker) {
  if (ttsManager.isInitialized) {
    ttsManager.feedTextChunk(chunk, speaker);
  }
}

/** Flush remaining buffered text after streaming ends */
async function finishDebateAudio(speaker) {
  if (ttsManager.isInitialized) {
    await ttsManager.finishStreaming(speaker);
  }
}

/** Stop all audio playback */
function stopDebateAudio() {
  ttsManager.stopAudio();
  appState.ttsPaused = false;
}

/** Pause audio playback (preserves queues for resume) */
function pauseDebateAudio() {
  ttsManager.pauseAudio();
  appState.ttsPaused = true;
}

/** Resume paused audio playback */
async function resumeDebateAudio() {
  await ttsManager.resumeAudio();
  appState.ttsPaused = false;
}