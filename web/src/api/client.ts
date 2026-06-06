import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export const api = axios.create({
  baseURL: API_BASE_URL,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export interface NodeInfo {
  name: string;
  category: string;
  description: string;
  config_schema: Record<string, {
    type: string;
    default: string | number;
    options?: string[];
  }>;
  input_keys: string[];
  output_keys: string[];
}

export interface NodesResponse {
  nodes: Record<string, NodeInfo>;
  categories: Record<string, Array<NodeInfo & { type: string }>>;
}

export interface StrategyPayload {
  name: string;
  description?: string;
  dag_config: { nodes: DagNode[]; edges: DagEdge[] };
  is_public?: boolean;
}

export interface DagNode {
  id: string;
  type: string;
  config?: Record<string, unknown>;
}

export interface DagEdge {
  from: string;
  to: string;
}

export interface StrategyResponse {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  dag_config: { nodes: DagNode[]; edges: DagEdge[] };
  is_public: boolean;
  fork_count: number;
  forked_from_id: string | null;
  created_at: string;
}

export const fetchNodes = () =>
  api.get<NodesResponse>('/nodes').then((r) => r.data);

export const fetchMyStrategies = () =>
  api.get<StrategyResponse[]>('/strategies').then((r) => r.data);

export const fetchStrategy = (id: string) =>
  api.get<StrategyResponse>(`/strategies/${id}`).then((r) => r.data);

export const createStrategy = (data: StrategyPayload) =>
  api.post<StrategyResponse>('/strategies', data).then((r) => r.data);

export const updateStrategy = (id: string, data: Partial<StrategyPayload>) =>
  api.put<StrategyResponse>(`/strategies/${id}`, data).then((r) => r.data);

export const deleteStrategy = (id: string) =>
  api.delete(`/strategies/${id}`);

export const forkStrategy = (id: string) =>
  api.post<StrategyResponse>(`/strategies/${id}/fork`).then((r) => r.data);

export const fetchPublicStrategies = (offset = 0, limit = 20) =>
  api.get<StrategyResponse[]>('/strategies/public', { params: { offset, limit } }).then((r) => r.data);

// Stock data APIs
export interface SearchResult {
  symbol: string;
  description: string;
  type: string;
  exchange: string;
}

export interface StockQuote {
  ticker: string;
  price: number;
  change: number;
  change_pct: number;
  high: number;
  low: number;
  open: number;
  prev_close: number;
  name: string;
}

export interface OHLCVRecord {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface NewsItem {
  title: string;
  source: string;
  url: string;
  summary: string;
  published_at: string;
}

export const searchStocks = (q: string) =>
  api.get<{ results: SearchResult[] }>('/stocks/search', { params: { q } }).then((r) => r.data.results);

export const fetchQuote = (ticker: string) =>
  api.get<StockQuote>(`/stocks/${ticker}/quote`).then((r) => r.data);

export const fetchOHLCV = (ticker: string, period = '3m') =>
  api.get<{ ticker: string; data: OHLCVRecord[] }>(`/stocks/${ticker}/ohlcv`, { params: { period } }).then((r) => r.data.data);

export const fetchNews = (ticker: string) =>
  api.get<{ ticker: string; news: NewsItem[] }>(`/stocks/${ticker}/news`).then((r) => r.data.news);

// Sync analyze (run DAG pipeline, no Celery needed)
export const runAnalyzeSync = (data: {
  ticker: string;
  trade_date?: string;
  dag_config?: { nodes: DagNode[]; edges: DagEdge[] };
  language?: string;
}) =>
  api.post('/analyze/sync', data).then((r) => r.data);

// LLM model selection
export const fetchModels = () =>
  api.get<{ models: { id: string; name: string; status: string; tier?: string }[] }>('/llm/models').then(r => r.data.models);

// Discovery / market movers
export const fetchMarketMovers = () =>
  api.get('/discovery/movers').then(r => r.data);

export const fetchSectors = () =>
  api.get('/discovery/sectors').then(r => r.data);

// Portfolio advisor
export const advisePortfolio = (data: { positions: { ticker: string; shares: number; avg_cost: number }[]; language?: string; model?: string }) =>
  api.post('/portfolio/advise', data).then(r => r.data);

// Portfolio rebalance — market survey + rotation plan
export interface RebalanceSurveyTicker {
  ticker: string;
  sector?: string;
  change_pct: number;
  price?: number;
}

export interface RebalanceRotation {
  from: string;
  trim_pct: number;
  to: string;
  reason: string;
  conviction: 'high' | 'medium' | 'low';
}

export interface RebalanceCandidate {
  ticker: string;
  reason: string;
}

export interface RebalanceHotSector {
  sector: string;
  change_pct: number;
  why: string;
}

export interface RebalanceResult {
  total_value: number;
  survey: {
    hot_sectors: RebalanceSurveyTicker[];
    candidates: RebalanceSurveyTicker[];
  };
  plan: {
    summary: string;
    hot_sectors: RebalanceHotSector[];
    rotation: RebalanceRotation[];
    candidates: RebalanceCandidate[];
  };
}

export const rebalancePortfolio = (data: {
  positions: { ticker: string; shares: number; avg_cost: number }[];
  cash?: number;
  language?: string;
}): Promise<RebalanceResult> =>
  api.post<RebalanceResult>('/portfolio/rebalance', data).then(r => r.data);

// Sync backtest (no Celery needed)
export const runBacktestSync = (data: {
  ticker: string;
  start_date: string;
  end_date: string;
  algorithm_code: string;
  initial_capital?: number;
}) =>
  api.post('/backtest/rule/sync', data).then((r) => r.data);

// ─── Workflow automation types ──────────────────────────────────────────────

export interface AssetProfile {
  ticker: string;
  role?: string;
  theme?: string;
  risk?: string;
  review_frequency?: string;
  thesis?: string;
  thesis_status?: string;
}

export interface WatchItem {
  ticker: string;
  profile?: AssetProfile;
  change_pct?: number;
  note?: string;
}

export interface Position {
  ticker: string;
  shares: number;
  avg_cost: number;
  current_price?: number;
}

export interface ActionQueueItem {
  ticker: string;
  reason: string;
  review_type: string;
}

export interface ActionQueueResult {
  high: ActionQueueItem[];
  medium: ActionQueueItem[];
  no_action: string[];
  summary: string;
}

export type TriageLevel =
  | 'Need Review'
  | 'Watch Closely'
  | 'Light Scan Only'
  | 'No Action'
  | 'Thesis Changed'
  | 'Risk Increased';

export interface TriageItem {
  ticker: string;
  level: TriageLevel;
  reason: string;
}

export interface TriageResult {
  items: TriageItem[];
}

export interface ReviewType {
  key: string;
  label: string;
}

export interface ReviewResult {
  ticker: string;
  review_type: string;
  conclusion: string;
  why_triggered: string;
  bull_case: string;
  bear_case: string;
  risk_review: string;
  what_would_change_our_mind: string;
  next_review_trigger: string;
  /** Set by backend when AI was unavailable and a fallback summary was used */
  degraded?: boolean;
}

export interface ExposureHolding {
  ticker: string;
  value: number;
  weight: number;
}

export interface ConcentrationWarning {
  type: string;
  detail: string;
  severity: string;
}

export interface ThemeBreakdown {
  theme: string;
  weight_pct: number;
}

export interface ExposureReview {
  concentration: ConcentrationWarning[];
  theme_breakdown: ThemeBreakdown[];
  summary: string;
  watch_items: string[];
}

export interface ExposureResult {
  total_value: number;
  cash_weight: number;
  holdings: ExposureHolding[];
  review: ExposureReview;
}

export interface WeeklyReportEntry {
  ticker: string;
  note: string;
}

export interface WeeklyReportResult {
  high_priority: WeeklyReportEntry[];
  thesis_changed: WeeklyReportEntry[];
  no_action: string[];
  exposure_changes: string;
  key_events: string[];
  next_week_watch: string[];
  markdown: string;
}

export interface ScreenerFilters {
  min_price?: number;
  max_price?: number;
  min_chg_1d?: number;
  min_chg_1w?: number;
  min_chg_1m?: number;
  above_sma20?: boolean;
  above_sma50?: boolean;
  min_rel_volume?: number;
  near_high?: boolean;
  sort_by?: string;
  desc?: boolean;
  limit?: number;
}

export interface ScreenerRow {
  ticker: string;
  price: number;
  chg_1d: number;
  chg_1w: number;
  chg_1m: number;
  chg_3m: number;
  from_high_pct: number;
  from_low_pct: number;
  above_sma20: boolean;
  above_sma50: boolean;
  rel_volume: number;
}

export interface ScreenerResult {
  count: number;
  results: ScreenerRow[];
}

export interface ScreenerFields {
  sortable: string[];
  universe_size: number;
}

export interface UsageBucket {
  name: string;
  requests: number;
  input_tokens: number;
  output_tokens: number;
  cost: number;
}

export interface UsageDaily {
  date: string;
  requests: number;
  input_tokens: number;
  output_tokens: number;
  cost: number;
}

export interface UsageSummary {
  total: {
    requests: number;
    input_tokens: number;
    output_tokens: number;
    cost: number;
  };
  providers: UsageBucket[];
  models: UsageBucket[];
  daily: UsageDaily[];
}

export interface UsagePricing {
  pricing: Record<string, { input_per_1m: number; output_per_1m: number }>;
}

// ─── Scan types ─────────────────────────────────────────────────────────────

export interface ScanEvent {
  type: string;
  detail: string;
}

export interface ScanTrigger {
  ticker: string;
  events: ScanEvent[];
  recommended_review: string;
  priority: 'high' | 'medium';
  chg_5d: number;
  rel_volume: number;
}

export interface ScanResult {
  scanned: number;
  triggered: number;
  triggers: ScanTrigger[];
}

// ─── Political feed types ───────────────────────────────────────────────────

export interface TrumpPost {
  text: string;
  url: string;
  published_at: string;
}

export interface TrumpFeed {
  source: 'truthsocial' | 'news' | 'none';
  posts: TrumpPost[];
}

// ─── Workflow automation APIs ───────────────────────────────────────────────

export const scanWatchlist = (tickers: string[]) =>
  api.post<ScanResult>('/workflows/scan', { tickers }).then((r) => r.data);

// Buy-recommendations scanner — market scout finds BUY candidates now
export interface BuyRec {
  ticker: string;
  conviction: 'high' | 'medium' | string;
  thesis: string;
  confidence?: number;
  entry_price?: number | null;
  target_price?: number | null;
  stop_loss?: number | null;
  time_horizon?: string | null;
  risk?: string;
  catalyst?: string | null;
}

export interface BuyRecRejected {
  ticker: string;
  action: string;
}

export interface BuyRecResult {
  scanned: number;
  candidates_found?: number;
  analyzed?: number;
  summary: string;
  recommendations: BuyRec[];
  rejected?: BuyRecRejected[];
}

export const fetchBuyRecommendations = (language?: string) =>
  api.post<BuyRecResult>('/workflows/buy-recommendations', { language, max_candidates: 8 })
    .then((r) => r.data);

// ─── Portfolio construction (AlphaAgents: conviction-weighted + risk style) ───

export interface PortfolioPosition {
  ticker: string;
  weight: number;
  weight_pct: number;
  confidence: number;
}

export interface PortfolioBuildResult {
  positions: PortfolioPosition[];
  cash: number;
  cash_pct: number;
  risk_style: string;
  note: string;
  analyzed?: number;
}

export const buildPortfolio = (
  tickers: string[],
  risk_style: 'conservative' | 'balanced' | 'aggressive' = 'balanced',
  language?: string,
) =>
  api
    .post<PortfolioBuildResult>('/workflows/portfolio', { tickers, risk_style, language, max_analyze: 6 })
    .then((r) => r.data);

// ─── Strategy evaluation harness ─────────────────────────────────────────────

export interface EvalScore {
  label: string;
  n: number;
  directional?: number;
  holds?: number;
  hold_rate?: number | null;
  hit_rate?: number | null;
  avg_confidence?: number | null;
  calibration_gap?: number | null;
  strategy_return?: number | null;
  strategy_return_std?: number | null;
  return_over_risk?: number | null;
  sortino?: number | null;
  brier_score?: number | null;
  buy_hold_return?: number | null;
  excess_vs_buyhold?: number | null;
  beats_buy_hold?: boolean | null;
  cost_bps_per_leg?: number;
  cost_model?: string;
  window?: { regime?: string; benchmark_return?: number | null };
  note?: string | null;
}

export interface SectorRow {
  rank: number; etf: string; sector: string;
  mom_1m: number; mom_3m: number; score: number; defensive: boolean;
}
export interface SectorRotation {
  sectors: SectorRow[]; leaders?: string[]; laggards?: string[]; tilt?: string;
}
export const fetchSectorRotation = () =>
  api.get<SectorRotation>('/screener/sectors').then((r) => r.data);

export interface PairRow {
  pair: string; correlation: number; spread_z: number; trade: string; long: string; short: string;
}
export const fetchPairs = (tickers?: string[]) =>
  api.post<{ pairs: PairRow[]; note?: string }>('/screener/pairs', { tickers })
    .then((r) => r.data);

export const fetchEvalLabels = () =>
  api.get<{ labels: { label: string; count: number }[] }>('/eval/labels').then((r) => r.data.labels);

export const fetchEvalScore = (label: string) =>
  api.get<EvalScore>('/eval/score', { params: { label } }).then((r) => r.data);

export interface LeaderRow {
  rank: number; label: string; directional?: number; hit_rate?: number | null;
  strategy_return?: number | null; excess_vs_buyhold?: number | null;
  beats_buy_hold?: boolean | null; sortino?: number | null; regime?: string | null;
}
export const fetchEvalLeaderboard = (metric = 'excess_vs_buyhold') =>
  api.get<{ metric: string; ranked: LeaderRow[]; pending: { label: string }[] }>(
    '/eval/leaderboard', { params: { metric } }).then((r) => r.data);

export const fetchEvalCompare = (a: string, b: string) =>
  api.get<{ a: EvalScore; b: EvalScore; better: Record<string, string | null>;
            wins?: Record<string, number>; overall?: string }>(
    '/eval/compare', { params: { a, b } }).then((r) => r.data);

export const fetchActionQueue = (data: {
  watchlist: WatchItem[];
  positions?: Position[];
  language?: string;
}) =>
  api.post<ActionQueueResult>('/workflows/action-queue', data).then((r) => r.data);

export const fetchTriage = (data: { watchlist: WatchItem[]; language?: string }) =>
  api.post<TriageResult>('/workflows/triage', data).then((r) => r.data);

export const classifyAsset = (data: {
  ticker: string;
  portfolio_context?: string;
  language?: string;
}) => api.post<AssetProfile>('/workflows/classify', data).then((r) => r.data);

export const fetchExposure = (data: {
  positions: Position[];
  cash?: number;
  profiles?: AssetProfile[];
  language?: string;
}) => api.post<ExposureResult>('/workflows/exposure', data).then((r) => r.data);

export const fetchReviewTypes = () =>
  api.get<{ types: ReviewType[] }>('/workflows/review-types').then((r) => r.data.types);

export const runReview = (data: {
  ticker: string;
  review_type: string;
  thesis?: string;
  profile?: AssetProfile;
  language?: string;
}) => api.post<ReviewResult>('/workflows/review', data).then((r) => r.data);

export const fetchWeeklyReport = (data: {
  watchlist: WatchItem[];
  recent_actions?: unknown[];
  language?: string;
}) => api.post<WeeklyReportResult>('/workflows/weekly-report', data).then((r) => r.data);

// ─── Report exports (raw text — not JSON) ───────────────────────────────────

export const downloadMarkdownReport = async (data: {
  ticker: string;
  trade_date?: string;
  result: object;
}): Promise<void> => {
  const res = await fetch(`${API_BASE_URL}/reports/markdown`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Report failed: ${res.status} ${await res.text()}`);
  const md = await res.text();
  const blob = new Blob([md], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${data.ticker}-report-${data.trade_date || new Date().toISOString().slice(0, 10)}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const openHtmlReport = async (data: {
  ticker: string;
  trade_date?: string;
  result: object;
}): Promise<void> => {
  const res = await fetch(`${API_BASE_URL}/reports/html`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Report failed: ${res.status} ${await res.text()}`);
  const html = await res.text();
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
};

// ─── Digest report APIs ─────────────────────────────────────────────────────

export interface DigestSendResult {
  ok: boolean;
  error?: string;
  count?: number;
  tickers?: string[];
}

export const fetchDigestStatus = () =>
  api.get<{ smtp_configured: boolean }>('/digest/status').then((r) => r.data);

// Email an existing analysis result (no re-run) — used by the DAG result view
export const fetchReportEmailStatus = () =>
  api.get<{ smtp_configured: boolean }>('/reports/email-status').then((r) => r.data);

export const emailReport = (data: {
  ticker: string;
  trade_date?: string;
  result: Record<string, unknown>;
  email: string;
}) =>
  api.post<{ ok: boolean; error?: string }>('/reports/email', data).then((r) => r.data);

export const sendDigest = (tickers: string[], email: string, language?: string) =>
  api
    .post<DigestSendResult>('/digest/send', { tickers, email, language })
    .then((r) => r.data);

/**
 * Build the combined HTML digest and open it in a new tab.
 * Uses a raw fetch (the endpoint returns text/html, not JSON) and a blob URL,
 * mirroring openHtmlReport() above. SLOW: ~30-50s per ticker (cached).
 */
export const previewDigest = async (
  tickers: string[],
  language?: string
): Promise<void> => {
  const res = await fetch(`${API_BASE_URL}/digest/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tickers, language }),
  });
  if (!res.ok) throw new Error(`Digest failed: ${res.status} ${await res.text()}`);
  const html = await res.text();
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
};

export interface DigestRunResult {
  ok: boolean;
  trade_date: string;
  tickers: string[];
  results: { ticker: string; result: Record<string, unknown> }[];
  emailed: boolean;
  email_error?: string | null;
  error?: string;
}

/** Run full DAG analysis on each ticker, optionally email, return structured results. */
export const runDigest = (tickers: string[], opts?: { email?: string; language?: string }) =>
  api.post<DigestRunResult>('/digest/run', {
    tickers,
    email: opts?.email,
    language: opts?.language,
  }).then((r) => r.data);

export interface DigestStreamEvent {
  type: 'start' | 'progress' | 'result' | 'emailing' | 'emailed' | 'done' | 'error';
  index?: number;
  total?: number;
  ticker?: string;
  action?: string | null;
  result?: Record<string, unknown>;
  ok?: boolean;
  error?: string;
  trade_date?: string;
  count?: number;
  tickers?: string[];
}

/**
 * Stream digest analysis via SSE — calls onEvent for each live event
 * (start → progress/result per ticker → emailing/emailed → done).
 * Uses fetch + ReadableStream (EventSource can't POST a body).
 */
export const streamDigest = async (
  tickers: string[],
  opts: { email?: string; language?: string },
  onEvent: (ev: DigestStreamEvent) => void,
): Promise<void> => {
  const res = await fetch(`${API_BASE_URL}/digest/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tickers, email: opts.email, language: opts.language }),
  });
  if (!res.ok || !res.body) throw new Error(`Stream failed: ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // SSE frames are separated by a blank line
    const frames = buffer.split('\n\n');
    buffer = frames.pop() ?? '';
    for (const frame of frames) {
      const line = frame.split('\n').find((l) => l.startsWith('data:'));
      if (!line) continue;
      try {
        onEvent(JSON.parse(line.slice(5).trim()) as DigestStreamEvent);
      } catch { /* ignore malformed frame */ }
    }
  }
};

// ─── Auto-watch / subscription APIs ─────────────────────────────────────────

export interface WatchSubscription {
  email: string;
  tickers: string[];
  triggers: { news: boolean; anomaly: boolean };
  keywords?: string[];
  language?: string;
  enabled: boolean;
  updated_at?: string;
}

export const subscribeWatch = (body: {
  email: string;
  tickers: string[];
  triggers: { news: boolean; anomaly: boolean };
  keywords?: string[];
  language?: string;
  enabled: boolean;
}) =>
  api
    .post<{ ok: boolean; subscription?: WatchSubscription; error?: string }>(
      '/watch/subscribe',
      body
    )
    .then((r) => r.data);

export const getWatchSubscription = (email: string) =>
  api
    .get<{ subscription: WatchSubscription | null }>('/watch/subscription', {
      params: { email },
    })
    .then((r) => r.data.subscription);

export const deleteWatchSubscription = (email: string) =>
  api
    .delete<{ ok: true }>('/watch/subscription', { params: { email } })
    .then((r) => r.data);

export const runWatchNow = (email: string) =>
  api
    .post<{ ok: boolean; queued: boolean }>('/watch/run-now', { email })
    .then((r) => r.data);

export const fetchWatchStatus = () =>
  api.get<{ smtp_configured: boolean; daily_enabled?: boolean; daily_hour_utc?: number }>('/watch/status')
    .then((r) => r.data);

export const sendDailyNow = (email: string) =>
  api
    .post<{ ok: boolean; queued: boolean; error?: string }>('/watch/send-daily-now', { email })
    .then((r) => r.data);

// ─── Screener APIs ──────────────────────────────────────────────────────────

export const runScreen = (filters: ScreenerFilters) =>
  api.post<ScreenerResult>('/screener/screen', filters).then((r) => r.data);

export const fetchScreenerFields = () =>
  api.get<ScreenerFields>('/screener/fields').then((r) => r.data);

// ─── Multi-factor screener (Value / Momentum / Quality / Low-Vol) ────────────

export interface FactorRow {
  rank: number;
  ticker: string;
  price: number;
  composite: number;
  factors: { value: number; momentum: number; quality: number; low_vol: number; high_proximity?: number };
  raw: {
    pe: number | null; pb: number | null; momentum_6m: number;
    roe: number | null; margin: number | null;
    debt_to_equity: number | null; volatility: number;
  };
}

export interface FactorScreenResult {
  ranked: FactorRow[];
  weights: Record<string, number>;
  count?: number;
  cached?: boolean;
}

export const runFactorScreen = (tickers?: string[], weights?: Record<string, number>, limit = 20) =>
  api
    .post<FactorScreenResult>('/screener/factors', { tickers, weights, limit })
    .then((r) => r.data);

// ─── Usage APIs ─────────────────────────────────────────────────────────────

export const fetchUsageSummary = () =>
  api.get<UsageSummary>('/usage/summary').then((r) => r.data);

export const fetchUsagePricing = () =>
  api.get<UsagePricing>('/usage/pricing').then((r) => r.data);

export const resetUsage = () => api.post('/usage/reset').then((r) => r.data);

// ─── Political feed APIs ────────────────────────────────────────────────────

export const fetchTrumpPosts = (limit = 12) =>
  api.get<TrumpFeed>('/political/trump', { params: { limit } }).then((r) => r.data);
