/** End-to-end test: full debate flow in Kiosk Mode on mock server using Playwright */

import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const MOCK_PORT = 3001;
const MOCK_SERVER = join(__dirname, 'dist/server/mock/index.js');

const DEBATE_TIMEOUT = 180_000;

// Kiosk env vars for the mock server
const KIOSK_ENV = {
  JUBILAI_KIOSK_MODE: 'true',
  JUBILAI_KIOSK_ENDPOINT_A: `http://localhost:${MOCK_PORT}`,
  JUBILAI_KIOSK_MODEL_A: 'llama3.1:8b',
  JUBILAI_KIOSK_ENDPOINT_B: `http://localhost:${MOCK_PORT}`,
  JUBILAI_KIOSK_MODEL_B: 'mistral:7b',
  JUBILAI_KIOSK_ENDPOINT_JUDGE: `http://localhost:${MOCK_PORT}`,
  JUBILAI_KIOSK_MODEL_JUDGE: 'gemma:7b',
};

/** Start mock server with kiosk env vars */
function startMockServer(envOverrides = {}) {
  const env = { ...process.env, ...envOverrides };
  console.log('Starting mock server in kiosk mode...');
  const server = spawn('node', [MOCK_SERVER], {
    cwd: __dirname,
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const stdout = [];
  server.stdout.on('data', (d) => stdout.push(d.toString()));
  server.stderr.on('data', (d) => stdout.push(d.toString()));

  return { server, stdout };
}

async function waitForServerStart(stdout, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Mock server failed to start: ${stdout.join('').trim()}`));
    }, timeoutMs);

    const check = setInterval(() => {
      const output = stdout.join('');
      // Wait for validation to complete (prints after server is listening)
      if (output.includes('Validation complete') || output.includes('shutting down')) {
        clearTimeout(timeout);
        clearInterval(check);
        resolve(output);
      }
      // Fallback: if no kiosk validation (kiosk disabled), "running at" is enough
      if (!output.includes('Kiosk mode enabled') && output.includes('running at')) {
        clearTimeout(timeout);
        clearInterval(check);
        resolve(output);
      }
    }, 200);
  });
}

async function main() {
  const failures = [];

  // ── Test 1: Server rejects kiosk mode without judge vars ──
  console.log('\n=== Test 1: Server validation — missing judge vars ===');
  {
    const noJudgeEnv = {
      ...KIOSK_ENV,
      JUBILAI_KIOSK_ENDPOINT_JUDGE: undefined,
      JUBILAI_KIOSK_MODEL_JUDGE: undefined,
    };
    // Remove the keys entirely (undefined values still get passed)
    delete noJudgeEnv.JUBILAI_KIOSK_ENDPOINT_JUDGE;
    delete noJudgeEnv.JUBILAI_KIOSK_MODEL_JUDGE;

    const { server, stdout } = startMockServer(noJudgeEnv);
    let exited = false;
    server.on('exit', (code) => {
      exited = true;
    });

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        server.kill();
        reject(new Error('Server should have crashed but stayed running'));
      }, 10000);

      server.on('exit', (code) => {
        clearTimeout(timeout);
        resolve(code);
      });
    });

    const output = stdout.join('');
    if (exited && output.includes('kiosk mode enabled') && output.includes('missing or empty')) {
      console.log('  ✓ Server correctly rejects kiosk mode without judge vars');
    } else {
      console.log(`  ❌ FAIL: Server did not reject properly. Exit code: ${exited ? 'yes' : 'no'}, output: ${output.slice(-200)}`);
      failures.push('Server validation: missing judge vars not rejected');
    }
    server.kill();
  }

  // ── Test 2: Server starts with all required kiosk vars ──
  console.log('\n=== Test 2: Server starts with all required kiosk vars ===');
  const { server, stdout } = startMockServer(KIOSK_ENV);
  const output = await waitForServerStart(stdout);
  console.log(stdout.join('').trim());

  if (output.includes('shutting down')) {
    console.log(`  ❌ FAIL: Server shut down during validation. Output: ${output.slice(-300)}`);
    failures.push('Server shut down during kiosk validation');
    server.kill();
    process.exit(1);
  }
  if (output.includes('Validation complete') && output.includes('0 failed')) {
    console.log('  ✓ Server started successfully with kiosk mode (all endpoints validated)');
  } else if (output.includes('Validation complete')) {
    console.log(`  ❌ FAIL: Validation had failures. Output: ${output.slice(-300)}`);
    failures.push('Kiosk validation had failures');
    server.kill();
    process.exit(1);
  } else {
    console.log('  ✓ Server started successfully with kiosk mode');
  }

  try {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    const consoleErrors = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(`[${msg.type()}] ${msg.text()}`);
      }
    });
    page.on('pageerror', (err) => {
      consoleErrors.push(`[pageError] ${err.message}`);
    });

    // ── Test 3: Kiosk UI — config sections hidden ──
    console.log('\n=== Test 3: Kiosk UI — config sections hidden ===');
    await page.goto(`http://localhost:${MOCK_PORT}`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForSelector('#phase-setup', { state: 'visible', timeout: 5000 });

    // Check html[data-kiosk="true"]
    const kioskAttr = await page.getAttribute('html', 'data-kiosk');
    if (kioskAttr === 'true') {
      console.log('  ✓ html[data-kiosk="true"] attribute set');
    } else {
      console.log(`  ❌ FAIL: html data-kiosk attribute is "${kioskAttr}" (expected "true")`);
      failures.push('html data-kiosk attribute not set to "true"');
    }

    // Config section should be hidden (side-card and judge-card are hidden)
    const configSectionVisible = await page.evaluate(() => {
      const sideCard = document.querySelector('.side-card');
      const judgeCard = document.querySelector('.judge-card');
      // offsetParent is null for elements hidden by display:none
      return (sideCard && sideCard.offsetParent !== null) ||
             (judgeCard && judgeCard.offsetParent !== null);
    });
    if (!configSectionVisible) {
      console.log('  ✓ Config section (endpoints, models) is hidden');
    } else {
      console.log('  ❌ FAIL: Config section is visible in kiosk mode');
      failures.push('Config section visible in kiosk mode');
    }

    // Advanced settings should be hidden
    const advancedVisible = await page.evaluate(() => {
      const el = document.querySelector('.advanced-settings-card');
      return el ? el.offsetParent !== null : true;
    });
    if (!advancedVisible) {
      console.log('  ✓ Advanced settings panel is hidden');
    } else {
      console.log('  ❌ FAIL: Advanced settings panel is visible in kiosk mode');
      failures.push('Advanced settings panel visible in kiosk mode');
    }

    // History button should be hidden
    const historyBtnVisible = await page.evaluate(() => {
      const el = document.querySelector('#btnHistory');
      return el ? el.offsetParent !== null : true;
    });
    if (!historyBtnVisible) {
      console.log('  ✓ History button is hidden');
    } else {
      console.log('  ❌ FAIL: History button is visible in kiosk mode');
      failures.push('History button visible in kiosk mode');
    }

    // Judge-select phase should be hidden
    const judgeSelectVisible = await page.evaluate(() => {
      const el = document.querySelector('#phase-judge-select');
      return el ? el.offsetParent !== null : true;
    });
    if (!judgeSelectVisible) {
      console.log('  ✓ Judge-select phase is hidden');
    } else {
      console.log('  ❌ FAIL: Judge-select phase is visible in kiosk mode');
      failures.push('Judge-select phase visible in kiosk mode');
    }

    // Statement textarea should be visible
    const statementVisible = await page.evaluate(() => {
      const el = document.querySelector('#statement');
      return el ? el.offsetParent !== null : false;
    });
    if (statementVisible) {
      console.log('  ✓ Statement textarea is visible');
    } else {
      console.log('  ❌ FAIL: Statement textarea is hidden');
      failures.push('Statement textarea hidden in kiosk mode');
    }

    // Start button should be visible
    const startBtnVisible = await page.evaluate(() => {
      const el = document.querySelector('#btnStartDebate');
      return el ? el.offsetParent !== null : false;
    });
    if (startBtnVisible) {
      console.log('  ✓ Start Debate button is visible');
    } else {
      console.log('  ❌ FAIL: Start Debate button is hidden');
      failures.push('Start Debate button hidden in kiosk mode');
    }

    // Fetch buttons should be hidden (parent .side-card is hidden in kiosk)
    const fetchBtnVisible = await page.evaluate(() => {
      const cardA = document.querySelector('.side-card');
      const cardB = document.querySelectorAll('.side-card')[1];
      // offsetParent is null for elements hidden by display:none
      return (cardA && cardA.offsetParent !== null) ||
             (cardB && cardB.offsetParent !== null);
    });
    if (!fetchBtnVisible) {
      console.log('  ✓ Fetch model buttons are hidden');
    } else {
      console.log('  ❌ FAIL: Fetch model buttons are visible in kiosk mode');
      failures.push('Fetch model buttons visible in kiosk mode');
    }

    // ── Test 4: Full debate flow in kiosk mode ──
    console.log('\n=== Test 4: Full debate flow in kiosk mode ===');

    // Fill statement
    console.log('  Filling statement...');
    await page.fill('#statement', 'Kiosk mode is the future of debate');

    // Start debate (only statement needed in kiosk mode)
    console.log('  Starting debate...');
    await page.click('#btnStartDebate');

    // Wait for debate phase
    await page.waitForSelector('#phase-debate', { state: 'visible', timeout: DEBATE_TIMEOUT });
    console.log('  ✓ Debate phase visible');

    // Wait for all 6 turns
    console.log('  Waiting for all 6 debate turns...');
    await page.waitForFunction(
      `document.querySelectorAll('#debateStream .message').length >= 6`,
      {},
      { timeout: DEBATE_TIMEOUT }
    );
    console.log('  ✓ All 6 debate turns complete');

    // In kiosk mode with pre-configured judge, auto-judge triggers
    // Judge-select phase should NOT appear
    let judgeSelectAppeared = false;
    const judgeSelectCheck = page.waitForSelector('#phase-judge-select', { state: 'visible', timeout: 30000 })
      .then(() => { judgeSelectAppeared = true; })
      .catch(() => { judgeSelectAppeared = false; });

    // Wait for verdict phase (auto-judge)
    await page.waitForSelector('#phase-verdict', { state: 'visible', timeout: DEBATE_TIMEOUT });
    await judgeSelectCheck;

    if (!judgeSelectAppeared) {
      console.log('  ✓ Judge-select phase did NOT appear (auto-judge triggered)');
    } else {
      console.log('  ❌ FAIL: Judge-select phase appeared in kiosk mode (should be skipped)');
      failures.push('Judge-select phase appeared in kiosk mode');
    }
    console.log('  ✓ Verdict phase visible');

    // Wait for verdict to complete
    await page.waitForFunction(
      `document.querySelector('#verdictReasoning') && !document.querySelector('#verdictReasoning').classList.contains('streaming')`,
      {},
      { timeout: DEBATE_TIMEOUT }
    );
    console.log('  ✓ Verdict streaming complete');

    // Check winner
    const winner = await page.textContent('#verdictWinner');
    console.log(`  ✓ Winner: ${winner}`);

    // Wait for transcript
    await page.waitForFunction(
      `document.querySelectorAll('#transcriptStream .message').length >= 6`,
      {},
      { timeout: 30000 }
    );
    const transcriptCount = await page.$$eval('#transcriptStream .message', els => els.length);
    console.log(`  ✓ Transcript: ${transcriptCount} messages`);

    // ── Test 5: History disabled in kiosk mode ──
    console.log('\n=== Test 5: History disabled in kiosk mode ===');

    // History button should not be clickable (hidden)
    const historyBtn = await page.$('#btnHistory');
    if (!historyBtn) {
      console.log('  ✓ History button element not found (removed or hidden)');
    } else {
      const hVisible = await page.evaluate(() => {
        const el = document.querySelector('#btnHistory');
        return el ? el.offsetParent !== null : false;
      });
      if (!hVisible) {
        console.log('  ✓ History button is hidden');
      } else {
        console.log('  ❌ FAIL: History button is accessible in kiosk mode');
        failures.push('History button accessible in kiosk mode');
      }
    }

    // History overlay should not be accessible
    const historyOverlay = await page.$('#historyOverlay');
    if (historyOverlay) {
      const hOverlayVisible = await page.evaluate(() => {
        const el = document.querySelector('#historyOverlay');
        return el ? el.offsetParent !== null : false;
      });
      if (!hOverlayVisible) {
        console.log('  ✓ History overlay is hidden');
      } else {
        console.log('  ❌ FAIL: History overlay is visible in kiosk mode');
        failures.push('History overlay visible in kiosk mode');
      }
    } else {
      console.log('  ✓ History overlay element not found');
    }

    // ── Final summary ──
    console.log('\n=== TEST RESULTS ===');
    console.log(`  Console errors: ${consoleErrors.length}`);
    if (consoleErrors.length > 0) {
      for (const e of consoleErrors) console.log(`    ❌ ${e}`);
    }
    console.log(`  Winner: ${winner || 'N/A'}`);
    console.log(`  Transcript messages: ${transcriptCount}`);
    if (failures.length > 0) {
      console.log(`  Failures: ${failures.length}`);
      for (const f of failures) console.log(`    ❌ ${f}`);
    } else {
      console.log('  ✅ All kiosk mode checks passed');
    }

    const hasRuntimeErrors = consoleErrors.some(e => e.includes('Worker error') || e.includes('Uncaught') || e.includes('is not a function'));
    const hasTurnFailures = transcriptCount < 6;
    const hasWinnerFailures = !winner || !winner.includes('Negative');

    if (failures.length > 0) {
      console.log(`\n❌ FAIL: ${failures.join('; ')}`);
      await browser.close();
      server.kill();
      process.exit(1);
    } else if (hasRuntimeErrors) {
      console.log('\n❌ FAIL: Runtime errors detected');
      await browser.close();
      server.kill();
      process.exit(1);
    } else if (hasTurnFailures) {
      console.log('\n❌ FAIL: Not all debate turns completed');
      await browser.close();
      server.kill();
      process.exit(1);
    } else if (hasWinnerFailures) {
      console.log('\n❌ FAIL: Unexpected winner');
      await browser.close();
      server.kill();
      process.exit(1);
    } else {
      console.log('\n✅ PASS: Full kiosk mode debate flow completed successfully');
    }

    await browser.close();
  } catch (err) {
    console.error(`\n❌ TEST FAILED: ${err.message}`);
    console.error(err.stack);
  } finally {
    server.kill();
  }

  process.exit(failures.length > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
