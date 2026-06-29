/** Real server entry point */

import { createApp } from './app';
import config from '../shared/utils/config';
import { loadPersistedDebates } from '../shared/middleware/debates';

const app = createApp();
loadPersistedDebates();
const PORT = parseInt(process.env.PORT || String(config.app.realPort), 10);
const HOST = config.app.host;

app.listen(PORT, HOST, () => {
  console.log(`\n🏛️  ${config.app.name} running at http://localhost:${PORT}\n`);
  console.log(`  Also accessible on local network: http://<your-ip>:${PORT}\n`);
});
