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
 * NOTE: This worker is compiled separately by esbuild with --format=esm
 * because it uses dynamic import() from CDN URLs. Config values are
 * inlined at build time via esbuild --define.
 *
 * Cache API polyfill: Kokoro uses the `caches` global to cache phoneme/voice
 * data between generate() calls. In Web Workers on untrustworthy origins
 * (HTTP on non-localhost IPs), `caches` is undefined, causing Kokoro to
 * fall back to network downloads on every call — severe performance hit.
 * This polyfill provides an in-memory cache as a fallback.
 */

// Cache API polyfill for Web Workers on untrustworthy origins
if (typeof (self as unknown as Record<string, unknown>).caches === 'undefined') {
  const _cacheStore = new Map<string, Map<string, { ok: boolean; clone: () => { ok: boolean; arrayBuffer: () => Promise<ArrayBuffer> }; arrayBuffer: () => Promise<ArrayBuffer> }>>();

  (self as unknown as Record<string, unknown>).caches = {
    async open(name: string) {
      if (!_cacheStore.has(name)) {
        _cacheStore.set(name, new Map());
      }
      const entries = _cacheStore.get(name)!;
      return {
        async match(request: string | { url?: string }) {
          const key = typeof request === 'string' ? request : (request as { url?: string }).url || '';
          return entries.get(key);
        },
        async put(request: string | { url?: string }, response: { ok: boolean; clone: () => { ok: boolean; arrayBuffer: () => Promise<ArrayBuffer> }; arrayBuffer: () => Promise<ArrayBuffer> }) {
          const key = typeof request === 'string' ? request : (request as { url?: string }).url || '';
          entries.set(key, response.clone ? response.clone() : response);
        },
        async delete(request: string | { url?: string }) {
          const key = typeof request === 'string' ? request : (request as { url?: string }).url || '';
          return entries.delete(key);
        },
      };
    },
    async delete(name: string) {
      return _cacheStore.delete(name);
    },
    async keys() {
      return [..._cacheStore.keys()];
    },
  };
}

const config = {
  modelId: TTS_MODEL_ID,
  dtype: TTS_DTYPE,
  device: TTS_DEVICE,
};

// Import env to configure ONNX Runtime Web multi-threading
import('https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js')
  .then((mod) => {
    const m = mod as unknown as { env: Record<string, unknown> };
    const env = m.env;
    if (env && (env as Record<string, Record<string, unknown>>).backends
      && (env as Record<string, Record<string, unknown>>).backends.onnx
      && ((env as Record<string, Record<string, unknown>>).backends.onnx as Record<string, unknown>).wasm) {
      ((env as Record<string, Record<string, unknown>>).backends.onnx as Record<string, Record<string, number>>).wasm.numThreads
        = navigator.hardwareConcurrency || 4;
    }
  })
  .catch(() => {});

let kokoro: KokoroInstance | null = null;
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

/** Send a message from worker to main thread, with optional transfer */
function send(msg: WorkerOutMessage, transfer?: Transferable[]): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (self as any).postMessage(msg, transfer);
}

self.onmessage = async (e: MessageEvent<WorkerInMessage>) => {
  const { type, id, text, voice, modelId, dtype, device } = e.data;

  if (type === 'init') {
    try {
      const mod = await import(
        'https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js'
      );
      const kokoroMod = mod as unknown as { KokoroTTS: typeof KokoroTTS };

      const finalDevice = device || config.device;
      const finalDtype = dtype || config.dtype;

      kokoro = await kokoroMod.KokoroTTS.from_pretrained(modelId || config.modelId, {
        dtype: finalDtype,
        device: finalDevice,
      });

      isInitialized = true;
      send({ type: 'ready', device: finalDevice, dtype: finalDtype });
    } catch (err) {
      send({ type: 'initError', message: (err as Error).message || String(err) });
    }
    return;
  }

  if (type === 'stop') {
    kokoro = null;
    isInitialized = false;
    return;
  }

  if (type === 'generate') {
    if (!isInitialized || !kokoro || !text || !voice) {
      send({ type: 'error', id, message: 'TTS not initialized or missing params' });
      return;
    }

    try {
      const rawAudio = await kokoro.generate(text, { voice });
      const wavBuffer = rawAudio.toWav();

      send(
        { type: 'audio', id, wav: wavBuffer, sampleRate: rawAudio.sampling_rate },
        [wavBuffer]
      );
    } catch (err) {
      send({ type: 'error', id, message: (err as Error).message || String(err) });
    }
    return;
  }

  if (type === 'stream-generate') {
    if (!isInitialized || !kokoro || !text || !voice) {
      send({ type: 'error', id, message: 'TTS not initialized or missing params' });
      return;
    }

    try {
      const stream = await kokoro.stream(text, { voice });

      for await (const { text: chunkText, audio } of stream) {
        const wavBuffer = audio.toWav();
        send(
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

      send({ type: 'audio-done', id });
    } catch (err) {
      send({ type: 'error', id, message: (err as Error).message || String(err) });
    }
  }
};
