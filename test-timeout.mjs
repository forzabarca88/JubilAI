/** Test that withTimeout actually fires on hung operations */

import { withTimeout } from './dist/server/server/utils/openai-client.js';

async function testTimeout() {
  console.log('Test 1: Timeout should fire after 1s on a hung promise...');
  const hungPromise = () => new Promise(resolve => setTimeout(resolve, 30000)); // 30s hang

  const start = Date.now();
  try {
    await withTimeout(1000, hungPromise);
    console.log('FAIL: Promise resolved without timeout');
    process.exit(1);
  } catch (err) {
    const elapsed = Date.now() - start;
    if (err.message.includes('Timeout after 1000ms')) {
      console.log(`PASS: Timeout fired after ${elapsed}ms (expected ~1000ms)`);
    } else {
      console.log(`FAIL: Wrong error: ${err.message}`);
      process.exit(1);
    }
  }

  console.log('\nTest 2: Fast promise should resolve before timeout...');
  const fastPromise = () => new Promise(resolve => {
    setTimeout(() => resolve('done'), 100);
  });

  const start2 = Date.now();
  try {
    const result = await withTimeout(5000, fastPromise);
    const elapsed2 = Date.now() - start2;
    console.log(`PASS: Resolved with "${result}" after ${elapsed2}ms`);
  } catch (err) {
    console.log(`FAIL: Timed out on fast promise: ${err.message}`);
    process.exit(1);
  }

  console.log('\nTest 3: Rejected promise should propagate rejection...');
  const rejectPromise = () => new Promise((_, reject) => {
    setTimeout(() => reject(new Error('custom error')), 100);
  });

  try {
    await withTimeout(5000, rejectPromise);
    console.log('FAIL: Promise resolved when it should reject');
    process.exit(1);
  } catch (err) {
    if (err.message === 'custom error') {
      console.log('PASS: Rejection propagated correctly');
    } else {
      console.log(`FAIL: Wrong error: ${err.message}`);
      process.exit(1);
    }
  }

  console.log('\n✅ All timeout tests passed');
}

testTimeout().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
