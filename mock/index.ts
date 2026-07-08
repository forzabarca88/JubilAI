/** Mock server entry point */

import { createApp } from './app';
import config from '../shared/utils/config';
import { loadPersistedDebates } from '../shared/middleware/debates';
import { createClient, withTimeout } from '../server/utils/openai-client';
import { ValidateResponse } from '../shared/types/api';

/**
 * Discover endpoint groups from the kiosk config.
 * Finds all `endpoint*` keys and pairs them with their corresponding
 * `apiKey*` and `model*` keys using the shared suffix.
 */
function getKioskEndpointGroups(k: typeof config.kiosk) {
  const groups: Array<{ suffix: string; endpoint: string; apiKey: string | undefined; model: string | undefined }> = [];
  for (const key of Object.keys(k)) {
    if (key.startsWith('endpoint')) {
      const suffix = key.replace('endpoint', '');
      const apiKeyKey = `apiKey${suffix}` as keyof typeof k;
      const modelKey = `model${suffix}` as keyof typeof k;
      const endpoint = k[key as keyof typeof k] as string;
      const apiKey = k[apiKeyKey] as string | undefined;
      const model = k[modelKey] as string | undefined;
      groups.push({ suffix, endpoint, apiKey: apiKey || undefined, model: model || undefined });
    }
  }
  return groups;
}

/** Validate a single endpoint/model combination */
async function validateEndpoint(
  suffix: string,
  url: string,
  apiKey: string | undefined,
  model: string | undefined
): Promise<ValidateResponse> {
  console.log(`[Startup] Validating endpoint${suffix}: url=${url}, model=${model ?? 'none'}`);

  if (!url) {
    const result: ValidateResponse = { valid: false, error: `No endpoint configured (endpoint${suffix})`, models: [] };
    console.error(`[Startup] endpoint${suffix}: MISSING ENDPOINT`);
    return result;
  }

  try {
    const client = createClient(url, apiKey);
    const timeoutMs = config.debate.startupTimeoutMs;

    // Test connectivity + auth (with timeout)
    const models = await withTimeout(timeoutMs, () => client.models.list());
    const modelIds = models.data.map((m: { id: string }) => m.id);
    console.log(`[Startup] endpoint${suffix}: reachable, ${modelIds.length} models available`);

    if (modelIds.length === 0) {
      const result: ValidateResponse = { valid: false, error: `endpoint${suffix}: returned no models`, models: [] };
      console.error(`[Startup] endpoint${suffix}: reachable but returned NO models`);
      return result;
    }

    // Verify specific model exists
    if (model) {
      if (!modelIds.includes(model)) {
        const result: ValidateResponse = {
          valid: false,
          error: `endpoint${suffix}: model "${model}" not found. Available: ${modelIds.slice(0, 5).join(', ')}${modelIds.length > 5 ? '...' : ''}`,
          models: modelIds,
        };
        console.error(`[Startup] endpoint${suffix}: model "${model}" NOT FOUND`);
        return result;
      }
      console.log(`[Startup] endpoint${suffix}: model "${model}" exists`);
    }

    const result: ValidateResponse = { valid: true, models: modelIds, model };
    console.log(`[Startup] endpoint${suffix}: VALID ✓`);
    return result;
  } catch (err) {
    const result: ValidateResponse = {
      valid: false,
      error: `endpoint${suffix}: connection failed — ${(err as Error).message}`,
      models: [],
    };
    console.error(`[Startup] endpoint${suffix}: CONNECTION FAILED — ${(err as Error).message}`);
    return result;
  }
}

/** Validate all kiosk endpoints */
async function validateKioskEndpoints(): Promise<boolean> {
  const k = config.kiosk;
  if (!k.enabled) return true;

  console.log('\n[Startup] Kiosk mode enabled — validating endpoints...');

  const groups = getKioskEndpointGroups(k);
  const results = await Promise.all(
    groups.map(g => validateEndpoint(g.suffix, g.endpoint, g.apiKey, g.model))
  );

  const failures = results.filter(r => !r.valid);
  const successes = results.filter(r => r.valid);

  console.log(`\n[Startup] Validation complete: ${successes.length} passed, ${failures.length} failed\n`);

  if (failures.length > 0) {
    console.error('[Startup] FAILED endpoints:');
    for (const f of failures) {
      console.error(`  ✗ ${f.error}`);
    }
    console.error('');
  }

  return failures.length === 0;
}

const app = createApp(config);
loadPersistedDebates();
const PORT = parseInt(process.env.PORT || String(config.app.mockPort), 10);
const HOST = config.app.host;

// Mock server: listen first, then validate (kiosk endpoints may point to itself)
const httpServer = app.listen(PORT, HOST, async () => {
  console.log(`\n🧪 Mock ${config.app.name} running at http://localhost:${PORT}`);
  console.log('  Also accessible on local network: http://<your-ip>:${PORT}');
  console.log('  This is a mock server for UI validation.');
  console.log('  No real LLM endpoints are needed.\n');

  // Validate kiosk endpoints after the server is listening
  const valid = await validateKioskEndpoints();
  if (!valid) {
    console.error('\n[Startup] Kiosk validation FAILED — shutting down\n');
    httpServer.close(() => process.exit(1));
    return;
  }

  console.log('  Quick start:');
  console.log(`    1. Open http://localhost:${PORT} (or http://<your-ip>:${PORT} from another device)`);
  console.log(`    2. Enter any statement (e.g., "AI will surpass human intelligence")`);
  console.log(`    3. The Affirmative: endpoint = http://localhost:${PORT}, pick any model`);
  console.log(`    4. The Negative: endpoint = http://localhost:${PORT}, pick any model`);
  console.log(`    5. Judge:  endpoint = http://localhost:${PORT}, pick any model (optional)`);
  console.log(`    6. Click "Start Debate" — everything runs automatically\n`);
});
