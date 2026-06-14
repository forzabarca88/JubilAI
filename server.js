const app = require('./src/app');
const PORT = process.env.PORT || 3000;

const HOST = '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`\n🏛️  LLM Debate Arena running at http://localhost:${PORT}\n`);
  console.log(`  Also accessible on local network: http://<your-ip>:${PORT}\n`);
});
