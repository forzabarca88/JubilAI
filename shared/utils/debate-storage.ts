/**
 * Persistent file-based storage for completed debates.
 * Files are stored as JSON in a platform-appropriate directory.
 * `DEBATE_FILES_DIR` environment variable overrides the default path.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Debate } from '../types/debate';
import config from './config';

/**
 * Resolve the storage directory path.
 * Priority: DEBATE_FILES_DIR env var → platform default.
 * Creates the directory if it doesn't exist.
 */
export function getDebateStorageDir(): string {
  // 1. Environment variable override
  const envDir = process.env.DEBATE_FILES_DIR;
  if (envDir) {
    try {
      if (!fs.existsSync(envDir)) fs.mkdirSync(envDir, { recursive: true });
      return envDir;
    } catch (err) {
      console.error(`[debate-storage] Failed to create env dir ${envDir}:`, (err as Error).message);
      // Fall through to platform default
    }
  }

  // 2. Platform-specific default
  const dirName = config.debateStorage.defaultDirName;
  let baseDir: string;

  const platform = os.platform();
  if (platform === 'win32') {
    baseDir = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  } else if (platform === 'darwin') {
    baseDir = path.join(os.homedir(), 'Library', 'Application Support');
  } else {
    // Linux and others
    baseDir = path.join(os.homedir(), '.local', 'share');
  }

  const storageDir = path.join(baseDir, dirName);

  try {
    if (!fs.existsSync(storageDir)) fs.mkdirSync(storageDir, { recursive: true });
    return storageDir;
  } catch (err) {
    console.error(`[debate-storage] Failed to create storage dir ${storageDir}:`, (err as Error).message);
    // Return the path anyway; callers should handle errors gracefully
    return storageDir;
  }
}

/**
 * Summary of a saved debate for the list endpoint.
 */
export interface SavedDebateSummary {
  id: string;
  statement: string;
  modelA: string;
  modelB: string;
  phase: string;
  verdict: string | null;
  winner: string | null;
  timestamp: number;
}

/** Parse winner from verdict text using the configured pattern */
function parseWinner(verdict: string | null): string | null {
  if (!verdict) return null;
  const match = verdict.match(config.debate.winnerPattern);
  return match ? 'The ' + match[2] : null;
}

/**
 * Save a completed debate to disk as a JSON file.
 */
export function saveDebate(debate: Debate): void {
  if (debate.phase !== 'complete') {
    // Only persist completed debates
    return;
  }

  const storageDir = getDebateStorageDir();
  const filePath = path.join(storageDir, `${debate.id}.json`);

  try {
    fs.writeFileSync(filePath, JSON.stringify(debate, null, 2), 'utf-8');
    console.log(`[debate-storage] Saved debate ${debate.id}`);
  } catch (err) {
    console.error(`[debate-storage] Failed to save debate ${debate.id}:`, (err as Error).message);
  }
}

/**
 * Load a debate from disk. Returns null if not found or invalid.
 */
export function loadDebate(id: string): Debate | null {
  const storageDir = getDebateStorageDir();
  const filePath = path.join(storageDir, `${id}.json`);

  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf-8');
    const debate = JSON.parse(raw) as Debate;

    // Basic validation
    if (!debate.id || !debate.statement || !debate.phase || !Array.isArray(debate.messages)) {
      console.error(`[debate-storage] Invalid debate file: ${id}`);
      return null;
    }

    return debate;
  } catch (err) {
    console.error(`[debate-storage] Failed to load debate ${id}:`, (err as Error).message);
    return null;
  }
}

/**
 * Delete a debate file from disk. Returns true on success.
 */
export function deleteDebate(id: string): boolean {
  const storageDir = getDebateStorageDir();
  const filePath = path.join(storageDir, `${id}.json`);

  try {
    if (!fs.existsSync(filePath)) return false;
    fs.unlinkSync(filePath);
    console.log(`[debate-storage] Deleted debate ${id}`);
    return true;
  } catch (err) {
    console.error(`[debate-storage] Failed to delete debate ${id}:`, (err as Error).message);
    return false;
  }
}

/**
 * List all saved debates, sorted by file mtime (newest first).
 * Returns up to `limit` summaries.
 */
export function listDebates(limit?: number): SavedDebateSummary[] {
  const storageDir = getDebateStorageDir();
  const maxCount = limit ?? config.debateStorage.maxListCount;
  const results: SavedDebateSummary[] = [];

  try {
    if (!fs.existsSync(storageDir)) return results;

    const files = fs.readdirSync(storageDir).filter(f => f.endsWith('.json'));

    for (const file of files) {
      const id = file.replace('.json', '');
      const filePath = path.join(storageDir, file);
      const stat = fs.statSync(filePath);

      try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const debate = JSON.parse(raw) as Debate;

        results.push({
          id: debate.id,
          statement: debate.statement,
          modelA: debate.modelA,
          modelB: debate.modelB,
          phase: debate.phase,
          verdict: debate.verdict ? debate.verdict.slice(0, 120) : null,
          winner: parseWinner(debate.verdict),
          timestamp: stat.mtimeMs,
        });
      } catch (err) {
        console.error(`[debate-storage] Failed to parse ${file}:`, (err as Error).message);
      }
    }

    // Sort by timestamp descending (newest first)
    results.sort((a, b) => b.timestamp - a.timestamp);

    return results.slice(0, maxCount);
  } catch (err) {
    console.error(`[debate-storage] Failed to list debates:`, (err as Error).message);
    return results;
  }
}

/**
 * Load all debates from disk into a Map. Used on server startup.
 */
export function loadAllDebates(): Map<string, Debate> {
  const storageDir = getDebateStorageDir();
  const map = new Map<string, Debate>();

  try {
    if (!fs.existsSync(storageDir)) return map;

    const files = fs.readdirSync(storageDir).filter(f => f.endsWith('.json'));

    for (const file of files) {
      const id = file.replace('.json', '');
      const debate = loadDebate(id);
      if (debate) {
        map.set(id, debate);
      }
    }

    if (map.size > 0) {
      console.log(`[debate-storage] Loaded ${map.size} debate(s) from disk`);
    }
  } catch (err) {
    console.error(`[debate-storage] Failed to load debates on startup:`, (err as Error).message);
  }

  return map;
}
