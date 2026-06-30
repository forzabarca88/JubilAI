/** Mock server entry point */

import { createApp } from './app';
import config from '../shared/utils/config';
import { loadPersistedDebates } from '../shared/middleware/debates';

const app = createApp(config);
loadPersistedDebates();
const PORT = parseInt(process.env.PORT || String(config.app.mockPort), 10);
const HOST = config.app.host;

app.listen(PORT, HOST, () => {
  console.log(`\n🧪 Mock ${config.app.name} running at http://localhost:${PORT}\n`);
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
