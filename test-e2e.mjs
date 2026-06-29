/** End-to-end test: full debate flow on mock server using Playwright */

import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const MOCK_PORT = 3001;
const MOCK_SERVER = join(__dirname, 'dist/server/mock/index.js');

// Mock timing: 300ms gen delay + 15ms*chunk delays per turn, plus 1500ms auto-advance
// With TTS enabled: Kokoro WASM generation adds significant time in headless Chromium
// Each turn: ~300ms mock delay + streaming + TTS sentence generation (5-15s each in headless)
// 6 turns + verdict ≈ ~120s total with TTS. Give generous timeout.
const DEBATE_TIMEOUT = 180_000;

async function startMockServer() {
  console.log('Starting mock server...');
  const server = spawn('node', [MOCK_SERVER], {
    cwd: __dirname,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const stdout = [];
  server.stdout.on('data', (d) => stdout.push(d.toString()));
  server.stderr.on('data', (d) => stdout.push(d.toString()));

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      server.kill();
      reject(new Error(`Mock server failed to start: ${stdout.join('').trim()}`));
    }, 10000);

    const check = setInterval(() => {
      if (stdout.some(s => s.includes(`running at`))) {
        clearTimeout(timeout);
        clearInterval(check);
        resolve();
      }
    }, 200);
  });

  console.log(stdout.join('').trim());
  return server;
}

async function main() {
  const server = await startMockServer();
  const consoleErrors = [];
  const consoleLogs = [];

  const historyFailures = [];

  try {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(`[${msg.type()}] ${msg.text()}`);
      } else {
        consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
      }
    });
    page.on('pageerror', (err) => {
      consoleErrors.push(`[pageError] ${err.message}`);
    });

    console.log(`\nNavigating to http://localhost:${MOCK_PORT}...`);
    await page.goto(`http://localhost:${MOCK_PORT}`, { waitUntil: 'networkidle', timeout: 15000 });

    // Wait for app to initialize
    await page.waitForSelector('#phase-setup', { state: 'visible', timeout: 5000 });
    console.log('✓ Setup phase visible');

    // 1. Fill in statement
    console.log('1. Filling statement...');
    await page.fill('#statement', 'AI will surpass human intelligence by 2040');

    // 2. Fill endpoints (mock server itself)
    console.log('2. Filling endpoints...');
    await page.fill('#endpointA', `http://localhost:${MOCK_PORT}`);
    await page.fill('#endpointB', `http://localhost:${MOCK_PORT}`);

    // 3. Fetch models for Affirmative
    console.log('3. Fetching Affirmative models...');
    await page.click('#btnFetchA');
    await page.waitForSelector('#modelsA', { state: 'visible', timeout: 5000 });
    console.log('✓ Affirmative models fetched');

    // 4. Fetch models for Negative
    console.log('4. Fetching Negative models...');
    await page.click('#btnFetchB');
    await page.waitForSelector('#modelsB', { state: 'visible', timeout: 5000 });
    console.log('✓ Negative models fetched');

    // 5. Select models
    console.log('5. Selecting models...');
    await page.selectOption('#modelA', 'llama3.1:8b');
    await page.selectOption('#modelB', 'mistral:7b');

    // 6. Start debate (no judge pre-configured → goes to judge-select after debate)
    console.log('6. Starting debate...');
    await page.click('#btnStartDebate');

    // Wait for debate phase
    await page.waitForSelector('#phase-debate', { state: 'visible', timeout: DEBATE_TIMEOUT });
    console.log('✓ Debate phase visible');

    // Wait for all 6 turns to complete (3 per side)
    console.log('7. Waiting for all debate turns (6 total)...');
    await page.waitForFunction(
      `document.querySelectorAll('#debateStream .message').length >= 6`,
      {},
      { timeout: DEBATE_TIMEOUT }
    );
    console.log('✓ All 6 debate turns complete');

    // After debate completes without pre-configured judge, transitions to judge-select
    console.log('8. Waiting for judge-select phase...');
    await page.waitForSelector('#phase-judge-select', { state: 'visible', timeout: DEBATE_TIMEOUT });
    console.log('✓ Judge-select phase visible');

    // 9. Fetch models for judge
    console.log('9. Fetching judge models...');
    const endpointJudge2 = await page.$('#endpointJudge2');
    if (endpointJudge2) {
      await page.fill('#endpointJudge2', `http://localhost:${MOCK_PORT}`);
    }
    await page.click('#btnFetchJudge2');
    await page.waitForSelector('#modelsJudge2', { state: 'visible', timeout: 5000 });
    console.log('✓ Judge models fetched');

    // 10. Select judge model
    console.log('10. Selecting judge model...');
    await page.selectOption('#judgeModelSelect2', 'gemma:7b');

    // 11. Start judge
    console.log('11. Starting judge...');
    await page.click('#btnStartJudge2');

    // Wait for verdict phase
    await page.waitForSelector('#phase-verdict', { state: 'visible', timeout: DEBATE_TIMEOUT });
    console.log('✓ Verdict phase visible');

    // Wait for verdict to complete (streaming done)
    await page.waitForFunction(
      `document.querySelector('#verdictReasoning') && !document.querySelector('#verdictReasoning').classList.contains('streaming')`,
      {},
      { timeout: DEBATE_TIMEOUT }
    );
    console.log('✓ Verdict streaming complete');

    // Check winner (available immediately after streaming done)
    const winner = await page.textContent('#verdictWinner');
    console.log(`✓ Winner: ${winner}`);

    // Wait for transcript to render (renderTranscript is called immediately after verdict done, before TTS flush)
    await page.waitForFunction(
      `document.querySelectorAll('#transcriptStream .message').length >= 6`,
      {},
      { timeout: 30_000 }
    );
    console.log('✓ Transcript rendered');

    const transcriptMessages = await page.$$eval('#transcriptStream .message', els => els.length);
    console.log(`✓ Transcript: ${transcriptMessages} messages`);

    // ── History feature validation ──────────────────────────────

    // 12. Verify history button exists in nav
    console.log('12. Checking history button...');
    const historyBtn = await page.$('#btnHistory');
    if (!historyBtn) {
      console.log('  ❌ FAIL: #btnHistory not found in nav');
      historyFailures.push('Missing #btnHistory button');
    } else {
      console.log('✓ History button present');
    }

    // 13. Verify history overlay panel exists (hidden by default)
    const historyOverlay = await page.$('#historyOverlay');
    if (!historyOverlay) {
      console.log('  ❌ FAIL: #historyOverlay not found');
      historyFailures.push('Missing #historyOverlay panel');
    } else {
      const isHidden = await historyOverlay.getAttribute('class');
      if (isHidden?.includes('hidden')) {
        console.log('✓ History overlay exists and is hidden by default');
      } else {
        console.log('  ⚠ History overlay visible on setup phase (unexpected)');
      }
    }

    // 14. Verify GET /api/debates endpoint returns the completed debate
    console.log('13. Checking GET /api/debates endpoint...');
    const listRes = await page.evaluate(async () => {
      const r = await fetch('/api/debates');
      return {
        status: r.status,
        ok: r.ok,
        body: r.status === 200 ? await r.json() : null
      };
    });
    if (listRes.status === 404) {
      console.log('  ❌ FAIL: GET /api/debates returned 404 (endpoint missing)');
      historyFailures.push('GET /api/debates endpoint not implemented');
    } else if (listRes.ok && listRes.body?.debates && Array.isArray(listRes.body.debates)) {
      const debateCount = listRes.body.debates.length;
      console.log(`✓ GET /api/debates returned ${debateCount} debate(s)`);
      if (debateCount === 0) {
        console.log('  ⚠ No persisted debates found (persistence hook may be missing)');
        historyFailures.push('No debates persisted after completion');
      }
      // Verify the debate we just ran is in the list
      const hasOurDebate = listRes.body.debates.some(d =>
        d.statement === 'AI will surpass human intelligence by 2040'
      );
      if (hasOurDebate) {
        console.log('✓ Our debate is in the history list');
      } else if (debateCount > 0) {
        console.log('  ⚠ Our debate not found in list (mismatch)');
        historyFailures.push('Debate not found in history list');
      }
    } else {
      console.log(`  ❌ FAIL: GET /api/debates status=${listRes.status}`);
      historyFailures.push(`GET /api/debates returned status ${listRes.status}`);
    }

    // 15. Verify GET /api/debates/:id returns the full debate
    const debateId = await page.evaluate((debates) => {
      const d = debates.find(d => d.statement === 'AI will surpass human intelligence by 2040');
      return d ? d.id : null;
    }, listRes.body?.debates || []);
    if (debateId) {
      console.log('14. Checking GET /api/debates/:id...');
      const getRes = await page.evaluate(async (id) => {
        const r = await fetch(`/api/debates/${id}`);
        return {
          status: r.status,
          ok: r.ok,
          body: r.status === 200 ? await r.json() : null
        };
      }, debateId);
      if (getRes.ok && getRes.body) {
        const d = getRes.body;
        console.log(`✓ GET /api/debates/:id returned debate (phase=${d.phase}, messages=${d.messages?.length || 0})`);
        if (d.phase !== 'complete') {
          console.log('  ⚠ Debate phase is not "complete"');
        }
        if (d.messages?.length < 6) {
          console.log('  ⚠ Debate has fewer than 6 messages');
        }
        if (!d.verdict) {
          console.log('  ⚠ Debate has no verdict');
        }
      } else {
        console.log(`  ❌ FAIL: GET /api/debates/:id status=${getRes.status}`);
        historyFailures.push(`GET /api/debates/:id returned status ${getRes.status}`);
      }
    }

    // 16. Open history panel via UI
    if (historyBtn) {
      console.log('15. Opening history panel via UI...');
      await historyBtn.click();
      await page.waitForSelector('#historyOverlay', { state: 'visible', timeout: 5000 }).catch(() => {
        console.log('  ❌ FAIL: History overlay did not become visible');
        historyFailures.push('History overlay did not open on button click');
      });

      // Check for debate card in the list
      const historyCards = await page.$$('.history-card');
      console.log(`✓ History panel shows ${historyCards.length} card(s)`);

      // 17. Verify DELETE /api/debates/:id via UI
      if (historyCards.length > 0) {
        console.log('16. Testing delete via UI...');
        const deleteBtn = await page.$('.btn-delete-debate');
        if (deleteBtn) {
          // Click delete (may trigger confirmation)
          await deleteBtn.click();
          // Wait for confirmation toast if shown, then confirm
          const confirmToast = await page.$('.toast.show');
          if (confirmToast) {
            // Some implementations use confirm() dialog — try clicking OK
            const dialogPromise = new Promise(resolve => {
              page.on('dialog', dialog => { dialog.accept(); resolve(true); });
            });
            await Promise.race([dialogPromise, new Promise(r => setTimeout(r, 2000))]);
          }
          // Wait for toast to appear
          await page.waitForSelector('.toast.show', { timeout: 5000 }).catch(() => {});
          await new Promise(r => setTimeout(r, 1000));

          // Verify debate is gone from the list
          const cardsAfterDelete = await page.$$('.history-card');
          console.log(`  After delete: ${cardsAfterDelete.length} card(s) remaining`);

          // Verify via API that debate is gone
          if (debateId) {
            const deleteCheck = await page.evaluate(async (id) => {
              const r = await fetch(`/api/debates/${id}`);
              return r.status;
            }, debateId);
            if (deleteCheck === 404) {
              console.log('✓ Debate deleted successfully (404 on re-fetch)');
            } else {
              console.log(`  ❌ FAIL: Debate still exists after delete (status=${deleteCheck})`);
              historyFailures.push('DELETE /api/debates/:id did not remove debate');
            }
          }
        } else {
          console.log('  ❌ FAIL: No .btn-delete-debate found in history card');
          historyFailures.push('Missing delete button in history card');
        }
      }

      // Close history panel
      console.log('17. Closing history panel...');
      await page.click('#btnCloseHistory');
      await page.waitForSelector('#historyOverlay', { state: 'hidden', timeout: 3000 }).catch(() => {
        console.log('  ❌ FAIL: History overlay did not close');
        historyFailures.push('History overlay did not close');
      });
      console.log('✓ History panel closed');
    }

    // Final summary
    console.log('\n=== TEST RESULTS ===');
    console.log(`  Console errors: ${consoleErrors.length}`);
    if (consoleErrors.length > 0) {
      for (const e of consoleErrors) console.log(`    ❌ ${e}`);
    }
    console.log(`  Console logs: ${consoleLogs.length}`);
    for (const l of consoleLogs) console.log(`    ${l}`);
    console.log(`  Winner: ${winner || 'N/A'}`);
    console.log(`  Transcript messages: ${transcriptMessages}`);
    if (historyFailures.length > 0) {
      console.log(`  History failures: ${historyFailures.length}`);
      for (const f of historyFailures) console.log(`    ❌ ${f}`);
    } else {
      console.log('  History: ✅ All checks passed');
    }

    const hasRuntimeErrors = consoleErrors.some(e => e.includes('Worker error') || e.includes('Uncaught'));
    const hasTurnFailures = transcriptMessages < 6;
    const hasWinnerFailures = !winner || !winner.includes('Negative');
    const hasHistoryFailures = historyFailures.length > 0;

    if (hasRuntimeErrors) {
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
    } else if (hasHistoryFailures) {
      console.log(`\n❌ FAIL: History feature — ${historyFailures.join('; ')}`);
      await browser.close();
      server.kill();
      process.exit(1);
    } else {
      console.log('\n✅ PASS: Full debate flow + history completed successfully');
    }

    await browser.close();
  } catch (err) {
    console.error(`\n❌ TEST FAILED: ${err.message}`);
    console.error(err.stack);
  } finally {
    server.kill();
  }

  const hasRuntimeErrors = consoleErrors.some(e => e.includes('Worker error') || e.includes('Uncaught'));
  const hasHistoryFailures = historyFailures.length > 0;
  process.exit(hasRuntimeErrors || hasHistoryFailures ? 1 : 0);
}

main().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
