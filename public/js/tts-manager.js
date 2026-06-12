/**
 * Real-time Text-to-Speech Manager using kokoro-js via CDN
 *
 * kokoro-js wraps Xenova's Transformers.js with a clean API for Kokoro TTS.
 * Uses onnx-community/Kokoro-82M-v1.0-ONNX (publicly accessible ONNX weights, no auth required)
 * and sentence splitting. 32 voices available across American/British English.
 *
 * RawAudio output: { audio: Float32Array, sampling_rate: number }
 *
 * Captures streaming text chunks, batches them at sentence boundaries,
 * generates audio per sentence, and plays sequentially through a queue.
 * Different speakers (Side A, Side B, Judge) get random distinct voices.
 */
class RealtimeTTSManager {
  constructor() {
    this.kokoro = null;
    this.audioContext = null;
    this.isInitialized = false;

    // Audio queue for streaming playback
    this.audioQueue = [];
    this.currentSource = null;
    this.isPlaying = false;

    // Text buffering for sentence segmentation
    this.sentenceBuffer = '';

    // Voice assignments: speaker key → Kokoro voice ID (e.g., 'af_bella')
    // Keys match what callers pass: 'A', 'B', 'judge'
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

  /** Load Kokoro TTS model via kokoro-js */
  async initialize() {
    if (this.isInitialized) return;

    console.log('[TTS] Initializing Kokoro model...');
    try {
      // Import kokoro-js from CDN (bundles transformers@3.5.1)
      const { KokoroTTS } = await import(
        'https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js'
      );

      // onnx-community/Kokoro-82M-v1.0-ONNX — publicly accessible ONNX weights with 32 English voices
      this.kokoro = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
        dtype: 'q8',       // quantized for smaller download + faster inference
        device: 'wasm',    // WebAssembly backend (no WebGPU dependency)
      });

      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }

      this.isInitialized = true;
      console.log('[TTS] Kokoro model loaded successfully');
    } catch (error) {
      console.error('[TTS] Initialization failed:', error);
      throw new Error('TTS initialization failed: ' + error.message);
    }
  }

  /**
   * Pick 3 random distinct voices from the pool.
   * @returns {Object} { A, B, judge } — keys match what callers pass
   */
  pickRandomVoices() {
    const pool = [...this.VOICE_POOL];
    const shuffled = pool.sort(() => Math.random() - 0.5);
    return {
      A: shuffled[0],
      B: shuffled[1],
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

  /**
   * Feed a text chunk to the TTS pipeline.
   * Text is buffered and segmented at sentence boundaries.
   * @param {string} chunk - Partial text from streaming
   * @param {string} speaker - 'A', 'B', or 'judge'
   */
  feedTextChunk(chunk, speaker) {
    if (!this.isInitialized) return;

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

      // Keep only unprocessed remainder
      const lastSent = sentences[sentences.length - 1];
      const lastIdx = this.sentenceBuffer.lastIndexOf(lastSent);
      this.sentenceBuffer = this.sentenceBuffer.substring(lastIdx + lastSent.length);
    }

    // Safety: cap buffer to prevent memory issues
    if (this.sentenceBuffer.length > 5000) {
      this.sentenceBuffer = this.sentenceBuffer.substring(this.sentenceBuffer.length - 500);
    }
  }

  /** Generate audio for a sentence and enqueue it */
  async _queueAudioGeneration(text, speaker) {
    try {
      // Strip markdown and HTML for clean speech
      const cleanText = text
        .replace(/<[^>]*>/g, '')
        .replace(/[*_`#\[\]>~]/g, '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .trim();

      if (cleanText.length === 0) return;

      const voiceId = this.speakerVoices[speaker] || this.VOICE_POOL[0];
      let rawAudio;

      // kokoro-js returns RawAudio { audio: Float32Array, sampling_rate: number }
      console.log('[TTS] Generating audio for:', cleanText.substring(0, 60), 'voice:', voiceId);

      try {
        rawAudio = await this.kokoro.generate(cleanText, { voice: voiceId });
        console.log('[TTS] RawAudio generated:', { audioLength: rawAudio?.audio?.length, samplingRate: rawAudio?.sampling_rate });
      } catch (genErr) {
        console.error('[TTS] generate() failed for:', cleanText.substring(0, 80));
        console.error('[TTS] Error:', genErr?.message || String(genErr), genErr?.stack || genErr);
        throw genErr;
      }

      // Convert to AudioBuffer for Web Audio API playback
      let audioBuffer;
      try {
        audioBuffer = await this.audioContext.decodeAudioData(
          this._pcmToAudioBuffer(rawAudio.audio, rawAudio.sampling_rate)
        );
      } catch (wavErr) {
        console.error('[TTS] WAV conversion failed:', wavErr?.message || String(wavErr), 'rawAudio:', rawAudio);
        return;
      }

      this.audioQueue.push(audioBuffer);

      if (!this.isPlaying) {
        this._playNextInQueue();
      }
    } catch (error) {
      const msg = error?.message || (error?.stack || String(error));
      console.error('[TTS] Error generating audio for "' + cleanText?.substring(0, 60) + '" (voice=' + (this.speakerVoices[speaker] || '?') + '):', msg);
      console.error('[TTS] Error details:', error, 'type:', typeof error, 'constructor:', error?.constructor?.name);
    }
  }

  /** Play the next audio buffer in the queue */
  _playNextInQueue() {
    if (this.audioQueue.length === 0) {
      this.isPlaying = false;
      this.currentSource = null;
      return;
    }

    const audioBuffer = this.audioQueue.shift();
    this.isPlaying = true;

    this.currentSource = this.audioContext.createBufferSource();
    this.currentSource.buffer = audioBuffer;
    this.currentSource.connect(this.audioContext.destination);
    this.currentSource.start(0);

    this.currentSource.onended = () => {
      this.currentSource = null;
      this._playNextInQueue();
    };
  }

  /** Flush remaining buffered text when streaming ends */
  async finishStreaming(speaker) {
    if (this.sentenceBuffer.trim().length > 0) {
      await this._queueAudioGeneration(this.sentenceBuffer, speaker);
      this.sentenceBuffer = '';
    }
  }

  /** Stop playback and clear all queued audio */
  stopAudio() {
    if (this.currentSource) {
      try { this.currentSource.stop(); } catch (e) { /* already stopped */ }
      this.currentSource = null;
    }
    this.audioQueue = [];
    this.isPlaying = false;
    this.sentenceBuffer = '';
  }

  /** Convert PCM float32 array to WAV-format ArrayBuffer for decodeAudioData */
  _pcmToAudioBuffer(pcmData, sampleRate) {
    if (!pcmData || !pcmData.length) {
      throw new Error('Invalid PCM data: ' + (pcmData?.constructor?.name || typeof pcmData));
    }
    const numSamples = pcmData.length;
    const wavSize = 44 + numSamples * 2;
    const wav = new ArrayBuffer(wavSize);
    const view = new DataView(wav);

    // RIFF header
    view.setUint32(0, 0x52494646, false); // 'RIFF'
    view.setUint32(4, wavSize - 8, true);
    view.setUint32(8, 0x57415645, false); // 'WAVE'

    // fmt chunk
    view.setUint32(12, 0x666d7420, false); // 'fmt '
    view.setUint32(16, 16, true);          // chunk size
    view.setUint16(20, 1, true);           // PCM format
    view.setUint16(22, 1, true);           // mono
    view.setUint32(24, sampleRate, true);  // sample rate
    view.setUint32(28, sampleRate * 2, true); // byte rate
    view.setUint16(32, 2, true);           // block align
    view.setUint16(34, 16, true);          // bits per sample

    // data chunk
    view.setUint32(36, 0x64617461, false); // 'data'
    view.setUint32(40, numSamples * 2, true);

    // Write PCM samples (float32 → int16)
    const offset = 44;
    for (let i = 0; i < numSamples; i++) {
      const s = Math.max(-1, Math.min(1, pcmData[i]));
      view.setInt16(offset + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }

    return wav;
  }

  isPlaying() { return this.isPlaying; }
  hasQueuedAudio() { return this.audioQueue.length > 0; }
}

// Singleton instance
const ttsManager = new RealtimeTTSManager();

/**
 * Initialize TTS and assign random voices for a debate.
 * @param {string} debateId
 */
async function startDebateAudio(debateId) {
  await ttsManager.initialize();
  ttsManager.assignVoices(ttsManager.pickRandomVoices());
}

/** Feed streaming text to TTS (sync — queues audio generation) */
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
}
