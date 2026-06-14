const app = require('./mock/src/app');
const PORT = process.env.PORT || 3001;

const HOST = '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`\n🧪 Mock LLM Debate Arena running at http://localhost:${PORT}\n`);
  console.log('  Also accessible on local network: http://<your-ip>:${PORT}\n');
  console.log('  This is a mock server for UI validation.');
  console.log('  No real LLM endpoints are needed.\n');
  console.log('  Quick start:');
  console.log(`    1. Open http://localhost:${PORT} (or http://<your-ip>:${PORT} from another device)`);
  console.log(`    2. Enter any statement (e.g., "AI will surpass human intelligence")`);
  console.log(`    3. The Affirmative: endpoint = http://localhost:${PORT}, pick any model`);
  console.log(`    4. The Negative: endpoint = http://localhost:${PORT}, pick any model`);
  console.log(`    5. Judge:  endpoint = http://localhost:${PORT}, pick any model (optional)`);
  console.log(`    6. Click "Start Debate" — everything runs automatically\n`);
});
