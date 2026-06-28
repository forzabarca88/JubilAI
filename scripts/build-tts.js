#!/usr/bin/env node
const { spawn } = require('child_process');
const path = require('path');
const projectRoot = path.resolve(__dirname, '..');
const config = require(path.join(projectRoot, 'config.json'));

const tts = config.tts;

const child = spawn('npx', [
  'esbuild',
  'client/tts/worker.ts',
  '--bundle',
  '--outfile=dist/js/tts-worker.js',
  '--format=esm',
  '--minify',
  `--define:TTS_MODEL_ID="${tts.modelId}"`,
  `--define:TTS_DTYPE="${tts.dtype}"`,
  `--define:TTS_DEVICE="${tts.device}"`,
], {
  cwd: projectRoot,
  stdio: 'inherit',
});

child.on('close', (code) => process.exit(code));
