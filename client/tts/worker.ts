/**
 * TTS Web Worker — runs Kokoro inference off the main thread (typed).
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
 *
 * NOTE: This worker is compiled separately by esbuild with --format=iife
 * because it uses dynamic import() from CDN URLs. Config values are
 * inlined at build time via esbuild --define.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const config = {
  modelId: TTS_MODEL_ID,
  dtype: TTS_DTYPE,
  device: TTS_DEVICE,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type KokoroTTS = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type KokoroModule = { KokoroTTS: typeof KokoroTTS };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EnvModule = { env: Record<string, unknown> };

// Import env to configure ONNX Runtime Web multi-threading
import('https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js')
  .then((mod: EnvModule) => {
    const env = mod.env;
    if (env && (env as Record<string, Record<string, unknown>>).backends
      && (env as Record<string, Record<string, unknown>>).backends.onnx
      && ((env as Record<string, Record<string, unknown>>).backends.onnx as Record<string, unknown>).wasm) {
      ((env as Record<string, Record<string, unknown>>).backends.onnx as Record<string, Record<string, number>>).wasm.numThreads
        = navigator.hardwareConcurrency || 4;
    }
  })
  .catch(() => {});

let kokoro: KokoroTTS | null = null;
let isInitialized: boolean = false;

interface WorkerInMessage {
  type: 'init' | 'generate' | 'stream-generate' | 'stop';
  id?: number;
  text?: string;
  voice?: string;
  modelId?: string;
  dtype?: string;
  device?: string;
}

interface WorkerOutMessage {
  type: 'ready' | 'audio' | 'audio-chunk' | 'audio-done' | 'error' | 'initError';
  id?: number;
  wav?: ArrayBuffer;
  sampleRate?: number;
  text?: string;
  message?: string;
  device?: string;
  dtype?: string;
}

self.onmessage = async (e: MessageEvent<WorkerInMessage>) => {
  const { type, id, text, voice, modelId, dtype, device } = e.data;

  if (type === 'init') {
    try {
      const mod = await import(
        'https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js'
      ) as KokoroModule;

      const finalDevice = device || config.device;
      const finalDtype = dtype || config.dtype;

      kokoro = await mod.KokoroTTS.from_pretrained(modelId || config.modelId, {
        dtype: finalDtype,
        device: finalDevice,
      });

      isInitialized = true;
      self.postMessage({ type: 'ready', device: finalDevice, dtype: finalDtype } as WorkerOutMessage);
    } catch (err) {
      self.postMessage({ type: 'initError', message: (err as Error).message || String(err) } as WorkerOutMessage);
    }
    return;
  }

  if (type === 'stop') {
    kokoro = null;
    isInitialized = false;
    return;
  }

  if (type === 'generate') {
    if (!isInitialized || !kokoro) {
      self.postMessage({ type: 'error', id, message: 'TTS not initialized' } as WorkerOutMessage);
      return;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawAudio: any = await kokoro.generate(text!, { voice });
      const wavBuffer = rawAudio.toWav();

      self.postMessage(
        { type: 'audio', id, wav: wavBuffer, sampleRate: rawAudio.sampling_rate } as WorkerOutMessage,
        [wavBuffer]
      );
    } catch (err) {
      self.postMessage({ type: 'error', id, message: (err as Error).message || String(err) } as WorkerOutMessage);
    }
    return;
  }

  if (type === 'stream-generate') {
    if (!isInitialized || !kokoro) {
      self.postMessage({ type: 'error', id, message: 'TTS not initialized' } as WorkerOutMessage);
      return;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const stream: AsyncIterable<{ text: string; audio: any }> = await kokoro.stream(text!, { voice });

      for await (const { text: chunkText, audio } of stream) {
        const wavBuffer = audio.toWav();
        self.postMessage(
          {
            type: 'audio-chunk',
            id,
            wav: wavBuffer,
            sampleRate: audio.sampling_rate,
            text: chunkText,
          } as WorkerOutMessage,
          [wavBuffer]
        );
      }

      self.postMessage({ type: 'audio-done', id } as WorkerOutMessage);
    } catch (err) {
      self.postMessage({ type: 'error', id, message: (err as Error).message || String(err) } as WorkerOutMessage);
    }
  }
};
