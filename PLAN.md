# Kiosk Mode Implementation Plan

## Goal

Add an optional "kiosk mode" where the user sees **only** the debate statement textarea and a "Start Debate" button. All other configuration (endpoints, API keys, model selections, judge settings, advanced parameters) is supplied via environment variables on the server.

## Environment Variables

| Variable | Required in Kiosk? | Maps to |
|---|---|---|
| `JUBILAI_KIOSK_MODE` | **Yes** (flag) | `"true"` enables kiosk mode |
| `JUBILAI_KIOSK_ENDPOINT_A` | Yes | Affirmative endpoint URL |
| `JUBILAI_KIOSK_API_KEY_A` | No (falls back to `debate.defaultApiKey`) | Affirmative API key |
| `JUBILAI_KIOSK_MODEL_A` | Yes | Affirmative model ID |
| `JUBILAI_KIOSK_ENDPOINT_B` | Yes | Negative endpoint URL |
| `JUBILAI_KIOSK_API_KEY_B` | No | Negative API key |
| `JUBILAI_KIOSK_MODEL_B` | Yes | Negative model ID |
| `JUBILAI_KIOSK_ENDPOINT_JUDGE` | No | Judge endpoint URL |
| `JUBILAI_KIOSK_API_KEY_JUDGE` | No | Judge API key |
| `JUBILAI_KIOSK_MODEL_JUDGE` | No | Judge model ID |
| `JUBILAI_KIOSK_PROMPT_A` | No | Custom affirmative system prompt |
| `JUBILAI_KIOSK_PROMPT_B` | No | Custom negative system prompt |
| `JUBILAI_KIOSK_PROMPT_JUDGE` | No | Custom judge system prompt |
| `JUBILAI_KIOSK_TEMPERATURE` | No | Debater temperature |
| `JUBILAI_KIOSK_TOP_P` | No | Debater topP |
| `JUBILAI_KIOSK_TOP_K` | No | Debater topK |
| `JUBILAI_KIOSK_MAX_TOKENS` | No | Debater maxTokens |
| `JUBILAI_KIOSK_JUDGE_TEMPERATURE` | No | Judge temperature |
| `JUBILAI_KIOSK_JUDGE_TOP_P` | No | Judge topP |
| `JUBILAI_KIOSK_JUDGE_TOP_K` | No | Judge topK |
| `JUBILAI_KIOSK_JUDGE_MAX_TOKENS` | No | Judge maxTokens |
| `JUBILAI_KIOSK_MAX_TURNS` | No | Override `debate.maxTurns` |

---

## Implementation Steps

### Step 1: Extend `config.json` and shared types ✅ DONE

**File: `config.json`** — Add a new `kiosk` section:

```json
"kiosk": {
  "enabled": false,
  "endpointA": "",
  "apiKeyA": "",
  "modelA": "",
  "endpointB": "",
  "apiKeyB": "",
  "modelB": "",
  "endpointJudge": "",
  "apiKeyJudge": "",
  "modelJudge": "",
  "promptA": "",
  "promptB": "",
  "promptJudge": "",
  "temperature": null,
  "topP": null,
  "topK": null,
  "maxTokens": null,
  "judgeTemperature": null,
  "judgeTopP": null,
  "judgeTopK": null,
  "judgeMaxTokens": null,
  "maxTurns": null
}
```

**File: `shared/types/config.ts`** — Add `KioskConfig` interface:

```typescript
export interface KioskConfig {
  enabled: boolean;
  endpointA: string;
  apiKeyA: string;
  modelA: string;
  endpointB: string;
  apiKeyB: string;
  modelB: string;
  endpointJudge: string;
  apiKeyJudge: string;
  modelJudge: string;
  promptA: string;
  promptB: string;
  promptJudge: string;
  temperature: number | null;
  topP: number | null;
  topK: number | null;
  maxTokens: number | null;
  judgeTemperature: number | null;
  judgeTopP: number | null;
  judgeTopK: number | null;
  judgeMaxTokens: number | null;
  maxTurns: number | null;
}
```

Add `kiosk: KioskConfig` to `RootConfig`.

**File: `client/config.ts`** — Add `kiosk: KioskConfig` to `ClientConfig`.

### Step 2: Server-side config resolution from environment variables ✅ DONE

**File: `shared/utils/config.ts`** — After parsing `config.json`, overlay environment variables onto the `kiosk` section:

```typescript
function resolveKioskConfig(parsed: RootConfig): void {
  const env = process.env;
  const k = parsed.kiosk;

  k.enabled = env.JUBILAI_KIOSK_MODE === 'true';

  if (k.enabled) {
    k.endpointA = env.JUBILAI_KIOSK_ENDPOINT_A ?? k.endpointA;
    k.apiKeyA = env.JUBILAI_KIOSK_API_KEY_A ?? k.apiKeyA;
    k.modelA = env.JUBILAI_KIOSK_MODEL_A ?? k.modelA;
    k.endpointB = env.JUBILAI_KIOSK_ENDPOINT_B ?? k.endpointB;
    k.apiKeyB = env.JUBILAI_KIOSK_API_KEY_B ?? k.apiKeyB;
    k.modelB = env.JUBILAI_KIOSK_MODEL_B ?? k.modelB;
    k.endpointJudge = env.JUBILAI_KIOSK_ENDPOINT_JUDGE ?? k.endpointJudge;
    k.apiKeyJudge = env.JUBILAI_KIOSK_API_KEY_JUDGE ?? k.apiKeyJudge;
    k.modelJudge = env.JUBILAI_KIOSK_MODEL_JUDGE ?? k.modelJudge;
    k.promptA = env.JUBILAI_KIOSK_PROMPT_A ?? k.promptA;
    k.promptB = env.JUBILAI_KIOSK_PROMPT_B ?? k.promptB;
    k.promptJudge = env.JUBILAI_KIOSK_PROMPT_JUDGE ?? k.promptJudge;
    k.maxTurns = env.JUBILAI_KIOSK_MAX_TURNS ? parseInt(env.JUBILAI_KIOSK_MAX_TURNS, 10) : k.maxTurns;

    // Numeric fields — parse only if env var is set
    k.temperature = env.JUBILAI_KIOSK_TEMPERATURE ? parseFloat(env.JUBILAI_KIOSK_TEMPERATURE) : k.temperature;
    k.topP = env.JUBILAI_KIOSK_TOP_P ? parseFloat(env.JUBILAI_KIOSK_TOP_P) : k.topP;
    k.topK = env.JUBILAI_KIOSK_TOP_K ? parseInt(env.JUBILAI_KIOSK_TOP_K, 10) : k.topK;
    k.maxTokens = env.JUBILAI_KIOSK_MAX_TOKENS ? parseInt(env.JUBILAI_KIOSK_MAX_TOKENS, 10) : k.maxTokens;
    k.judgeTemperature = env.JUBILAI_KIOSK_JUDGE_TEMPERATURE ? parseFloat(env.JUBILAI_KIOSK_JUDGE_TEMPERATURE) : k.judgeTemperature;
    k.judgeTopP = env.JUBILAI_KIOSK_JUDGE_TOP_P ? parseFloat(env.JUBILAI_KIOSK_JUDGE_TOP_P) : k.judgeTopP;
    k.judgeTopK = env.JUBILAI_KIOSK_JUDGE_TOP_K ? parseInt(env.JUBILAI_KIOSK_JUDGE_TOP_K, 10) : k.judgeTopK;
    k.judgeMaxTokens = env.JUBILAI_KIOSK_JUDGE_MAX_TOKENS ? parseInt(env.JUBILAI_KIOSK_JUDGE_MAX_TOKENS, 10) : k.judgeMaxTokens;
  }
}
```

Call `resolveKioskConfig(parsed)` inside `loadConfig()` before validation. Add validation for required kiosk fields (`endpointA`, `modelA`, `endpointB`, `modelB`) when `kiosk.enabled === true`.

### Step 3: HTML — Add kiosk-mode class and conditional visibility ✅ DONE

**File: `public/index.html`** — Add `data-kiosk="false"` attribute to `<html>` (set dynamically by the server). Wrap non-kiosk elements in a container with a CSS class that hides them when kiosk mode is active.

Add a `<div class="setup-config-section">` wrapper around all non-statement elements in `#phase-setup` (the Affirmative card, Negative card, Judge card, Advanced Settings card, and model fetch buttons). The statement textarea and start button remain outside this wrapper.

**File: `public/css/styles.css`** — Add:

```css
html[data-kiosk="true"] .setup-config-section {
  display: none;
}

html[data-kiosk="true"] #phase-setup .briefing-grid {
  display: block;
}

html[data-kiosk="true"] #phase-setup .briefing-card {
  grid-column: span 1;
}

html[data-kiosk="true"] .arena-nav #btnHistory {
  display: none;
}

html[data-kiosk="true"] #phase-judge-select {
  display: none !important;
}
```

The `data-kiosk` attribute is set server-side in `server/app.ts` by injecting it into the HTML response or by serving a kiosk-specific HTML variant.

**Approach for setting `data-kiosk`**: In `server/app.ts`, intercept the static HTML serve and inject the attribute:

```typescript
// In createApp(), before express.static('public'):
if (config.kiosk.enabled) {
  const fs = require('fs');
  const htmlPath = path.join(__dirname, '../../public/index.html');
  app.get('/', (req, res) => {
    let html = fs.readFileSync(htmlPath, 'utf-8');
    html = html.replace('<html lang="en">', '<html lang="en" data-kiosk="true">');
    res.send(html);
  });
}
```

### Step 4: Client config — Pass kiosk flag to the frontend ✅ DONE

**File: `client/config.ts`** — The `ClientConfig` already includes `kiosk: KioskConfig` from the `/config.json` endpoint. The server's `config.json` response already includes the resolved kiosk config (env-overridden).

**File: `client/index.ts`** — After `loadConfig()` resolves, check `getConfig().kiosk.enabled`. If true, call a new `initKioskMode(appState)` before initializing normal phases.

### Step 5: Client kiosk initialization ✅ DONE

**New file: `client/phases/kiosk.ts`** — Contains `initKioskMode(state: AppState)`:

```typescript
export function initKioskMode(state: AppState) {
  const config = getConfig();
  const k = config.kiosk;

  // Populate state directly from kiosk config
  state.maxTurns = k.maxTurns ?? config.debate.maxTurns;

  state.debateData = {
    statement: '',
    modelA: k.modelA,
    modelB: k.modelB,
    endpointA: k.endpointA,
    endpointB: k.endpointB,
    endpointJudge: k.endpointJudge || null,
    messages: [],
    nextSpeaker: null,
    countA: 0,
    countB: 0,
    phase: 'debating' as DebatePhase,
    judgeModel: k.modelJudge || null,
  };

  state.autoJudge = !!(k.modelJudge && k.endpointJudge);
  state.advancedSettings = {
    promptA: k.promptA || '',
    promptB: k.promptB || '',
    promptJudge: k.promptJudge || '',
    temperature: k.temperature,
    topP: k.topP,
    topK: k.topK,
    maxTokens: k.maxTokens,
    judgeTemperature: k.judgeTemperature,
    judgeTopP: k.judgeTopP,
    judgeTopK: k.judgeTopK,
    judgeMaxTokens: k.judgeMaxTokens,
  };

  // Mark the start button as ready (only statement is needed)
  const btn = $('btnStartDebate');
  if (btn) {
    btn.classList.remove('btn-disabled');
    btn.setAttribute('aria-disabled', 'false');
    (btn as unknown as Record<string, unknown>)._missing = [];
  }

  // Set statement textarea placeholder to hint kiosk mode
  const stmt = $('statement');
  if (stmt) {
    (stmt as HTMLTextAreaElement).placeholder = 'Enter your debate statement...';
  }
}
```

### Step 6: Modify `checkSetupReady` for kiosk mode ✅ DONE

**File: `client/phases/setup.ts`** — In `checkSetupReady(state)`, add an early return when kiosk mode is active:

```typescript
function checkSetupReady(state: AppState) {
  const config = getConfig();
  if (config.kiosk.enabled) {
    const stmt = $('statement');
    const btn = $('btnStartDebate');
    const hasStatement = stmt && (stmt as HTMLTextAreaElement).value.trim().length > 0;
    if (btn) {
      btn.classList.toggle('btn-disabled', !hasStatement);
      btn.setAttribute('aria-disabled', hasStatement ? 'false' : 'true');
    }
    if (btn) (btn as unknown as Record<string, unknown>)._missing = hasStatement ? [] : ['Statement'];
    return;
  }
  // ... existing logic unchanged ...
}
```

### Step 7: Modify the "Start Debate" click handler for kiosk mode ✅ DONE

**File: `client/phases/setup.ts`** — In the `btnStartDebate` click handler, detect kiosk mode and construct the `DebateCreateBody` from config instead of DOM:

```typescript
$('btnStartDebate')?.addEventListener('click', async () => {
  // ... existing disabled-check ...

  const config = getConfig();
  let body: DebateCreateBody;

  if (config.kiosk.enabled) {
    const stmt = $('statement') as HTMLTextAreaElement | null;
    const statement = stmt?.value.trim() || '';
    if (!statement) { showToast('Please enter a statement', 'error'); return; }

    body = {
      statement,
      modelA: config.kiosk.modelA,
      modelB: config.kiosk.modelB,
      endpointA: config.kiosk.endpointA,
      apiKeyA: config.kiosk.apiKeyA || undefined,
      endpointB: config.kiosk.endpointB,
      apiKeyB: config.kiosk.apiKeyKeyB || undefined,
      judgeModel: config.kiosk.modelJudge || undefined,
      endpointJudge: config.kiosk.endpointJudge || undefined,
      apiKeyJudge: config.kiosk.apiKeyJudge || undefined,
      promptA: config.kiosk.promptA || undefined,
      promptB: config.kiosk.promptB || undefined,
      promptJudge: config.kiosk.promptJudge || undefined,
      temperature: config.kiosk.temperature,
      topP: config.kiosk.topP,
      topK: config.kiosk.topK,
      maxTokens: config.kiosk.maxTokens,
      judgeTemperature: config.kiosk.judgeTemperature,
      judgeTopP: config.kiosk.judgeTopP,
      judgeTopK: config.kiosk.judgeTopK,
      judgeMaxTokens: config.kiosk.judgeMaxTokens,
    };

    // Set state from kiosk config
    state.advancedSettings = {
      promptA: config.kiosk.promptA || '',
      promptB: config.kiosk.promptB || '',
      promptJudge: config.kiosk.promptJudge || '',
      temperature: config.kiosk.temperature,
      topP: config.kiosk.topP,
      topK: config.kiosk.topK,
      maxTokens: config.kiosk.maxTokens,
      judgeTemperature: config.kiosk.judgeTemperature,
      judgeTopP: config.kiosk.judgeTopP,
      judgeTopK: config.kiosk.judgeTopK,
      judgeMaxTokens: config.kiosk.judgeMaxTokens,
    };
  } else {
    // ... existing DOM-gathering logic unchanged ...
  }

  // ... rest of handler (createDebate, save, transition) unchanged ...
});
```

### Step 8: Disable session storage in kiosk mode ✅ DONE

**File: `client/session/session-storage.ts`** — In `save()` and `restore()`, skip entirely when `getConfig().kiosk.enabled` is true. Kiosk deployments don't need cross-session persistence, and storing API keys in browser storage defeats the purpose of server-side management.

### Step 9: Disable history panel in kiosk mode ✅ DONE

**File: `client/phases/history.ts`** — In `initHistoryPanel()`, return early if `getConfig().kiosk.enabled`. Also hide the nav history button via CSS (Step 3).

### Step 10: Handle "New Dispute" / reset in kiosk mode ✅ DONE

**File: `client/app.ts`** — In `resetToSetup()`, when kiosk mode is active:
- Do NOT clear kiosk-provided state fields (`debateData.modelA`, `debateData.endpointA`, etc.)
- Do NOT reset advanced settings (they come from config, not DOM)
- Only clear: `debateId`, `debateData.messages`, `debateData.phase`, `countA/B`, `currentSpeaker`, `isStreaming`, `autoJudge`, TTS state
- Reset the statement textarea to empty
- Re-apply kiosk config values to state

### Step 11: Skip judge-select phase in kiosk mode (when judge is pre-configured) ✅ DONE

**File: `client/phases/debate.ts`** — In the `executeNextTurn` handler, when `data.debateComplete` and `data.autoJudge` is true, proceed directly to verdict. When `data.autoJudge` is false (no judge pre-configured), the existing `transitionToJudgeSelect` path is still valid since the judge-select phase DOM is hidden in kiosk mode — but the behavior should be: if kiosk mode is active AND no judge is pre-configured, show a toast "No judge configured — debate complete" and stay on the debate phase instead of transitioning to a hidden judge-select phase.

### Step 12: Server-side config.json endpoint includes kiosk config ✅ DONE

**File: `server/app.ts`** — The existing `/config.json` route serves the file directly. Change it to serve the resolved config (with env overrides applied):

```typescript
app.get('/config.json', (req, res) => {
  res.json(config);  // sends the resolved config including kiosk section
});
```

This ensures the client receives the environment-resolved kiosk settings.

---

## Refactor Risk Assessment

### High Risk

1. **`server/app.ts` — `/config.json` route change**: Currently serves the file directly via `sendFile`. Switching to `res.json(config)` changes the response from a static file to a dynamically generated JSON. This could break if any code assumes the file path. Mitigation: the client already fetches `/config.json` and parses JSON, so this is safe.

2. **`client/phases/setup.ts` — Start debate handler**: Splitting into kiosk/non-kiosk branches doubles the complexity of the most critical user flow. Risk of divergence between branches over time. Mitigation: extract the common post-body logic (createDebate call, state update, phase transition) into a shared helper function.

3. **`client/app.ts` — `resetToSetup()` kiosk-aware logic**: This function already has ~100 lines of DOM resets. Adding kiosk-specific conditional logic makes it harder to maintain. Mitigation: extract kiosk reset into a separate `resetToSetupKiosk()` function.

### Medium Risk

4. **`shared/utils/config.ts` — env overlay**: Adding environment variable resolution to the config loader changes its contract from "read file" to "read file + merge env". Existing code that expects config to be purely file-based could break. Mitigation: the overlay only affects the new `kiosk` section, leaving all existing config sections untouched.

5. **CSS hiding via `data-kiosk` attribute**: Injecting `data-kiosk="true"` into the HTML at serve-time means the HTML file on disk differs from what the browser receives. This is fine for the real server but could confuse the mock server or dev mode. Mitigation: apply the attribute only in `server/app.ts`, not in `mock/app.ts`.

6. **Session storage interaction**: Kiosk mode disables session persistence, but the existing `sessionStorage` module is imported by multiple phases. If `restore()` is called during kiosk init and returns stale data, it could overwrite kiosk-provided values. Mitigation: add an early return in `restore()` and `save()` when `getConfig().kiosk.enabled` is true.

### Low Risk

7. **`client/phases/judge-select.ts` — CSS hiding**: The judge-select phase DOM is hidden via CSS but still exists in the HTML. If JS code tries to interact with hidden elements, it could cause confusing behavior. Mitigation: add JS guards in `transitionToJudgeSelect()` to skip the transition entirely in kiosk mode when no judge is pre-configured.

8. **TTS interaction**: TTS initialization and voice assignment happens after debate start. In kiosk mode, this flow is unchanged — the TTS manager doesn't depend on setup-phase DOM elements. No risk.

9. **History panel**: Disabling the history panel in kiosk mode is straightforward — just hide the button and skip `initHistoryPanel()`. No cascading effects.

---

## Testing Strategy

1. **Environment variable validation**: Write tests that verify the config loader correctly overlays env vars onto the kiosk section, including type coercion (numbers) and fallback behavior.

2. **Kiosk setup phase**: Use Playwright to verify:
   - Config input fields are hidden
   - Only statement textarea + start button visible
   - Start button enabled when statement is non-empty
   - Start button disabled when statement is empty
   - Debate creation uses kiosk config values (verify via network request inspection)

3. **Non-kiosk mode regression**: Run the full E2E test suite (`node test-e2e.mjs`) against the mock server to confirm normal operation is unchanged.

4. **Reset in kiosk mode**: Verify that "New Dispute" preserves kiosk config while clearing debate state.

5. **Judge-select skip**: In kiosk mode without pre-configured judge, verify the app shows a completion message instead of transitioning to a hidden phase.

---

## Files Modified (Summary)

| File | Change |
|---|---|
| `config.json` | Add `kiosk` section |
| `shared/types/config.ts` | Add `KioskConfig` interface; add to `RootConfig` |
| `shared/utils/config.ts` | Add `resolveKioskConfig()`; call from `loadConfig()`; add validation |
| `client/config.ts` | Add `kiosk: KioskConfig` to `ClientConfig` |
| `client/index.ts` | Check kiosk mode after config load; call `initKioskMode()` if enabled |
| `client/phases/kiosk.ts` | **New file** — `initKioskMode()` |
| `client/phases/setup.ts` | Kiosk-aware `checkSetupReady()`; kiosk-aware start-debate handler |
| `client/phases/debate.ts` | Skip `transitionToJudgeSelect` in kiosk mode when no judge configured |
| `client/phases/judge-select.ts` | Guard against hidden DOM interaction |
| `client/phases/history.ts` | Skip init in kiosk mode |
| `client/app.ts` | Kiosk-aware `resetToSetup()` |
| `client/session/session-storage.ts` | Skip save/restore in kiosk mode |
| `server/app.ts` | Inject `data-kiosk` attribute; serve resolved config JSON |
| `public/index.html` | Add `setup-config-section` wrapper |
| `public/css/styles.css` | Add kiosk-mode CSS rules |
