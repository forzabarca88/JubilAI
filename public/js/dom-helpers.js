/**
 * DOM helper with null guard.
 * @param {string} id - Element id
 * @returns {HTMLElement|null}
 */
const $ = id => {
  const el = document.getElementById(id);
  if (!el) console.warn(`[DebateArena] Element not found: ${id}`);
  return el;
};

/** All phase container ids */
const phases = ['phase-setup', 'phase-debate', 'phase-judge-select', 'phase-verdict'];

/**
 * Switch the visible phase.
 * @param {string} name - Phase id to activate
 */
function showPhase(name) {
  phases.forEach(p => {
    const el = $(p);
    if (el) el.classList.toggle('active', p === name);
  });
  const badge = $('statusBadge');
  if (badge) {
    if (name === 'phase-debate' || name === 'phase-judge-select') {
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }
}

/**
 * Show a toast notification.
 * @param {string} msg
 * @param {string} [type='info'] - 'info' | 'success' | 'error'
 */
function showToast(msg, type = 'info') {
  const toast = $('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.className = 'toast ' + type;
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => toast.classList.remove('show'), 3000);
}

/** Scroll the debate stream to the bottom */
function scrollToBottom() {
  const stream = $('debateStream');
  if (stream) stream.scrollTop = stream.scrollHeight;
}

/** Scroll the verdict reasoning to the bottom */
function scrollVerdictToBottom() {
  const vr = $('verdictReasoning');
  if (vr) vr.scrollTop = vr.scrollHeight;
}
