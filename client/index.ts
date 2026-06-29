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
import { updateTTSEnableButton } from './dom/tts-ui';
import { ttsManager } from './tts/manager';

// Load config first
loadConfig().then(() => {
  console.log('[JubilAI] Config loaded');
  
  // Initialize all phases
  initSetupPhase(appState);
  initDebatePhase(appState);
  initJudgeSelectPhase(appState);
  initVerdictPhase(appState);
  initHistoryPanel(appState);
  initApp();
  
  console.log('[JubilAI] App initialized');
});
