/**
 * Data-driven DOM binding layer.
 *
 * Replaces manual `$('id').value = val` resets with a declarative
 * configuration that maps DOM elements to state properties.
 *
 * Usage:
 *   syncStateToDom(state)   — push all state values into DOM elements
 *   syncDomToState(state)   — read all DOM elements and update state
 *   resetDomToDefaults()    — reset all DOM elements to their defaults
 *   readField(state, id)    — read a single field's value from the DOM
 *   writeField(state, id)   — write a single field's value to the DOM
 */

import { $ } from './helpers';
import type { AppState } from '../state/app-state';
import { getConfig } from '../config';

// ── Field binding definition ──────────────────────────────────────

type ElementType = 'input' | 'select' | 'textarea' | 'button' | 'div';

interface FieldBinding {
  /** DOM element ID */
  id: string;
  /** Element type for casting */
  type: ElementType;
  /** Default value (string for display, undefined means leave untouched) */
  defaultValue?: string;
  /** Whether the element starts disabled */
  defaultDisabled?: boolean;
  /** Whether the element starts hidden */
  defaultHidden?: boolean;
  /** Custom reset logic (e.g., innerHTML, class toggles) */
  resetDom?: (el: Element) => void;
  /** Read value from DOM into state (returns value to set) */
  readDom?: (el: Element) => unknown;
  /** Write value from state into DOM */
  writeDom?: (el: Element, value: unknown) => void;
  /** Phase this field belongs to ('setup', 'judge-select', 'debate', 'verdict') */
  phase?: string;
}

// ── Setup phase field bindings ────────────────────────────────────

export const SETUP_BINDINGS: FieldBinding[] = [
  // ── Statement ───────────────────────────────────────────────────
  {
    id: 'statement',
    type: 'textarea',
    defaultValue: '',
  },

  // ── The Affirmative ─────────────────────────────────────────────
  {
    id: 'endpointA',
    type: 'input',
    defaultValue: '',
  },
  {
    id: 'apiKeyA',
    type: 'input',
    defaultValue: '',
  },
  {
    id: 'modelA',
    type: 'select',
    defaultValue: '',
    defaultDisabled: true,
    resetDom: (el) => {
      (el as HTMLSelectElement).innerHTML = '<option value="">— fetch models first —</option>';
      (el as HTMLSelectElement).disabled = true;
    },
  },

  // ── The Negative ────────────────────────────────────────────────
  {
    id: 'endpointB',
    type: 'input',
    defaultValue: '',
  },
  {
    id: 'apiKeyB',
    type: 'input',
    defaultValue: '',
  },
  {
    id: 'modelB',
    type: 'select',
    defaultValue: '',
    defaultDisabled: true,
    resetDom: (el) => {
      (el as HTMLSelectElement).innerHTML = '<option value="">— fetch models first —</option>';
      (el as HTMLSelectElement).disabled = true;
    },
  },

  // ── Judge (setup phase) ─────────────────────────────────────────
  {
    id: 'endpointJudge',
    type: 'input',
    defaultValue: '',
  },
  {
    id: 'apiKeyJudge',
    type: 'input',
    defaultValue: '',
  },
  {
    id: 'judgeModelSelect',
    type: 'select',
    defaultValue: '',
    defaultDisabled: true,
    resetDom: (el) => {
      (el as HTMLSelectElement).innerHTML = '<option value="">— fetch models first —</option>';
      (el as HTMLSelectElement).disabled = true;
    },
  },

  // ── Model info divs (hidden by default) ─────────────────────────
  {
    id: 'modelsA',
    type: 'div',
    defaultHidden: true,
    resetDom: (el) => el.classList.add('hidden'),
  },
  {
    id: 'modelsB',
    type: 'div',
    defaultHidden: true,
    resetDom: (el) => el.classList.add('hidden'),
  },
  {
    id: 'modelsJudge',
    type: 'div',
    defaultHidden: true,
    resetDom: (el) => el.classList.add('hidden'),
  },

  // ── Advanced settings: prompts ──────────────────────────────────
  {
    id: 'promptA',
    type: 'textarea',
    defaultValue: '',
  },
  {
    id: 'promptB',
    type: 'textarea',
    defaultValue: '',
  },
  {
    id: 'promptJudge',
    type: 'textarea',
    defaultValue: '',
  },

  // ── Advanced settings: debater params ───────────────────────────
  {
    id: 'temperature',
    type: 'input',
    defaultValue: '0.7',
  },
  {
    id: 'topP',
    type: 'input',
    defaultValue: '',
  },
  {
    id: 'topK',
    type: 'input',
    defaultValue: '',
  },
  {
    id: 'maxTokens',
    type: 'input',
    defaultValue: '',
  },

  // ── Advanced settings: judge params ─────────────────────────────
  {
    id: 'judgeTemperature',
    type: 'input',
    defaultValue: '0.5',
  },
  {
    id: 'judgeTopP',
    type: 'input',
    defaultValue: '',
  },
  {
    id: 'judgeTopK',
    type: 'input',
    defaultValue: '',
  },
  {
    id: 'judgeMaxTokens',
    type: 'input',
    defaultValue: '',
  },

  // ── Advanced settings panel ─────────────────────────────────────
  {
    id: 'advancedSettingsPanel',
    type: 'div',
    defaultHidden: true,
    resetDom: (el) => el.classList.add('hidden'),
  },
  {
    id: 'btnAdvancedToggle',
    type: 'button',
    resetDom: (el) => { el.innerHTML = '⚙️ Advanced Settings'; },
  },

  // ── Start debate button ─────────────────────────────────────────
  {
    id: 'btnStartDebate',
    type: 'button',
    defaultDisabled: true,
    resetDom: (el) => {
      const btn = el as HTMLButtonElement;
      btn.disabled = true;
      btn.classList.add('btn-disabled');
      btn.setAttribute('aria-disabled', 'true');
      btn.innerHTML = '⚔️ Start Debate';
    },
  },
];

// ── Judge-select phase bindings ───────────────────────────────────

export const JUDGE_SELECT_BINDINGS: FieldBinding[] = [
  {
    id: 'endpointJudge2',
    type: 'input',
    defaultValue: '',
    phase: 'judge-select',
  },
  {
    id: 'apiKeyJudge2',
    type: 'input',
    defaultValue: '',
    phase: 'judge-select',
  },
  {
    id: 'judgeModelSelect2',
    type: 'select',
    defaultValue: '',
    defaultDisabled: true,
    phase: 'judge-select',
    resetDom: (el) => {
      (el as HTMLSelectElement).innerHTML = '<option value="">— fetch models first —</option>';
      (el as HTMLSelectElement).disabled = true;
    },
  },
  {
    id: 'modelsJudge2',
    type: 'div',
    defaultHidden: true,
    phase: 'judge-select',
    resetDom: (el) => el.classList.add('hidden'),
  },
  {
    id: 'btnStartJudge2',
    type: 'button',
    defaultDisabled: true,
    phase: 'judge-select',
    resetDom: (el) => {
      const btn = el as HTMLButtonElement;
      btn.disabled = true;
      btn.innerHTML = 'Render Verdict';
    },
  },
];

// ── Debate phase bindings ─────────────────────────────────────────

export const DEBATE_BINDINGS: FieldBinding[] = [
  {
    id: 'btnRetryTurn',
    type: 'button',
    phase: 'debate',
    resetDom: (el) => { (el as HTMLElement).style.display = 'none'; },
  },
  {
    id: 'btnRetryVerdict',
    type: 'button',
    phase: 'verdict',
    resetDom: (el) => { (el as HTMLElement).style.display = 'none'; },
  },
];

// ── Combined bindings (all phases) ────────────────────────────────

export const ALL_BINDINGS = [
  ...SETUP_BINDINGS,
  ...JUDGE_SELECT_BINDINGS,
  ...DEBATE_BINDINGS,
];

// ── Helper: cast element by type ──────────────────────────────────

function castElement(el: Element, type: ElementType): Element {
  // No-op — type is used only for documentation and TS narrowing
  return el;
}

// ── Core sync functions ───────────────────────────────────────────

/**
 * Reset all bound DOM elements to their default values.
 * Used by resetToSetup() to replace the manual wall of resets.
 */
export function resetDomToDefaults(bindings: FieldBinding[] = ALL_BINDINGS): void {
  for (const binding of bindings) {
    const el = $(binding.id);
    if (!el) continue;

    castElement(el, binding.type);

    if (binding.resetDom) {
      binding.resetDom(el);
    } else if (binding.type === 'input' || binding.type === 'textarea') {
      (el as HTMLInputElement | HTMLTextAreaElement).value = binding.defaultValue ?? '';
    } else if (binding.type === 'select') {
      (el as HTMLSelectElement).value = binding.defaultValue ?? '';
    }

    if (binding.defaultHidden && !binding.resetDom) {
      el.classList.add('hidden');
    }
    if (binding.defaultDisabled && !binding.resetDom) {
      (el as HTMLInputElement | HTMLSelectElement | HTMLButtonElement).disabled = true;
    }
  }
}

/**
 * Read values from DOM elements and update appState.
 * Primarily used when gathering form data for debate creation.
 */
export function syncDomToState(state: AppState, bindings: FieldBinding[] = SETUP_BINDINGS): void {
  for (const binding of bindings) {
    const el = $(binding.id);
    if (!el) continue;

    let value: unknown;
    if (binding.readDom) {
      value = binding.readDom(el);
    } else if (binding.type === 'input' || binding.type === 'textarea') {
      value = (el as HTMLInputElement | HTMLTextAreaElement).value;
    } else if (binding.type === 'select') {
      value = (el as HTMLSelectElement).value;
    } else {
      continue;
    }

    // Map field IDs to state properties
    const fieldMap: Record<string, (v: unknown) => void> = {
      statement: (v) => { if (state.debateData) state.debateData.statement = v as string; },
      endpointA: (v) => { if (state.debateData) state.debateData.endpointA = v as string; },
      apiKeyA: (v) => { /* not stored in state, only in session */ },
      endpointB: (v) => { if (state.debateData) state.debateData.endpointB = v as string; },
      apiKeyB: (v) => { /* not stored in state, only in session */ },
      endpointJudge: (v) => { if (state.debateData) state.debateData.endpointJudge = (v as string) || null; },
      apiKeyJudge: (v) => { /* not stored in state, only in session */ },
      promptA: (v) => { state.advancedSettings.promptA = v as string; },
      promptB: (v) => { state.advancedSettings.promptB = v as string; },
      promptJudge: (v) => { state.advancedSettings.promptJudge = v as string; },
      temperature: (v) => { state.advancedSettings.temperature = v === '' ? undefined : parseFloat(v as string); },
      topP: (v) => { state.advancedSettings.topP = v === '' ? undefined : parseFloat(v as string); },
      topK: (v) => { state.advancedSettings.topK = v === '' ? undefined : parseInt(v as string, 10); },
      maxTokens: (v) => { state.advancedSettings.maxTokens = v === '' ? undefined : parseInt(v as string, 10); },
      judgeTemperature: (v) => { state.advancedSettings.judgeTemperature = v === '' ? undefined : parseFloat(v as string); },
      judgeTopP: (v) => { state.advancedSettings.judgeTopP = v === '' ? undefined : parseFloat(v as string); },
      judgeTopK: (v) => { state.advancedSettings.judgeTopK = v === '' ? undefined : parseInt(v as string, 10); },
      judgeMaxTokens: (v) => { state.advancedSettings.judgeMaxTokens = v === '' ? undefined : parseInt(v as string, 10); },
    };

    const setter = fieldMap[binding.id];
    if (setter) setter(value);
  }
}

/**
 * Write state values back to DOM elements.
 * Used after session restore to populate the form.
 */
export function syncStateToDom(state: AppState, bindings: FieldBinding[] = SETUP_BINDINGS): void {
  for (const binding of bindings) {
    const el = $(binding.id);
    if (!el) continue;

    let value: unknown;
    if (binding.writeDom) {
      // Custom write handler
      const fieldMap: Record<string, () => unknown> = {
        statement: () => state.debateData?.statement ?? '',
        endpointA: () => state.debateData?.endpointA ?? '',
        apiKeyA: () => '', // not in state
        endpointB: () => state.debateData?.endpointB ?? '',
        apiKeyB: () => '', // not in state
        endpointJudge: () => state.debateData?.endpointJudge ?? '',
        apiKeyJudge: () => '', // not in state
        promptA: () => state.advancedSettings.promptA,
        promptB: () => state.advancedSettings.promptB,
        promptJudge: () => state.advancedSettings.promptJudge,
        temperature: () => state.advancedSettings.temperature,
        topP: () => state.advancedSettings.topP,
        topK: () => state.advancedSettings.topK,
        maxTokens: () => state.advancedSettings.maxTokens,
        judgeTemperature: () => state.advancedSettings.judgeTemperature,
        judgeTopP: () => state.advancedSettings.judgeTopP,
        judgeTopK: () => state.advancedSettings.judgeTopK,
        judgeMaxTokens: () => state.advancedSettings.judgeMaxTokens,
      };
      const getter = fieldMap[binding.id];
      if (getter) binding.writeDom(el, getter());
      continue;
    }

    // Default write: map field ID to state value
    const fieldMap: Record<string, () => unknown> = {
      statement: () => state.debateData?.statement ?? '',
      endpointA: () => state.debateData?.endpointA ?? '',
      apiKeyA: () => '',
      endpointB: () => state.debateData?.endpointB ?? '',
      apiKeyB: () => '',
      endpointJudge: () => state.debateData?.endpointJudge ?? '',
      apiKeyJudge: () => '',
      promptA: () => state.advancedSettings.promptA,
      promptB: () => state.advancedSettings.promptB,
      promptJudge: () => state.advancedSettings.promptJudge,
      temperature: () => state.advancedSettings.temperature,
      topP: () => state.advancedSettings.topP,
      topK: () => state.advancedSettings.topK,
      maxTokens: () => state.advancedSettings.maxTokens,
      judgeTemperature: () => state.advancedSettings.judgeTemperature,
      judgeTopP: () => state.advancedSettings.judgeTopP,
      judgeTopK: () => state.advancedSettings.judgeTopK,
      judgeMaxTokens: () => state.advancedSettings.judgeMaxTokens,
    };

    const getter = fieldMap[binding.id];
    if (!getter) continue;
    value = getter();

    if (binding.type === 'input' || binding.type === 'textarea') {
      (el as HTMLInputElement | HTMLTextAreaElement).value =
        value === undefined || value === null ? '' : String(value);
    } else if (binding.type === 'select') {
      (el as HTMLSelectElement).value = value ? String(value) : '';
    }
  }
}

/**
 * Gather advanced settings from DOM (convenience wrapper for setup.ts).
 */
export function gatherAdvancedSettingsFromDom(): {
  promptA: string;
  promptB: string;
  promptJudge: string;
  temperature: number | undefined;
  topP: number | undefined;
  topK: number | undefined;
  maxTokens: number | undefined;
  judgeTemperature: number | undefined;
  judgeTopP: number | undefined;
  judgeTopK: number | undefined;
  judgeMaxTokens: number | undefined;
} {
  const promptA = $('promptA') as HTMLTextAreaElement | null;
  const promptB = $('promptB') as HTMLTextAreaElement | null;
  const promptJudge = $('promptJudge') as HTMLTextAreaElement | null;
  const temperature = $('temperature') as HTMLInputElement | null;
  const topP = $('topP') as HTMLInputElement | null;
  const topK = $('topK') as HTMLInputElement | null;
  const maxTokens = $('maxTokens') as HTMLInputElement | null;
  const judgeTemperature = $('judgeTemperature') as HTMLInputElement | null;
  const judgeTopP = $('judgeTopP') as HTMLInputElement | null;
  const judgeTopK = $('judgeTopK') as HTMLInputElement | null;
  const judgeMaxTokens = $('judgeMaxTokens') as HTMLInputElement | null;

  return {
    promptA: promptA?.value.trim() || '',
    promptB: promptB?.value.trim() || '',
    promptJudge: promptJudge?.value.trim() || '',
    temperature: temperature?.value ? parseFloat(temperature.value) : undefined,
    topP: topP?.value ? parseFloat(topP.value) : undefined,
    topK: topK?.value ? parseInt(topK.value, 10) : undefined,
    maxTokens: maxTokens?.value ? parseInt(maxTokens.value, 10) : undefined,
    judgeTemperature: judgeTemperature?.value ? parseFloat(judgeTemperature.value) : undefined,
    judgeTopP: judgeTopP?.value ? parseFloat(judgeTopP.value) : undefined,
    judgeTopK: judgeTopK?.value ? parseInt(judgeTopK.value, 10) : undefined,
    judgeMaxTokens: judgeMaxTokens?.value ? parseInt(judgeMaxTokens.value, 10) : undefined,
  };
}
