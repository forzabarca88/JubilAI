/**
 * TTS Web Worker — runs Kokoro inference off the main thread.
 *
 * Receives: { type: 'init', modelId, dtype, device }
 *           { type: 'generate', id, text, voice }
 *           { type: 'stream-generate', id, text, voice }
 *           { type: 'stop' }
 *
 * Sends back: { type: 'ready', device, dtype }
 *             { type: 'audio', id, wav: ArrayBuffer, sampleRate }
 *             { type: 'audio-chunk', id, wav: ArrayBuffer, sampleRate, text }
 *             { type: 'audio-done', id }
 *             { type: 'error', id, message }
 *             { type: 'initError', message }
 */

// Import env to configure ONNX Runtime Web multi-threading
import { env } from 'https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js';

// Configure ONNX Runtime WASM backend to use multiple CPU threads.
// Requires COOP + COEP headers from the server (SharedArrayBuffer).
if (env && env.backends && env.backends.onnx && env.backends.onnx.wasm) {
  env.backends.onnx.wasm.numThreads = navigator.hardwareConcurrency || 4;
}

let kokoro = null;
let isInitialized = false;

self.onmessage = async (e) => {
  const { type, id, text, voice, modelId, dtype, device } = e.data;

  if (type === 'init') {
    try {
      // Dynamic import for ES module in worker
      const { KokoroTTS } = await import(
        'https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js'
      );

      // q4 quantization: ~43MB download, ~2x faster inference than q8
      const finalDevice = device || 'wasm';
      const finalDtype = dtype || 'q4';

      kokoro = await KokoroTTS.from_pretrained(modelId || 'onnx-community/Kokoro-82M-v1.0-ONNX', {
        dtype: finalDtype,
        device: finalDevice,
      });

      isInitialized = true;
      self.postMessage({ type: 'ready', device: finalDevice, dtype: finalDtype });
    } catch (err) {
      self.postMessage({ type: 'initError', message: err.message || String(err) });
    }
    return;
  }

  if (type === 'stop') {
    kokoro = null;
    isInitialized = false;
    return;
  }

  // Full generation (stable, uses WASM)
  if (type === 'generate') {
    if (!isInitialized || !kokoro) {
      self.postMessage({ type: 'error', id, message: 'TTS not initialized' });
      return;
    }

    try {
      const rawAudio = await kokoro.generate(text, { voice });
      const wavBuffer = rawAudio.toWav();

      self.postMessage(
        { type: 'audio', id, wav: wavBuffer, sampleRate: rawAudio.sampling_rate },
        [wavBuffer]
      );
    } catch (err) {
      self.postMessage({ type: 'error', id, message: err.message || String(err) });
    }
    return;
  }

  // Streaming generation (stable, fast perceived performance on WASM)
  if (type === 'stream-generate') {
    if (!isInitialized || !kokoro) {
      self.postMessage({ type: 'error', id, message: 'TTS not initialized' });
      return;
    }

    try {
      const stream = await kokoro.stream(text, { voice });

      for await (const { text: chunkText, audio } of stream) {
        const wavBuffer = audio.toWav();
        self.postMessage(
          {
            type: 'audio-chunk',
            id,
            wav: wavBuffer,
            sampleRate: audio.sampling_rate,
            text: chunkText,
          },
          [wavBuffer]
        );
      }

      self.postMessage({ type: 'audio-done', id });
    } catch (err) {
      self.postMessage({ type: 'error', id, message: err.message || String(err) });
    }
  }
};
