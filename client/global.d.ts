/**
 * Global type declarations for libraries loaded via CDN and build-time defines.
 */

// marked (loaded via CDN script tag in index.html)
interface MarkedOptions {
  gfm?: boolean;
  breaks?: boolean;
  extensions?: unknown[];
  pedantic?: boolean;
  sanitize?: boolean;
  smartypants?: boolean;
}

interface MarkedStatic {
  parse(markdown: string, options?: MarkedOptions): string;
  parseInline(markdown: string, options?: MarkedOptions): string;
  use(extensions: unknown[]): void;
}

declare const marked: MarkedStatic;

// Safari-prefixed AudioContext
interface Window {
  webkitAudioContext?: typeof AudioContext;
}

// Kokoro TTS worker build-time defines (inlined by esbuild --define)
declare const TTS_MODEL_ID: string;
declare const TTS_DTYPE: string;
declare const TTS_DEVICE: string;

// Kokoro TTS types
interface KokoroInstance {
  generate(text: string, options: { voice: string }): Promise<RawAudio>;
  stream(text: string, options: { voice: string }): Promise<AsyncIterable<{ text: string; audio: RawAudio }>>;
}

interface RawAudio {
  toWav(): ArrayBuffer;
  sampling_rate: number;
}

// KokoroTTS constructor (used in worker.ts)
declare const KokoroTTS: {
  new (modelId: string, dtype: string, device: string): KokoroInstance;
  from_pretrained(modelId: string, options: { dtype: string; device: string }): Promise<KokoroInstance>;
};

// WorkerGlobalScope postMessage augmentation (for worker.ts)
// The DOM lib defines postMessage with Window signature, we need Worker signature
interface WorkerGlobalScope {
  postMessage(message: any, transfer?: Transferable[]): void;
}

// Dynamic import from CDN URLs
declare module 'https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js' {
  interface KokoroModule {
    KokoroTTS: {
      from_pretrained(modelId: string, options: { dtype: string; device: string }): Promise<KokoroInstance>;
    };
    env: Record<string, unknown>;
  }
  const mod: KokoroModule;
  export { mod as default };
}
