/**
 * Test-first TTS skip verification — audio generation continuity.
 *
 * Both tests click skip at the same progress stage (2nd speaker's turn):
 *   - Debate: skip during 2nd speaker (turn 2 of 6)
 *   - Verdict: skip during judge's turn (verdict streaming)
 *
 * Assertion in both: audio generation must CONTINUE after skip
 *   (new audio chunks queued from text that arrives after skip).
 *
 * Expected: debate PASS, verdict FAIL (proving the bug).
 */

import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MOCK_PORT = 3001;
const MOCK_SERVER = join(__dirname, 'dist/server/mock/index.js');
const NON_KIOSK_ENV = { ...process.env, JUBILAI_KIOSK_MODE: '' };

// ── Mock TTS Worker + AudioContext ────────────────────────────────────
const MOCK_TTS_SCRIPT = `
(function() {
  class MockWorker {
    constructor() { this._listeners = []; }
    postMessage(data) {
      if (data.type === 'init') {
        setTimeout(() => this._emit({ type: 'ready', device: 'wasm', dtype: 'q4' }), 2);
      } else if (data.type === 'generate' || data.type === 'stream-generate') {
        setTimeout(() => {
          this._emit({ type: 'audio', id: data.id, wav: this._fakeWav(), sampleRate: 24000 });
          this._emit({ type: 'audio-done', id: data.id });
        }, 2);
      }
    }
    _emit(data) { for (const fn of this._listeners) fn({ data }); }
    addEventListener(e, h) { if (e === 'message') this._listeners.push(h); }
    removeEventListener(e, h) { if (e === 'message') this._listeners = this._listeners.filter(x => x !== h); }
    terminate() { this._listeners = []; }
    _fakeWav() {
      const b = new ArrayBuffer(48), v = new DataView(b);
      v.setUint32(0,0x52494646,true); v.setUint32(4,40,true); v.setUint32(8,0x57415645,true);
      v.setUint32(12,0x666d7420,true); v.setUint32(16,16,true); v.setUint16(20,1,true);
      v.setUint16(22,1,true); v.setUint32(24,24000,true); v.setUint32(28,48000,true);
      v.setUint16(32,2,true); v.setUint16(34,16,true); v.setUint32(36,0x64617461,true);
      v.setUint32(40,4,true); v.setFloat32(44,0,true);
      return b;
    }
  }
  self.Worker = MockWorker;
  const MA = class {
    constructor() { this.state = 'running'; this.destination = {}; }
    async decodeAudioData() { return { sampleRate:24000, length:1, duration:1/24000, getChannelData:()=>new Float32Array([0]) }; }
    createBufferSource() {
      return { buffer:null, connect:()=>{},
        start(){ if(this.onended) setTimeout(()=>this.onended(),2); },
        stop(){ if(this.onended) setTimeout(()=>this.onended(),2); },
        onended:null };
    }
    async resume(){}
  };
  self.AudioContext = MA;
  self.webkitAudioContext = MA;
})();
`;

async function startMockServer() {
  const server = spawn('node', [MOCK_SERVER], { cwd: __dirname, env: NON_KIOSK_ENV, stdio: ['pipe','pipe','pipe'] });
  const out = [];
  server.stdout.on('data', d => out.push(d.toString()));
  server.stderr.on('data', d => out.push(d.toString()));
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => { server.kill(); reject(new Error('Server failed')); }, 10000);
    const c = setInterval(() => {
      if (out.some(s => s.includes('running at'))) { clearTimeout(t); clearInterval(c); resolve(); }
    }, 200);
  });
  return server;
}

function parseQueueCount(statusText) {
  const m = statusText.match(/Queue:\s*(\d+)/);
  return m ? parseInt(m[1]) : 0;
}

function parsePlayingCount(statusText) {
  const m = statusText.match(/Playing:\s*(\d+)/);
  return m ? parseInt(m[1]) : 0;
}

function parseBufferedCount(statusText) {
  const m = statusText.match(/Buffered:\s*(\d+)/);
  return m ? parseInt(m[1]) : 0;
}

// Total audio activity = queue + playing + buffered
function totalActivity(statusText) {
  return parseQueueCount(statusText) + parsePlayingCount(statusText) + parseBufferedCount(statusText);
}

// ── Test 1: Debate skip at 2nd speaker ────────────────────────────────
async function testDebateSkip(page) {
  console.log('\n=== Test 1: Debate skip at 2nd speaker ===');

  await page.goto(`http://localhost:${MOCK_PORT}`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForSelector('#phase-setup', { state: 'visible', timeout: 5000 });

  // Setup with judge pre-configured
  await page.fill('#statement', 'AI will surpass human intelligence by 2040');
  await page.fill('#endpointA', `http://localhost:${MOCK_PORT}`);
  await page.fill('#endpointB', `http://localhost:${MOCK_PORT}`);
  await page.click('#btnFetchA');
  await page.waitForSelector('#modelsA', { state: 'visible', timeout: 5000 });
  await page.click('#btnFetchB');
  await page.waitForSelector('#modelsB', { state: 'visible', timeout: 5000 });
  await page.selectOption('#modelA', 'llama3.1:8b');
  await page.selectOption('#modelB', 'mistral:7b');
  await page.fill('#endpointJudge', `http://localhost:${MOCK_PORT}`);
  await page.click('#btnFetchJudge');
  await page.waitForSelector('#modelsJudge', { state: 'visible', timeout: 5000 });
  await page.selectOption('#judgeModelSelect', 'gemma:7b');

  await page.click('#btnStartDebate');
  await page.waitForSelector('#phase-debate', { state: 'visible', timeout: 10000 });
  await page.waitForFunction(
    `document.querySelector('#ttsStatus') && !document.querySelector('#ttsStatus').textContent.includes('Initializing')`,
    {}, { timeout: 10000 }
  );

  // Wait for 2nd speaker's turn to start (2 messages in debate stream)
  await page.waitForFunction(
    `document.querySelectorAll('#debateStream .message').length >= 2`,
    {}, { timeout: 30000 }
  );
  console.log('  2nd speaker turn started (2/6 messages)');

  // Wait for skip button to be visible
  await page.waitForFunction(
    `document.querySelector('#btnSkipTTS') && !document.querySelector('#btnSkipTTS').classList.contains('hidden')`,
    {}, { timeout: 10000 }
  );

  // Capture TTS status BEFORE skip (at 2nd speaker)
  const beforeStatus = await page.textContent('#ttsStatus');
  const beforeActivity = totalActivity(beforeStatus);
  console.log(`  Before skip: "${beforeStatus}"`);
  console.log(`  Audio activity before: ${beforeActivity}`);

  // Click skip
  await page.click('#btnSkipTTS');
  console.log('  Skip clicked');

  // Wait for remaining turns (3-6) to complete
  await page.waitForFunction(
    `document.querySelectorAll('#debateStream .message').length >= 6`,
    {}, { timeout: 30000 }
  );
  console.log('  All 6 debate turns complete');

  // Poll TTS status to catch activity from turns 3-6
  let status = '';
  for (let i = 0; i < 10; i++) {
    status = await page.textContent('#ttsStatus').catch(() => '');
    if (totalActivity(status) > beforeActivity) break;
    await new Promise(r => setTimeout(r, 300));
  }
  const afterActivity = totalActivity(status);
  console.log(`  After skip: "${status}"`);
  console.log(`  Audio activity after: ${afterActivity}`);

  // Assertion: audio activity must have increased (new audio from turns 3-6)
  const passed = afterActivity > beforeActivity;
  console.log(`  ${passed ? '✅ PASS' : '❌ FAIL'}: Audio continued after skip (${beforeActivity} → ${afterActivity})`);
  return passed;
}

// ── Test 2: Verdict skip at judge's turn ──────────────────────────────
async function testVerdictSkip(page) {
  console.log('\n=== Test 2: Verdict skip at judge\'s turn ===');

  await page.goto(`http://localhost:${MOCK_PORT}`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForSelector('#phase-setup', { state: 'visible', timeout: 5000 });

  // Setup WITHOUT judge (goes to judge-select after debate)
  await page.fill('#statement', 'AI will surpass human intelligence by 2040');
  await page.fill('#endpointA', `http://localhost:${MOCK_PORT}`);
  await page.fill('#endpointB', `http://localhost:${MOCK_PORT}`);
  await page.click('#btnFetchA');
  await page.waitForSelector('#modelsA', { state: 'visible', timeout: 5000 });
  await page.click('#btnFetchB');
  await page.waitForSelector('#modelsB', { state: 'visible', timeout: 5000 });
  await page.selectOption('#modelA', 'llama3.1:8b');
  await page.selectOption('#modelB', 'mistral:7b');

  await page.click('#btnStartDebate');
  await page.waitForSelector('#phase-debate', { state: 'visible', timeout: 10000 });

  // Wait for all 6 debate turns
  await page.waitForFunction(
    `document.querySelectorAll('#debateStream .message').length >= 6`,
    {}, { timeout: 30000 }
  );
  console.log('  All 6 debate turns complete');

  // Wait for judge-select phase
  await page.waitForSelector('#phase-judge-select', { state: 'visible', timeout: 10000 });
  console.log('  Judge-select phase visible');

  // Configure judge and start
  await page.fill('#endpointJudge2', `http://localhost:${MOCK_PORT}`);
  await page.click('#btnFetchJudge2');
  await page.waitForSelector('#modelsJudge2', { state: 'visible', timeout: 5000 });
  await page.selectOption('#judgeModelSelect2', 'gemma:7b');
  await page.click('#btnStartJudge2');

  // Wait for verdict phase
  await page.waitForSelector('#phase-verdict', { state: 'visible', timeout: 10000 });
  console.log('  Verdict phase visible');

  // Wait for verdict TTS to initialize
  await page.waitForFunction(
    `document.querySelector('#ttsStatusVerdict') && !document.querySelector('#ttsStatusVerdict').textContent.includes('Initializing')`,
    {}, { timeout: 10000 }
  );

  // Wait for verdict streaming to start
  await page.waitForFunction(
    `document.querySelector('#verdictReasoning') && document.querySelector('#verdictReasoning').classList.contains('streaming')`,
    {}, { timeout: 10000 }
  );
  console.log('  Verdict (judge) turn started');

  // Wait for verdict skip button to be visible
  await page.waitForFunction(
    `document.querySelector('#btnSkipTTSVerdict') && !document.querySelector('#btnSkipTTSVerdict').classList.contains('hidden')`,
    {}, { timeout: 10000 }
  );

  // Capture TTS status BEFORE skip (at judge's turn, same progress as 2nd speaker in debate)
  const beforeStatus = await page.textContent('#ttsStatusVerdict').catch(() => '');
  const beforeActivity = totalActivity(beforeStatus);
  console.log(`  Before skip: "${beforeStatus}"`);
  console.log(`  Audio activity before: ${beforeActivity}`);

  // Click skip
  await page.click('#btnSkipTTSVerdict');
  console.log('  Skip clicked');

  // Wait for verdict streaming to complete
  await page.waitForFunction(
    `document.querySelector('#verdictReasoning') && !document.querySelector('#verdictReasoning').classList.contains('streaming')`,
    {}, { timeout: 10000 }
  );
  console.log('  Verdict streaming complete');

  // Wait for flush to process
  await new Promise(r => setTimeout(r, 2000));

  // Check TTS status after flush
  const afterStatus = await page.textContent('#ttsStatusVerdict').catch(() => '');
  const afterActivity = totalActivity(afterStatus);
  console.log(`  After skip+flush: "${afterStatus}"`);
  console.log(`  Audio activity after: ${afterActivity}`);

  // Assertion: audio activity must have increased (new audio from flushed buffer)
  // THIS SHOULD FAIL — proving the bug.
  const passed = afterActivity > beforeActivity;
  console.log(`  ${passed ? '✅ PASS' : '❌ FAIL'}: Audio continued after skip (${beforeActivity} → ${afterActivity})`);
  return passed;
}

// ── Main ──────────────────────────────────────────────────────────────
async function main() {
  const server = await startMockServer();
  console.log('Mock server started\n');

  const browser = await chromium.launch();
  const results = [];

  try {
    // Test 1: Debate skip at 2nd speaker — should PASS
    const page1 = await browser.newPage();
    await page1.addInitScript(MOCK_TTS_SCRIPT);
    const r1 = await testDebateSkip(page1);
    results.push({ name: 'Debate skip (2nd speaker)', passed: r1 });
    await page1.close();

    // Test 2: Verdict skip at judge's turn — should FAIL (proving bug)
    const page2 = await browser.newPage();
    await page2.addInitScript(MOCK_TTS_SCRIPT);
    const r2 = await testVerdictSkip(page2);
    results.push({ name: 'Verdict skip (judge\'s turn)', passed: r2 });
    await page2.close();

  } finally {
    await browser.close();
    server.kill();
  }

  console.log('\n=== RESULTS ===');
  for (const r of results) {
    console.log(`  ${r.passed ? '✅' : '❌'} ${r.name}: ${r.passed ? 'PASS' : 'FAIL'}`);
  }

  const debatePassed = results[0].passed;
  const verdictFailed = !results[1].passed;

  if (debatePassed && verdictFailed) {
    console.log('\n✅ Test pattern confirmed:');
    console.log('   Debate skip works — audio continues after skip');
    console.log('   Verdict skip broken — audio stops after skip');
    console.log('   This proves the bug exists in the verdict phase.');
  } else {
    console.log('\n❌ Unexpected test results — pattern not matching expectation');
    process.exit(1);
  }
}

main().catch(err => { console.error('Test runner error:', err); process.exit(1); });
