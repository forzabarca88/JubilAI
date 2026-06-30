/**
 * Root entry point for JubilAI frontend.
 * Compiled to public/js/bundle.js via esbuild.
 */

// Import all modules
import { appState } from './state/app-state';
import { loadConfig, getConfig } from './config';
import { initSetupPhase } from './phases/setup';
import { initDebatePhase } from './phases/debate';
import { initJudgeSelectPhase } from './phases/judge-select';
import { initVerdictPhase } from './phases/verdict';
import { initHistoryPanel } from './phases/history';
import { initApp, resetToSetup } from './app';
import { initTTSEvents, updateTTSEnableButton } from './dom/tts-ui';
import { ttsManager } from './tts/manager';
import { initKioskMode } from './phases/kiosk';

// Load config first
loadConfig().then(() => {
  console.log('[JubilAI] Config loaded');

  const config = getConfig();

  // Initialize all phases
  initSetupPhase(appState);
  initDebatePhase(appState);
  initJudgeSelectPhase(appState);
  initVerdictPhase(appState);
  initHistoryPanel(appState);
  initTTSEvents(appState);
  initApp();

  // Kiosk mode — apply config-driven state and hide config UI
  if (config.kiosk.enabled) {
    console.log('[JubilAI] Kiosk mode enabled');
    initKioskMode(appState);
  }

  console.log('[JubilAI] App initialized');
});
