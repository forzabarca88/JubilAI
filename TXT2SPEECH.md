# Text-to-Speech Implementation for LLM Debate Arena

## Overview
Live text-to-speech (TTS) for the LLM Debate Arena using **kokoro-js** via jsdelivr CDN. Kokoro is a lightweight (82M parameter) open-weight TTS model with 32 built-in voices across American and British English. Audio plays in real-time as debate text streams, with different voices assigned to each speaker.

## Architecture

### Model: `onnx-community/Kokoro-82M-v1.0-ONNX` via kokoro-js
- Loaded via `kokoro-js@1.2.1` CDN bundle (`https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js`)
- kokoro-js bundles `@huggingface/transformers@3.5.1` internally — no separate import needed
- Uses `onnx-community/Kokoro-82M-v1.0-ONNX` (publicly accessible ONNX weights, no HF auth required)
- Loaded with `dtype: 'q4'` (4-bit quantization, ~43MB download) for maximum CPU inference speed
- `device: 'wasm'` backend with multi-threading (`env.backends.onnx.wasm.numThreads = navigator.hardwareConcurrency`). Requires server COOP+COEP headers for SharedArrayBuffer access. Falls back to single-threaded WASM if headers missing.

### Voice Assignment
On debate start, 3 random distinct voices are assigned from the pool of 32:
- **The Affirmative**: Random voice (e.g., `af_bella` — American English female)
- **The Negative**: Random voice (e.g., `bm_george` — British English male)
- **Judge**: Random voice (e.g., `bf_emma` — British English female)

Voice pool (28 voices): `af_alloy`, `af_aoede`, `af_bella`, `af_heart`, `af_jessica`, `af_kore`, `af_nicole`, `af_nova`, `af_river`, `af_sarah`, `af_sky`, `am_adam`, `am_echo`, `am_eric`, `am_fenrir`, `am_liam`, `am_michael`, `am_onyx`, `am_puck`, `am_santa`, `bf_alice`, `bf_emma`, `bf_isabella`, `bf_lily`, `bm_daniel`, `bm_fable`, `bm_george`, `bm_lewis`

### Streaming TTS Pipeline
1. **Text buffering**: Streaming chunks accumulate in a sentence buffer
2. **Sentence segmentation**: Regex extracts complete sentences at `.`, `!`, `?`, `\n` boundaries
3. **Audio generation**: Each complete sentence sent to worker as `generate` request. Worker calls `kokoro.generate(text, { voice })` → returns `RawAudio` → calls `rawAudio.toWav()` → transfers WAV `ArrayBuffer` to main thread. Main thread decodes via `AudioContext.decodeAudioData()` and queues for playback
4. **Pipelined playback**: Worker synthesizes next sentence while previous one plays — gapless audio without sub-sentence streaming
5. **Flush on complete**: Remaining buffered text is processed when streaming ends

### File Structure
- `public/js/tts-manager.js` — `RealtimeTTSManager` class + global API functions (text buffering, WAV decode, audio playback, streaming support)
- `public/js/tts-worker.js` — Dedicated Web Worker for Kokoro model loading, ONNX/WASM inference, and streaming audio generation
- `public/index.html` — TTS toggle/stop buttons, status display, script tag for tts-manager.js
- `public/css/styles.css` — `.tts-controls`, `.tts-btn`, `.tts-status` styles
- `public/js/state.js` — `ttsEnabled`, `ttsSpeakerVoices`, `ttsActiveSpeaker`
- `public/js/phases/setup.js` — Auto-initializes TTS on debate start (non-blocking)
- `public/js/phases/debate.js` — Feeds streaming text to TTS per speaker
- `public/js/phases/verdict.js` — Feeds judge text to TTS with judge voice
- `public/js/app.js` — Stops audio and destroys TTS worker on `resetToSetup()`

### Global API Functions
- `startDebateAudio(debateId)` — Initialize model + assign random voices
- `feedAudioText(chunk, speaker)` — Feed streaming text chunk (sync, queues audio gen)
- `finishDebateAudio(speaker)` — Flush remaining buffer after streaming ends
- `stopDebateAudio()` — Stop playback and clear all queued audio

## Key Design Decisions

### Why kokoro-js over Xenova/speecht5_tts?
1. **No HF auth required**: `hexgrad/Kokoro-82M` is publicly accessible; `Xenova/kokoro` and `Xenova/speecht5_tts` speaker embeddings require auth (401)
2. **Built-in voices**: 32 voices built into the model — no separate embedding fetches
3. **Built-in phonemization**: kokoro-js handles text-to-phoneme conversion internally
4. **Smaller model**: ~100MB (q8 quantized) vs ~300MB for speecht5_tts
5. **Better quality**: Kokoro produces more natural-sounding speech than speecht5_tts

### Why `useStreaming = false` (no `stream-generate`)
`kokoro-js@1.2.1` has a known bug: passing a plain string to `kokoro.stream(text)` causes the internal generator loop to hang indefinitely. Standard `generate()` is stable and fast enough (~150-300ms per sentence with WASM/q8). The pipelined queue architecture ensures gapless playback: the worker synthesizes Sentence B while Sentence A is still playing on the main thread.

### Graceful Fallback
If TTS initialization fails (network error, model unavailable), the debate proceeds normally without audio. The toggle button shows disabled state.

## Testing Checklist
- [ ] Model loads without 401 errors
- [ ] 3 distinct voices assigned on debate start
- [ ] Audio plays in real-time during streaming
- [ ] Different voices for The Affirmative, The Negative, and Judge
- [ ] Sentences play in correct order
- [ ] Stop button interrupts playback
- [ ] Toggle button enables/disables TTS
- [ ] Model caches after first use
- [ ] Debate works normally when TTS fails
- [ ] Works in Chrome, Firefox, Safari

## Troubleshooting

| Problem | Solution |
|---------|----------|
| 401/404 on model load | Ensure using `onnx-community/Kokoro-82M-v1.0-ONNX`, not `hexgrad/Kokoro-82M` (PyTorch-only) or `Xenova/kokoro` (gated) |
| No sound at all | Check browser volume, verify Web Audio API support |
| Audio delayed | Model downloading on first use (~43MB with q4). Subsequent uses cached. |
| Synthesis very slow (30s/sentence) | Single-threaded WASM — server missing COOP+COEP headers. Add `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` headers. Verify with `self.crossOriginIsolated === true` in console. Multi-threaded WASM drops this to ~1-2s. |
| Garbled speech | Was caused by trying to transfer WASM HEAP Float32Array views (non-transferable). Fixed: worker uses `rawAudio.toWav()` to produce proper IEEE-float WAV ArrayBuffer, main thread decodes via `AudioContext.decodeAudioData()` |
| UI blocks during inference | Resolved: Kokoro runs in Web Worker, keeping main thread fully responsive |
| `postMessage` transfer error | WASM HEAP Float32Array views and byte offsets are not transferable. Fixed: worker uses `rawAudio.toWav()` which returns a standalone WAV `ArrayBuffer` (transferable) |
| Streaming hangs indefinitely | Known `kokoro-js@1.2.1` bug: `kokoro.stream(text)` with plain string input hangs. Fixed by disabling streaming (`useStreaming = false`) and using `generate()` instead |

## References
- [kokoro-js NPM](https://www.npmjs.com/package/kokoro-js)
- [onnx-community/Kokoro-82M-v1.0-ONNX on HF](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX)
- [Kokoro GitHub](https://github.com/hexgrad/kokoro)
- [Web Audio API MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
