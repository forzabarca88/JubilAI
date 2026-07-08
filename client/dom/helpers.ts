/**
 * Typed DOM utilities.
 * Replaces `dom-helpers.js`. Uses config for phase list and toast delay.
 */

import { getConfig } from '../config';

/**
 * Null-guard element lookup.
 * @returns HTMLElement | null
 */
export function $(id: string): HTMLElement | null {
  const el = document.getElementById(id);
  if (!el) console.warn(`[JubilAI] Element not found: ${id}`);
  return el;
}

/**
 * Switch the visible phase container.
 */
export function showPhase(name: string) {
  const config = getConfig();
  config.ui.phases.forEach(p => {
    const el = $(p);
    if (el) el.classList.toggle('active', p === name);
  });
  const badge = $('statusBadge');
  if (badge) {
    const isPostSetup = ['phase-debate', 'phase-judge-select', 'phase-verdict'].includes(name);
    if (isPostSetup) {
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }
}

/**
 * Show a toast notification.
 * @param msg - Message text
 * @param type - Toast type: 'info' | 'success' | 'error'
 */
export function showToast(msg: string, type: 'info' | 'success' | 'error' = 'info') {
  const toast = $('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.className = `toast ${type}`;
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => toast.classList.remove('show'), getConfig().ui.toastAutoDismissMs);
}

/** Scroll the debate stream to the bottom */
export function scrollToBottom() {
  const stream = $('debateStream');
  if (stream) stream.scrollTop = stream.scrollHeight;
}

/** Scroll the verdict reasoning to the bottom */
export function scrollVerdictToBottom() {
  const vr = $('verdictReasoning');
  if (vr) vr.scrollTop = vr.scrollHeight;
}

/**
 * Safely parse a JSON string, returning null on failure.
 * Used for SSE event parsing where fragmented events may produce invalid JSON.
 */
export function safeJsonParse(str: string): unknown | null {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}
