// Shared localStorage helpers + types for the workflow-automation surface.
// Storage shapes mirror the existing pages exactly so data flows between them.
// This module is the single source of truth for the watchlist; ChartPage's
// loadFolders() delegates to loadWatchlistFolders() so every page agrees.
import type {
  AssetProfile,
  ReviewResult,
  WatchItem,
  Position as ApiPosition,
  ActionQueueResult,
  TriageResult,
  ScanResult,
  BuyRecResult,
} from '../api/client';

export const PROFILES_KEY = 'qc-asset-profiles';
export const JOURNAL_KEY = 'qc-decision-journal';
export const WORKSPACE_CACHE_KEY = 'qc-workspace-cache';
// PortfolioPage persists under 'qc-portfolio' with { ticker, shares, avgCost, addedAt }.
export const PORTFOLIO_KEY = 'qc-portfolio';
// ChartPage persists watchlist folders under 'qc-watchlist-folders'.
export const WATCHLIST_KEY = 'qc-watchlist-folders';
// Legacy flat watchlist (string[]) — kept only for first-run / migration checks.
export const WATCHLIST_LEGACY_KEY = 'qc-watchlist';

export interface WatchlistFolder {
  id: string;
  name: string;
  tickers: string[];
}

// Matches PortfolioPage's on-disk Position.
export interface StoredPosition {
  ticker: string;
  shares: number;
  avgCost: number;
  addedAt?: string;
}

export interface JournalEntry {
  id: string;
  ts: number;
  ticker: string;
  review_type: string;
  thesis?: string;
  conclusion: string;
  action_taken?: boolean;
  entry_price?: number;
  review: ReviewResult;
}

export interface WorkspaceCache {
  queue?: ActionQueueResult;
  triage?: TriageResult;
  scan?: ScanResult;
  buyRec?: BuyRecResult;
  queueTs?: number;
  triageTs?: number;
  scanTs?: number;
  buyRecTs?: number;
}

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota — ignore */
  }
}

// --- Asset profiles ---
export function loadProfiles(): Record<string, AssetProfile> {
  return readJSON<Record<string, AssetProfile>>(PROFILES_KEY, {});
}
export function saveProfiles(p: Record<string, AssetProfile>) {
  writeJSON(PROFILES_KEY, p);
}

// --- Journal ---
export function loadJournal(): JournalEntry[] {
  return readJSON<JournalEntry[]>(JOURNAL_KEY, []);
}
export function saveJournal(entries: JournalEntry[]) {
  writeJSON(JOURNAL_KEY, entries);
}
export function appendJournal(entry: JournalEntry): JournalEntry[] {
  const next = [entry, ...loadJournal()];
  saveJournal(next);
  return next;
}

// --- Workspace cache ---
export function loadWorkspaceCache(): WorkspaceCache {
  return readJSON<WorkspaceCache>(WORKSPACE_CACHE_KEY, {});
}
export function saveWorkspaceCache(c: WorkspaceCache) {
  writeJSON(WORKSPACE_CACHE_KEY, c);
}

// --- Watchlist (folders) ---

// Default seed shown to a brand-new user on the very first launch.
export const DEFAULT_WATCHLIST_TICKERS = [
  'AAPL',
  'NVDA',
  'MSFT',
  'TSLA',
  'GOOGL',
  'AMZN',
  'META',
  'AMD',
];

/** Localized name for the default seed folder. */
export function defaultWatchlistFolderName(locale?: string): string {
  return locale === 'zh-TW' ? '熱門' : 'Popular';
}

/**
 * Canonical watchlist reader. Resolution order:
 *   1. Current folders key (qc-watchlist-folders).
 *   2. Legacy flat key (qc-watchlist: string[]) -> migrated into a folder.
 *   3. Empty list (caller / seeder decides what to do).
 * ChartPage.loadFolders() delegates here so there's one source of truth.
 */
export function loadWatchlistFolders(): WatchlistFolder[] {
  const folders = readJSON<WatchlistFolder[] | null>(WATCHLIST_KEY, null);
  if (Array.isArray(folders) && folders.length > 0) return folders;

  // Migrate legacy flat watchlist (string[]) into a default folder, once.
  const legacy = readJSON<string[] | null>(WATCHLIST_LEGACY_KEY, null);
  if (Array.isArray(legacy) && legacy.length > 0) {
    const migrated: WatchlistFolder = {
      id: 'default',
      name: 'My List',
      tickers: legacy.map((tk) => String(tk).toUpperCase()),
    };
    writeJSON(WATCHLIST_KEY, [migrated]);
    return [migrated];
  }

  return [];
}

/**
 * Seed a default watchlist on the very first run only.
 *
 * "First run" is defined strictly: BOTH the folders key and the legacy key must
 * be ABSENT from localStorage. This means:
 *   - A returning user who deleted every ticker (key present, value "[]") is
 *     NOT reseeded — we respect their empty-by-choice state.
 *   - A user migrating from the legacy flat watchlist is NOT reseeded — their
 *     data is migrated by loadWatchlistFolders() instead.
 * Returns true if seeding occurred.
 */
export function seedDefaultWatchlistIfFirstRun(locale?: string): boolean {
  try {
    const hasFolders = localStorage.getItem(WATCHLIST_KEY) !== null;
    const hasLegacy = localStorage.getItem(WATCHLIST_LEGACY_KEY) !== null;
    if (hasFolders || hasLegacy) return false;

    const seeded: WatchlistFolder = {
      id: 'default',
      name: defaultWatchlistFolderName(locale),
      tickers: [...DEFAULT_WATCHLIST_TICKERS],
    };
    writeJSON(WATCHLIST_KEY, [seeded]);
    return true;
  } catch {
    return false;
  }
}

export function loadWatchlistTickers(): string[] {
  const folders = loadWatchlistFolders();
  const set = new Set<string>();
  folders.forEach((f) => (f.tickers || []).forEach((tk) => set.add(tk)));
  return [...set];
}

/** Returns true if ticker is in any watchlist folder. */
export function isInWatchlist(ticker: string): boolean {
  return loadWatchlistFolders().some((f) => (f.tickers || []).includes(ticker));
}

/**
 * Adds ticker to the first (default) watchlist folder.
 * Creates a default folder if none exists. Dedupes silently.
 * Returns true if the ticker was newly added, false if already present.
 */
export function addToWatchlist(ticker: string): boolean {
  const normalized = ticker.trim().toUpperCase();
  if (!normalized) return false;
  const folders = loadWatchlistFolders();
  if (folders.some((f) => (f.tickers || []).includes(normalized))) return false;

  if (folders.length === 0) {
    // No folders at all — create the default
    const defaultFolder: WatchlistFolder = {
      id: Math.random().toString(36).slice(2, 9),
      name: 'My List',
      tickers: [normalized],
    };
    writeJSON(WATCHLIST_KEY, [defaultFolder]);
  } else {
    // Append to first folder
    const updated = folders.map((f, i) =>
      i === 0 ? { ...f, tickers: [...(f.tickers || []), normalized] } : f
    );
    writeJSON(WATCHLIST_KEY, updated);
  }
  return true;
}

// --- Positions ---
export function loadPositions(): StoredPosition[] {
  return readJSON<StoredPosition[]>(PORTFOLIO_KEY, []);
}

// --- Builders ---
export function buildWatchItems(
  tickers: string[],
  profiles: Record<string, AssetProfile>
): WatchItem[] {
  return tickers.map((ticker) => ({
    ticker,
    profile: profiles[ticker],
  }));
}

export function buildPositionInputs(positions: StoredPosition[]): ApiPosition[] {
  return positions.map((p) => ({
    ticker: p.ticker,
    shares: p.shares,
    avg_cost: p.avgCost,
  }));
}

export function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ─── Flag log (per-ticker watch-trigger history) ──────────────────────────────

export const FLAG_LOG_KEY = 'qc-flag-history';
export const FLAG_LOG_MAX = 200;

export type FlagSource = 'triage' | 'queue' | 'scan';

export interface FlagEntry {
  id: string;
  ts: number;
  ticker: string;
  source: FlagSource;
  label: string;    // e.g. "Need Review", "High", "running"
  reason: string;
  change_pct?: number;
}

export function loadFlagLog(): FlagEntry[] {
  return readJSON<FlagEntry[]>(FLAG_LOG_KEY, []);
}

export function saveFlagLog(entries: FlagEntry[]): void {
  writeJSON(FLAG_LOG_KEY, entries.slice(0, FLAG_LOG_MAX));
}

/**
 * Append flag entries; dedupes by ticker+label within the same calendar day.
 */
export function appendFlagEntries(newEntries: FlagEntry[]): void {
  const existing = loadFlagLog();
  const todayPrefix = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
  const dayKeys = new Set(
    existing
      .filter((e) => new Date(e.ts).toISOString().slice(0, 10) === todayPrefix)
      .map((e) => `${e.ticker}|${e.label}|${e.source}`)
  );
  const fresh = newEntries.filter(
    (e) => !dayKeys.has(`${e.ticker}|${e.label}|${e.source}`)
  );
  if (!fresh.length) return;
  saveFlagLog([...fresh, ...existing]);
}

// --- DAG analysis history (shared with DagEditor's qc-analysis-history) ---
export const DAG_HISTORY_KEY = 'qc-analysis-history';
const DAG_HISTORY_MAX = 30;

export interface DagHistoryEntry {
  id: string;
  ticker: string;
  timestamp: number;
  result: Record<string, unknown>;
}

export function appendDagHistory(entries: DagHistoryEntry[]): void {
  if (!entries.length) return;
  try {
    const raw = localStorage.getItem(DAG_HISTORY_KEY);
    const existing: DagHistoryEntry[] = raw ? JSON.parse(raw) : [];
    const merged = [...entries, ...existing].slice(0, DAG_HISTORY_MAX);
    localStorage.setItem(DAG_HISTORY_KEY, JSON.stringify(merged));
  } catch { /* ignore */ }
}
