/**
 * Test-first TTS skip verification — button visibility.
 *
 * Both tests click skip at 2nd speaker's turn (same progress stage):
 *   - Debate: skip during 2nd speaker (turn 2 of 6)
 *   - Verdict: skip during judge's turn (verdict streaming)
 *
 * Assertion: after skip + stream complete + flush, is the skip button
 * still visible (clickable) or has it disappeared?
 *
 * Expected:
 *   Debate: button stays visible ✅ (audio continues for remaining turns)
 *   Verdict: button disappears ❌ (audio stops, button never returns)
 */

import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MOCK_PORT = 3001;
const MOCK_SERVER = join(__dirname, 'dist/server/mock/index.js');
const NON_KIOSK_ENV = { ...process.env, JUBILAI_KIOSK_MODE: '' };

const MOCK_TTS_SCRIPT = `
(function() {
  class MockWorker {
    constructor() { this._listeners = []; this.onmessage = null; }
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
    _emit(data) {
      const event = { data };
      if (this.onmessage) this.onmessage(event);
      for (const fn of this._listeners) fn(event);
    }
    addEventListener(e, h) { if (e === 'message') this._listeners.push(h); }
    removeEventListener(e, h) { if (e === 'message') this._listeners = this._listeners.filter(x => x !== h); }
    terminate() { this._listeners = []; this.onmessage = null; }
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
        start(){ if(this.onended) setTimeout(()=>this.onended(),5); },
        stop(){ if(this.onended) setTimeout(()=>this.onended(),5); },
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

async function isBtnVisible(page, selector) {
  const btn = page.locator(selector);
  return btn.isVisible();
}

// ── Test 1: Debate skip at 2nd speaker ────────────────────────────────
async function testDebateSkip(page) {
  console.log('\n=== Test 1: Debate skip at 2nd speaker ===');

  await page.goto(`http://localhost:${MOCK_PORT}`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForSelector('#phase-setup', { state: 'visible', timeout: 5000 });

  // No judge → stays in debate phase
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
  await page.waitForFunction(
    `document.querySelector('#ttsStatus') && !document.querySelector('#ttsStatus').textContent.includes('Initializing')`,
    {}, { timeout: 10000 }
  );

  // Wait for 2nd speaker's turn
  await page.waitForFunction(
    `document.querySelectorAll('#debateStream .message').length >= 2`,
    {}, { timeout: 30000 }
  );
  console.log('  2nd speaker turn started (2/6)');

  // Wait for skip button visible
  await page.waitForFunction(
    `document.querySelector('#btnSkipTTS') && !document.querySelector('#btnSkipTTS').classList.contains('hidden')`,
    {}, { timeout: 10000 }
  );
  console.log('  Skip button visible before click');

  // Click skip
  await page.click('#btnSkipTTS');
  console.log('  Skip clicked');

  // Wait for all 6 debate turns
  await page.waitForFunction(
    `document.querySelectorAll('#debateStream .message').length >= 6`,
    {}, { timeout: 30000 }
  );
  console.log('  All 6 debate turns complete');

  // Wait a bit for TTS state to settle
  await new Promise(r => setTimeout(r, 2000));

  // Check if skip button is still visible
  const btnVisible = await isBtnVisible(page, '#btnSkipTTS');
  const statusText = await page.textContent('#ttsStatus').catch(() => '');
  console.log(`  TTS status: "${statusText}"`);
  console.log(`  Skip button visible: ${btnVisible}`);

  // Debate skip should keep button visible (audio continues for remaining turns)
  const passed = btnVisible;
  console.log(`  ${passed ? '✅ PASS: button stays visible' : '❌ FAIL: button disappeared'}`);
  return { passed, btnVisible };
}

// ── Test 2: Verdict skip at judge's turn ──────────────────────────────
async function testVerdictSkip(page) {
  console.log('\n=== Test 2: Verdict skip at judge\'s turn ===');

  await page.goto(`http://localhost:${MOCK_PORT}`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForSelector('#phase-setup', { state: 'visible', timeout: 5000 });

  // No judge → judge-select after debate
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
  await page.waitForFunction(
    `document.querySelectorAll('#debateStream .message').length >= 6`,
    {}, { timeout: 30000 }
  );
  console.log('  All 6 debate turns complete');

  await page.waitForSelector('#phase-judge-select', { state: 'visible', timeout: 10000 });
  console.log('  Judge-select phase visible');

  await page.fill('#endpointJudge2', `http://localhost:${MOCK_PORT}`);
  await page.click('#btnFetchJudge2');
  await page.waitForSelector('#modelsJudge2', { state: 'visible', timeout: 5000 });
  await page.selectOption('#judgeModelSelect2', 'gemma:7b');
  await page.click('#btnStartJudge2');

  await page.waitForSelector('#phase-verdict', { state: 'visible', timeout: 10000 });
  console.log('  Verdict phase visible');

  await page.waitForFunction(
    `document.querySelector('#ttsStatusVerdict') && !document.querySelector('#ttsStatusVerdict').textContent.includes('Initializing')`,
    {}, { timeout: 10000 }
  );

  await page.waitForFunction(
    `document.querySelector('#verdictReasoning') && document.querySelector('#verdictReasoning').classList.contains('streaming')`,
    {}, { timeout: 10000 }
  );
  console.log('  Verdict (judge) turn started');

  // Wait for skip button visible
  await page.waitForFunction(
    `document.querySelector('#btnSkipTTSVerdict') && !document.querySelector('#btnSkipTTSVerdict').classList.contains('hidden')`,
    {}, { timeout: 10000 }
  );
  console.log('  Skip button visible before click');

  // Click skip
  await page.click('#btnSkipTTSVerdict');
  console.log('  Skip clicked');

  // Wait for verdict streaming to complete
  await page.waitForFunction(
    `document.querySelector('#verdictReasoning') && !document.querySelector('#verdictReasoning').classList.contains('streaming')`,
    {}, { timeout: 10000 }
  );
  console.log('  Verdict streaming complete');

  // Wait for transcript to render (flush done)
  await page.waitForFunction(
    `document.querySelector('#transcriptStream .message')`,
    {}, { timeout: 10000 }
  );
  console.log('  Transcript rendered (flush done)');

  // Wait for TTS state to settle
  await new Promise(r => setTimeout(r, 2000));

  const statusText = await page.textContent('#ttsStatusVerdict').catch(() => '');
  console.log(`  TTS status: "${statusText}"`);

  // Check if skip button is still visible
  const btnVisible = await isBtnVisible(page, '#btnSkipTTSVerdict');
  console.log(`  Skip button visible: ${btnVisible}`);

  // Verdict skip should FAIL: button disappears (bug)
  // Test passes only if button stays visible (bug is fixed)
  const passed = btnVisible;
  console.log(`  ${passed ? '✅ PASS: button stays visible (bug fixed)' : '❌ FAIL: button disappeared (bug confirmed)'}`);

  return { passed, btnVisible };
}

// ── Main ──────────────────────────────────────────────────────────────
async function main() {
  const server = await startMockServer();
  console.log('Mock server started\n');

  const browser = await chromium.launch();
  const results = [];

  try {
    const page1 = await browser.newPage();
    await page1.addInitScript(MOCK_TTS_SCRIPT);
    const r1 = await testDebateSkip(page1);
    results.push({ name: 'Debate skip (2nd speaker)', passed: r1.passed, btnVisible: r1.btnVisible });
    await page1.close();

    const page2 = await browser.newPage();
    await page2.addInitScript(MOCK_TTS_SCRIPT);
    const r2 = await testVerdictSkip(page2);
    results.push({ name: 'Verdict skip (judge\'s turn)', passed: r2.passed, btnVisible: r2.btnVisible });
    await page2.close();

  } finally {
    await browser.close();
    server.kill();
  }

  console.log('\n=== RESULTS ===');
  for (const r of results) {
    console.log(`  ${r.passed ? '✅' : '❌'} ${r.name}: button ${r.btnVisible ? 'visible' : 'hidden'}`);
  }

  if (results[0].passed && !results[1].passed) {
    console.log('\n✅ Test pattern confirmed:');
    console.log('   Debate skip: button stays visible ✅');
    console.log('   Verdict skip: button disappears ❌');
    console.log('   Bug proven: after skip in verdict phase, the skip button');
    console.log('   vanishes and never returns — user cannot skip again.');
  } else {
    console.log('\n❌ Unexpected pattern');
    process.exit(1);
  }
}

main().catch(err => { console.error('Test runner error:', err); process.exit(1); });
