import { useEffect, useRef, useState, useCallback } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Plus,
  X,
  Loader,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Briefcase,
} from 'lucide-react';
import {
  fetchQuote,
  advisePortfolio,
  fetchExposure,
  rebalancePortfolio,
  type StockQuote,
  type ExposureResult,
  type AssetProfile,
  type RebalanceResult,
} from '../api/client';
import { useI18n } from '../i18n/context';
import { loadProfiles, addToWatchlist } from '../lib/workspace';
import styles from './PortfolioPage.module.css';
import wf from './workflow.module.css';

function severityClass(sev: string): string {
  const s = sev.toLowerCase();
  if (s.includes('high') || s.includes('高')) return wf.badgeHigh;
  if (s.includes('med') || s.includes('中')) return wf.badgeMedium;
  return wf.badgeLow;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Position {
  ticker: string;
  shares: number;
  avgCost: number;
  addedAt: string; // ISO date
}

interface EnrichedPosition extends Position {
  quote: StockQuote | null;
  loading: boolean;
  error: boolean;
}

type SortKey = 'ticker' | 'marketValue' | 'pl' | 'plPct' | 'weight';
type SortDir = 'asc' | 'desc';

const STORAGE_KEY = 'qc-portfolio';
const REFRESH_INTERVAL = 30_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadPositions(): Position[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Position[];
  } catch {
    return [];
  }
}

function savePositions(positions: Position[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(positions));
}

function formatPrice(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatCurrency(n: number): string {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatPct(n: number): string {
  return (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
}

function calcMarketValue(pos: Position, quote: StockQuote | null): number {
  if (!quote) return pos.shares * pos.avgCost;
  return pos.shares * quote.price;
}

function calcPL(pos: Position, quote: StockQuote | null): number {
  if (!quote) return 0;
  return pos.shares * (quote.price - pos.avgCost);
}

function calcPLPct(pos: Position, quote: StockQuote | null): number {
  if (!quote || pos.avgCost === 0) return 0;
  return ((quote.price - pos.avgCost) / pos.avgCost) * 100;
}

// ─── Allocation palette ────────────────────────────────────────────────────────

const ALLOCATION_COLORS = [
  '#2962ff', // blue (accent)
  '#26a69a', // teal
  '#ff9800', // orange
  '#ef5350', // red
  '#ab47bc', // purple
  '#42a5f5', // light blue
  '#66bb6a', // light green
  '#ffa726', // amber
  '#ec407a', // pink
  '#78909c', // slate
];

// ─── Donut chart ───────────────────────────────────────────────────────────────

interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

function DonutChart({ slices, total }: { slices: DonutSlice[]; total: number }) {
  const size = 180;
  const cx = size / 2;
  const cy = size / 2;
  const outerR = 80;
  const innerR = 55;

  let cumAngle = -Math.PI / 2;

  const paths = slices.map((slice) => {
    const angle = (slice.value / total) * Math.PI * 2;
    const startAngle = cumAngle;
    const endAngle = cumAngle + angle;
    cumAngle = endAngle;

    const x1o = cx + outerR * Math.cos(startAngle);
    const y1o = cy + outerR * Math.sin(startAngle);
    const x2o = cx + outerR * Math.cos(endAngle);
    const y2o = cy + outerR * Math.sin(endAngle);
    const x1i = cx + innerR * Math.cos(endAngle);
    const y1i = cy + innerR * Math.sin(endAngle);
    const x2i = cx + innerR * Math.cos(startAngle);
    const y2i = cy + innerR * Math.sin(startAngle);

    const largeArc = angle > Math.PI ? 1 : 0;
    const d = `M ${x1o} ${y1o} A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2o} ${y2o} L ${x1i} ${y1i} A ${innerR} ${innerR} 0 ${largeArc} 0 ${x2i} ${y2i} Z`;

    return (
      <path
        key={slice.label}
        d={d}
        fill={slice.color}
        className={styles.donutSlice}
      />
    );
  });

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      className={styles.donutSvg}
    >
      {paths}
      <text
        x={cx}
        y={cy - 8}
        textAnchor="middle"
        fill="var(--text-primary)"
        fontSize="13"
        fontWeight="700"
        fontFamily="inherit"
      >
        {formatCurrency(total)}
      </text>
      <text
        x={cx}
        y={cy + 8}
        textAnchor="middle"
        fill="var(--text-muted)"
        fontSize="9"
        fontFamily="inherit"
      >
        TOTAL VALUE
      </text>
    </svg>
  );
}

// ─── Sort icon helper ──────────────────────────────────────────────────────────

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ArrowUpDown size={11} className={styles.sortIconInactive} />;
  return sortDir === 'asc'
    ? <ArrowUp size={11} className={styles.sortIconActive} />
    : <ArrowDown size={11} className={styles.sortIconActive} />;
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface PortfolioPageProps {
  onAnalyze?: (ticker: string) => void;
}

export function PortfolioPage({ onAnalyze }: PortfolioPageProps = {}) {
  const { t, locale } = useI18n();

  // Exposure review state
  const [exposure, setExposure] = useState<ExposureResult | null>(null);
  const [exposureLoading, setExposureLoading] = useState(false);
  const [exposureError, setExposureError] = useState<string | null>(null);

  // Rebalance state
  const [rebalance, setRebalance] = useState<RebalanceResult | null>(null);
  const [rebalanceLoading, setRebalanceLoading] = useState(false);
  const [rebalanceError, setRebalanceError] = useState<string | null>(null);

  // ── State ──────────────────────────────────────────────────────────────────

  const [enriched, setEnriched] = useState<EnrichedPosition[]>(() =>
    loadPositions().map((p) => ({ ...p, quote: null, loading: true, error: false }))
  );

  const [sortKey, setSortKey] = useState<SortKey>('marketValue');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Add-position form
  const [formTicker, setFormTicker] = useState('');
  const [formShares, setFormShares] = useState('');
  const [formCost, setFormCost] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);

  // Advice modal state
  const [adviceOpen, setAdviceOpen] = useState(false);
  const [adviceLoading, setAdviceLoading] = useState(false);
  const [adviceData, setAdviceData] = useState<{
    summary: string;
    actions: { ticker: string; action: string; pct?: number | null; reason: string }[];
    suggestions: { ticker: string; reason: string }[];
    error?: string;
  } | null>(null);

  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  // ── Quote fetching ─────────────────────────────────────────────────────────

  const fetchQuotes = useCallback(async (positions: Position[]) => {
    if (positions.length === 0) {
      setEnriched([]);
      return;
    }

    // Set all to loading
    setEnriched(positions.map((p) => ({ ...p, quote: null, loading: true, error: false })));

    // Fetch all quotes concurrently
    const results = await Promise.allSettled(
      positions.map((p) => fetchQuote(p.ticker))
    );

    if (!mountedRef.current) return;

    setEnriched(
      positions.map((p, i) => {
        const result = results[i];
        if (result.status === 'fulfilled') {
          return { ...p, quote: result.value, loading: false, error: false };
        }
        return { ...p, quote: null, loading: false, error: true };
      })
    );
  }, []);

  // ── Initial load + refresh ─────────────────────────────────────────────────

  useEffect(() => {
    mountedRef.current = true;
    const positions = loadPositions();
    fetchQuotes(positions);

    refreshTimerRef.current = setInterval(() => {
      const current = loadPositions();
      fetchQuotes(current);
    }, REFRESH_INTERVAL);

    return () => {
      mountedRef.current = false;
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  }, [fetchQuotes]);

  // ── Derived data ───────────────────────────────────────────────────────────

  const totalMarketValue = enriched.reduce(
    (sum, ep) => sum + calcMarketValue(ep, ep.quote), 0
  );

  const totalCostBasis = enriched.reduce(
    (sum, ep) => sum + ep.shares * ep.avgCost, 0
  );

  const totalPL = totalMarketValue - totalCostBasis;
  const totalPLPct = totalCostBasis > 0 ? (totalPL / totalCostBasis) * 100 : 0;

  const dailyPL = enriched.reduce((sum, ep) => {
    if (!ep.quote) return sum;
    return sum + ep.shares * ep.quote.change;
  }, 0);

  const dailyPLPct = totalMarketValue > 0 ? (dailyPL / (totalMarketValue - dailyPL)) * 100 : 0;

  // ── Sorting ────────────────────────────────────────────────────────────────

  const sorted = [...enriched].sort((a, b) => {
    let aVal = 0;
    let bVal = 0;

    switch (sortKey) {
      case 'ticker':
        return sortDir === 'asc'
          ? a.ticker.localeCompare(b.ticker)
          : b.ticker.localeCompare(a.ticker);
      case 'marketValue':
        aVal = calcMarketValue(a, a.quote);
        bVal = calcMarketValue(b, b.quote);
        break;
      case 'pl':
        aVal = calcPL(a, a.quote);
        bVal = calcPL(b, b.quote);
        break;
      case 'plPct':
        aVal = calcPLPct(a, a.quote);
        bVal = calcPLPct(b, b.quote);
        break;
      case 'weight':
        aVal = totalMarketValue > 0 ? calcMarketValue(a, a.quote) / totalMarketValue : 0;
        bVal = totalMarketValue > 0 ? calcMarketValue(b, b.quote) / totalMarketValue : 0;
        break;
    }

    return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
  });

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const handleDelete = (ticker: string) => {
    const positions = loadPositions().filter((p) => p.ticker !== ticker);
    savePositions(positions);
    fetchQuotes(positions);
  };

  const handleAddPosition = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const ticker = formTicker.trim().toUpperCase();
    const shares = parseFloat(formShares);
    const avgCost = parseFloat(formCost);

    if (!ticker) {
      setFormError(t('portfolio.errorNoTicker'));
      return;
    }
    if (isNaN(shares) || shares <= 0) {
      setFormError(t('portfolio.errorInvalidShares'));
      return;
    }
    if (isNaN(avgCost) || avgCost <= 0) {
      setFormError(t('portfolio.errorInvalidCost'));
      return;
    }

    const existing = loadPositions();
    if (existing.some((p) => p.ticker === ticker)) {
      setFormError(t('portfolio.errorDuplicate'));
      return;
    }

    setFormLoading(true);
    try {
      // Validate ticker exists
      await fetchQuote(ticker);
    } catch {
      setFormError(t('portfolio.errorTickerNotFound'));
      setFormLoading(false);
      return;
    }

    const newPosition: Position = {
      ticker,
      shares,
      avgCost,
      addedAt: new Date().toISOString(),
    };

    const updated = [...existing, newPosition];
    savePositions(updated);
    setFormTicker('');
    setFormShares('');
    setFormCost('');
    setFormLoading(false);
    fetchQuotes(updated);
  };

  const handleAdvise = async () => {
    setAdviceOpen(true);
    setAdviceLoading(true);
    setAdviceData(null);
    try {
      const positions = loadPositions().map((p) => ({
        ticker: p.ticker,
        shares: p.shares,
        avg_cost: p.avgCost,
      }));
      const result = await advisePortfolio({ positions });
      setAdviceData(result);
    } catch {
      setAdviceData({
        summary: '',
        actions: [],
        suggestions: [],
        error: 'Failed to fetch advice. Please try again.',
      });
    } finally {
      setAdviceLoading(false);
    }
  };

  const handleExposure = async () => {
    const positions = loadPositions();
    if (!positions.length) {
      setExposureError(t('exposure.empty'));
      setExposure(null);
      return;
    }
    setExposureLoading(true);
    setExposureError(null);
    try {
      const profileMap = loadProfiles();
      const profiles: AssetProfile[] = positions
        .map((p) => profileMap[p.ticker])
        .filter((p): p is AssetProfile => !!p);
      const quoteByTicker = new Map(enriched.map((e) => [e.ticker, e.quote]));
      const res = await fetchExposure({
        positions: positions.map((p) => ({
          ticker: p.ticker,
          shares: p.shares,
          avg_cost: p.avgCost,
          current_price: quoteByTicker.get(p.ticker)?.price,
        })),
        profiles,
        language: locale,
      });
      setExposure(res);
    } catch (e) {
      setExposureError(e instanceof Error ? e.message : String(e));
    } finally {
      setExposureLoading(false);
    }
  };

  const handleRebalance = async () => {
    const positions = loadPositions();
    if (!positions.length) return;
    setRebalanceLoading(true);
    setRebalanceError(null);
    setRebalance(null);
    try {
      const res = await rebalancePortfolio({
        positions: positions.map((p) => ({
          ticker: p.ticker,
          shares: p.shares,
          avg_cost: p.avgCost,
        })),
        language: locale,
      });
      setRebalance(res);
    } catch (e) {
      setRebalanceError(e instanceof Error ? e.message : String(e));
    } finally {
      setRebalanceLoading(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const isPortfolioPositive = totalPL >= 0;
  const isDailyPositive = dailyPL >= 0;
  const hasPositions = enriched.length > 0;

  return (
    <div className={styles.page}>
      {/* ── Page header ── */}
      <div className={styles.pageHeader}>
        <div className={styles.pageTitle}>
          <Briefcase size={15} className={styles.pageTitleIcon} />
          <span>{t('portfolio.title')}</span>
        </div>
        <div className={styles.headerSpacer} />
        {hasPositions && (
          <span className={styles.positionCount}>
            {enriched.length} {enriched.length === 1 ? t('portfolio.position') : t('portfolio.positions')}
          </span>
        )}
        {hasPositions && (
          <button
            className={styles.adviseBtn}
            onClick={handleAdvise}
            disabled={adviceLoading}
          >
            {adviceLoading
              ? <><Loader size={11} className={styles.spinner} /> {t('portfolio.analyzing')}</>
              : t('portfolio.analyze')
            }
          </button>
        )}
        {hasPositions && (
          <button
            className={`${styles.adviseBtn} ${styles.rebalanceBtn}`}
            onClick={handleRebalance}
            disabled={rebalanceLoading}
            title={t('ai.hint')}
          >
            {rebalanceLoading
              ? <><Loader size={11} className={styles.spinner} /> {t('portfolio.rebalancing')}</>
              : t('portfolio.rebalance')
            }
          </button>
        )}
      </div>

      {/* ── Summary bar ── */}
      {hasPositions && (
        <div className={styles.summaryBar}>
          <div className={styles.summaryBlock}>
            <span className={styles.summaryLabel}>{t('portfolio.totalValue')}</span>
            <span className={styles.summaryValue}>{formatCurrency(totalMarketValue)}</span>
          </div>

          <div className={styles.summarySep} />

          <div className={styles.summaryBlock}>
            <span className={styles.summaryLabel}>{t('portfolio.totalPL')}</span>
            <span className={`${styles.summaryValue} ${isPortfolioPositive ? styles.positive : styles.negative}`}>
              {isPortfolioPositive ? '+' : ''}{formatCurrency(totalPL)}
              <span className={styles.summaryPct}>
                {isPortfolioPositive ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                {formatPct(totalPLPct)}
              </span>
            </span>
          </div>

          <div className={styles.summarySep} />

          <div className={styles.summaryBlock}>
            <span className={styles.summaryLabel}>{t('portfolio.dailyPL')}</span>
            <span className={`${styles.summaryValue} ${isDailyPositive ? styles.positive : styles.negative}`}>
              {isDailyPositive ? '+' : ''}{formatCurrency(dailyPL)}
              <span className={styles.summaryPct}>
                {isDailyPositive ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                {formatPct(dailyPLPct)}
              </span>
            </span>
          </div>

          <div className={styles.summarySep} />

          <div className={styles.summaryBlock}>
            <span className={styles.summaryLabel}>{t('portfolio.costBasis')}</span>
            <span className={styles.summaryValue}>{formatCurrency(totalCostBasis)}</span>
          </div>
        </div>
      )}

      {/* ── Allocation chart ── */}
      {hasPositions && (() => {
        const slices: DonutSlice[] = enriched.map((ep, i) => ({
          label: ep.ticker,
          value: calcMarketValue(ep, ep.quote),
          color: ALLOCATION_COLORS[i % ALLOCATION_COLORS.length],
        }));
        const sorted_slices = [...slices].sort((a, b) => b.value - a.value);

        return (
          <div className={styles.allocationSection}>
            <div className={styles.donutWrap}>
              <div className={styles.allocationHeader}>{t('portfolio.allocation')}</div>
              <DonutChart slices={sorted_slices} total={totalMarketValue} />
            </div>
            <div className={styles.allocationLegend}>
              {sorted_slices.map((slice) => {
                const pct = totalMarketValue > 0 ? (slice.value / totalMarketValue) * 100 : 0;
                return (
                  <div key={slice.label} className={styles.legendRow}>
                    <svg width={8} height={8} className={styles.legendSwatch}>
                      <circle cx={4} cy={4} r={4} fill={slice.color} />
                    </svg>
                    <span className={styles.legendTicker}>{slice.label}</span>
                    <span className={styles.legendPct}>{pct.toFixed(1)}%</span>
                    <span className={styles.legendValue}>{formatCurrency(slice.value)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ── Body ── */}
      <div className={styles.body}>
        {/* ── Holdings table ── */}
        <div className={styles.tableWrap}>
          {!hasPositions ? (
            <div className={styles.emptyState}>
              <Briefcase size={40} className={styles.emptyIcon} />
              <p className={styles.emptyTitle}>{t('portfolio.emptyHeadline')}</p>
              <p className={styles.emptySub}>{t('portfolio.emptyBody2')}</p>
            </div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.thSortable} onClick={() => handleSort('ticker')}>
                    <span className={styles.thInner}>
                      {t('portfolio.colTicker')}
                      <SortIcon col="ticker" sortKey={sortKey} sortDir={sortDir} />
                    </span>
                  </th>
                  <th className={styles.th}>{t('portfolio.colShares')}</th>
                  <th className={styles.th}>{t('portfolio.colAvgCost')}</th>
                  <th className={styles.th}>{t('portfolio.colPrice')}</th>
                  <th className={`${styles.th} ${styles.thRight}`} onClick={() => handleSort('marketValue')} style={{ cursor: 'pointer' }}>
                    <span className={styles.thInner} style={{ justifyContent: 'flex-end' }}>
                      {t('portfolio.colValue')}
                      <SortIcon col="marketValue" sortKey={sortKey} sortDir={sortDir} />
                    </span>
                  </th>
                  <th className={`${styles.th} ${styles.thRight}`} onClick={() => handleSort('pl')} style={{ cursor: 'pointer' }}>
                    <span className={styles.thInner} style={{ justifyContent: 'flex-end' }}>
                      {t('portfolio.colPL')}
                      <SortIcon col="pl" sortKey={sortKey} sortDir={sortDir} />
                    </span>
                  </th>
                  <th className={`${styles.th} ${styles.thRight}`} onClick={() => handleSort('plPct')} style={{ cursor: 'pointer' }}>
                    <span className={styles.thInner} style={{ justifyContent: 'flex-end' }}>
                      {t('portfolio.colPLPct')}
                      <SortIcon col="plPct" sortKey={sortKey} sortDir={sortDir} />
                    </span>
                  </th>
                  <th className={`${styles.th} ${styles.thRight}`} onClick={() => handleSort('weight')} style={{ cursor: 'pointer' }}>
                    <span className={styles.thInner} style={{ justifyContent: 'flex-end' }}>
                      {t('portfolio.colWeight')}
                      <SortIcon col="weight" sortKey={sortKey} sortDir={sortDir} />
                    </span>
                  </th>
                  <th className={styles.thDelete} />
                </tr>
              </thead>
              <tbody>
                {sorted.map((ep) => {
                  const mv = calcMarketValue(ep, ep.quote);
                  const pl = calcPL(ep, ep.quote);
                  const plPct = calcPLPct(ep, ep.quote);
                  const weight = totalMarketValue > 0 ? (mv / totalMarketValue) * 100 : 0;
                  const plPos = pl >= 0;
                  const dailyPos = ep.quote ? ep.quote.change >= 0 : true;

                  return (
                    <tr key={ep.ticker} className={styles.row}>
                      <td className={styles.tdTicker}>
                        <span className={styles.tickerSymbol}>{ep.ticker}</span>
                        {ep.quote && (
                          <span className={styles.tickerName}>{ep.quote.name}</span>
                        )}
                      </td>

                      <td className={styles.tdNum}>
                        {ep.shares.toLocaleString('en-US', { maximumFractionDigits: 4 })}
                      </td>

                      <td className={styles.tdNum}>{formatPrice(ep.avgCost)}</td>

                      <td className={styles.tdNum}>
                        {ep.loading ? (
                          <Loader size={11} className={styles.spinner} />
                        ) : ep.error ? (
                          <span className={styles.tdError}>—</span>
                        ) : ep.quote ? (
                          <span className={`${dailyPos ? styles.positive : styles.negative}`}>
                            {formatPrice(ep.quote.price)}
                          </span>
                        ) : '—'}
                      </td>

                      <td className={`${styles.tdNum} ${styles.tdRight}`}>
                        {formatCurrency(mv)}
                      </td>

                      <td className={`${styles.tdNum} ${styles.tdRight} ${plPos ? styles.positive : styles.negative}`}>
                        {ep.loading ? (
                          <Loader size={11} className={styles.spinner} />
                        ) : (
                          (plPos ? '+' : '') + formatCurrency(pl)
                        )}
                      </td>

                      <td className={`${styles.tdNum} ${styles.tdRight} ${plPos ? styles.positive : styles.negative}`}>
                        {ep.loading ? (
                          <Loader size={11} className={styles.spinner} />
                        ) : (
                          formatPct(plPct)
                        )}
                      </td>

                      <td className={`${styles.tdNum} ${styles.tdRight}`}>
                        <div className={styles.weightCell}>
                          <span className={styles.weightValue}>{weight.toFixed(1)}%</span>
                          <div className={styles.weightBar}>
                            <div
                              className={styles.weightFill}
                              style={{ width: `${Math.min(weight, 100)}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      <td className={styles.tdDelete}>
                        {onAnalyze && (
                          <button
                            className={`${styles.analyzeBtn} ${styles.analyzeBtnDag}`}
                            onClick={() => onAnalyze(ep.ticker)}
                            title={t('portfolio.analyzeInDag')}
                          >
                            DAG
                          </button>
                        )}
                        <button
                          className={styles.deleteBtn}
                          onClick={() => handleDelete(ep.ticker)}
                          title={t('portfolio.deletePosition')}
                          aria-label={t('portfolio.deletePosition')}
                        >
                          <X size={12} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Add position form ── */}
        <div className={styles.addPanel}>
          <div className={styles.addPanelHeader}>
            <Plus size={12} className={styles.addPanelIcon} />
            <span>{t('portfolio.addPosition')}</span>
          </div>

          <form className={styles.addForm} onSubmit={handleAddPosition}>
            <div className={styles.fieldRow}>
              <label className={styles.fieldLabel}>{t('portfolio.fieldTicker')}</label>
              <input
                className={styles.fieldInput}
                type="text"
                placeholder="AAPL"
                value={formTicker}
                onChange={(e) => setFormTicker(e.target.value.toUpperCase())}
                maxLength={10}
                disabled={formLoading}
              />
            </div>

            <div className={styles.fieldRow}>
              <label className={styles.fieldLabel}>{t('portfolio.fieldShares')}</label>
              <input
                className={styles.fieldInput}
                type="number"
                placeholder="10"
                min="0.0001"
                step="any"
                value={formShares}
                onChange={(e) => setFormShares(e.target.value)}
                disabled={formLoading}
              />
            </div>

            <div className={styles.fieldRow}>
              <label className={styles.fieldLabel}>{t('portfolio.fieldAvgCost')}</label>
              <input
                className={styles.fieldInput}
                type="number"
                placeholder="150.00"
                min="0.01"
                step="0.01"
                value={formCost}
                onChange={(e) => setFormCost(e.target.value)}
                disabled={formLoading}
              />
            </div>

            {formError && (
              <div className={styles.formError}>{formError}</div>
            )}

            <button
              type="submit"
              className={styles.addBtn}
              disabled={formLoading}
            >
              {formLoading ? (
                <><Loader size={12} className={styles.spinner} /> {t('portfolio.adding')}</>
              ) : (
                <><Plus size={12} /> {t('portfolio.addBtn')}</>
              )}
            </button>
          </form>

          {hasPositions && (
            <div className={styles.refreshNote}>
              {t('portfolio.autoRefresh')}
            </div>
          )}
        </div>
      </div>

      {/* ── Exposure Review ── */}
      {!hasPositions && (
        <div className={wf.section} style={{ margin: '0 16px 16px' }}>
          <div className={wf.sectionHead}>
            <h2 className={wf.sectionTitle}>{t('exposure.title')}</h2>
            <button className={wf.button} disabled title={t('portfolio.exposureDisabledTip')}>
              {t('exposure.run')}
            </button>
          </div>
          <div className={wf.empty}>{t('exposure.empty')}</div>
        </div>
      )}
      {hasPositions && (
        <div className={wf.section} style={{ margin: '16px' }}>
          <div className={wf.sectionHead}>
            <h2 className={wf.sectionTitle}>{t('exposure.title')}</h2>
            <button
              className={wf.button}
              onClick={handleExposure}
              disabled={exposureLoading}
            >
              {exposureLoading ? (
                <span className={wf.loadingRow}>
                  <span className={wf.spinner} /> {t('exposure.running')}
                </span>
              ) : (
                t('exposure.run')
              )}
            </button>
          </div>

          {exposureError && (
            <div className={wf.errorBox}>
              <span>{exposureError}</span>
              <button className={wf.smallBtn} onClick={handleExposure}>
                {t('common.retry')}
              </button>
            </div>
          )}

          {!exposure && !exposureLoading && !exposureError && (
            <div className={wf.empty}>{t('exposure.empty')}</div>
          )}

          {exposure && (
            <>
              <div className={wf.statGrid}>
                <div className={wf.statCard}>
                  <div className={wf.statLabel}>{t('exposure.totalValue')}</div>
                  <div className={wf.statValue}>{formatCurrency(exposure.total_value)}</div>
                </div>
                <div className={wf.statCard}>
                  <div className={wf.statLabel}>{t('exposure.cashWeight')}</div>
                  <div className={wf.statValue}>
                    {(exposure.cash_weight * 100).toFixed(1)}%
                  </div>
                </div>
              </div>

              {exposure.review.summary && (
                <div className={wf.summary} style={{ marginBottom: 16 }}>
                  {exposure.review.summary}
                </div>
              )}

              {exposure.review.concentration.length > 0 && (
                <>
                  <div className={wf.groupLabel}>{t('exposure.concentration')}</div>
                  {exposure.review.concentration.map((c, i) => (
                    <div className={wf.item} key={`conc-${i}`}>
                      <div className={wf.itemMain}>
                        <span className={wf.itemTicker}>{c.type}</span>
                        <div className={wf.itemReason}>{c.detail}</div>
                      </div>
                      <span className={`${wf.badge} ${severityClass(c.severity)}`}>
                        {c.severity}
                      </span>
                    </div>
                  ))}
                </>
              )}

              {exposure.review.theme_breakdown.length > 0 && (
                <>
                  <div className={wf.groupLabel}>{t('exposure.themeBreakdown')}</div>
                  {(() => {
                    const maxW = Math.max(
                      ...exposure.review.theme_breakdown.map((b) => b.weight_pct),
                      1
                    );
                    return exposure.review.theme_breakdown.map((b, i) => (
                      <div className={wf.barRow} key={`theme-${i}`}>
                        <span className={wf.barLabel} title={b.theme}>
                          {b.theme}
                        </span>
                        <span className={wf.barTrack}>
                          <span
                            className={wf.barFill}
                            style={{ width: `${(b.weight_pct / maxW) * 100}%` }}
                          />
                        </span>
                        <span className={wf.barValue}>{b.weight_pct.toFixed(1)}%</span>
                      </div>
                    ));
                  })()}
                </>
              )}

              {exposure.review.watch_items.length > 0 && (
                <>
                  <div className={wf.groupLabel}>{t('exposure.watchItems')}</div>
                  <div className={wf.tickerChips}>
                    {exposure.review.watch_items.map((tk, i) => (
                      <span key={`wi-${i}`} className={wf.tickerChip}>
                        {tk}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Rebalance section ── */}
      {hasPositions && (
        <div className={wf.section} style={{ margin: '16px' }}>
          <div className={wf.sectionHead}>
            <div>
              <h2 className={wf.sectionTitle}>{t('portfolio.rebalance')}</h2>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>{t('ai.hint')}</span>
            </div>
            <button
              className={wf.button}
              onClick={handleRebalance}
              disabled={rebalanceLoading}
            >
              {rebalanceLoading
                ? <><span className={wf.spinner} /> {t('portfolio.rebalancing')}</>
                : t('portfolio.rebalance')}
            </button>
          </div>

          {rebalanceError && (
            <div className={wf.errorBox}>
              <span>{rebalanceError}</span>
              <button className={wf.smallBtn} onClick={handleRebalance}>{t('common.retry')}</button>
            </div>
          )}

          {!rebalance && !rebalanceLoading && !rebalanceError && (
            <div className={wf.empty}>{t('portfolio.rebalance')}</div>
          )}

          {rebalance && (
            <>
              {/* Plan summary */}
              {rebalance.plan.summary && (
                <div className={wf.summary} style={{ marginBottom: 16 }}>
                  {rebalance.plan.summary}
                </div>
              )}

              {/* Market survey: hot sectors */}
              {rebalance.survey.hot_sectors.length > 0 && (
                <>
                  <div className={wf.groupLabel}>{t('portfolio.hotSectors')}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                    {rebalance.survey.hot_sectors.map((s, i) => {
                      const pos = s.change_pct >= 0;
                      return (
                        <span key={i} className={wf.tickerChip} style={{
                          borderLeft: `3px solid ${pos ? 'var(--green)' : 'var(--red)'}`,
                          color: pos ? 'var(--green)' : 'var(--red)',
                          fontWeight: 600,
                        }}>
                          {s.ticker || s.sector}&nbsp;
                          <span style={{ fontSize: 10, opacity: 0.85 }}>
                            {pos ? '+' : ''}{s.change_pct.toFixed(2)}%
                          </span>
                        </span>
                      );
                    })}
                  </div>
                </>
              )}

              {/* Market survey: candidates */}
              {rebalance.survey.candidates.length > 0 && (
                <>
                  <div className={wf.groupLabel}>{t('portfolio.candidates')}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                    {rebalance.survey.candidates.map((c, i) => {
                      const pos = c.change_pct >= 0;
                      return (
                        <div key={i} style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                          borderRadius: 'var(--radius)', padding: '5px 10px',
                        }}>
                          <span style={{ fontWeight: 700, fontSize: 12 }}>{c.ticker}</span>
                          {c.price != null && (
                            <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                              ${c.price.toFixed(2)}
                            </span>
                          )}
                          <span style={{ fontSize: 11, fontWeight: 600, color: pos ? 'var(--green)' : 'var(--red)' }}>
                            {pos ? '+' : ''}{c.change_pct.toFixed(2)}%
                          </span>
                          <button
                            className={wf.smallBtn}
                            onClick={() => addToWatchlist(c.ticker)}
                            title={t('watchlist.add')}
                          >
                            +
                          </button>
                          {onAnalyze && (
                            <button
                              className={wf.smallBtn}
                              onClick={() => onAnalyze(c.ticker)}
                              title={t('portfolio.analyzeInDag')}
                            >
                              DAG
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {/* Rotation plan */}
              {rebalance.plan.rotation.length > 0 && (
                <>
                  <div className={wf.groupLabel}>{t('portfolio.rotationPlan')}</div>
                  {rebalance.plan.rotation.map((r, i) => {
                    const convictionColor =
                      r.conviction === 'high' ? 'var(--green)' :
                      r.conviction === 'medium' ? 'var(--orange)' : 'var(--text-muted)';
                    const convictionBg =
                      r.conviction === 'high' ? 'rgba(38,166,154,0.12)' :
                      r.conviction === 'medium' ? 'rgba(255,152,0,0.12)' : 'var(--bg-tertiary)';
                    return (
                      <div key={i} className={wf.item}>
                        <div className={wf.itemMain}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <span className={wf.itemTicker} style={{ color: 'var(--red)' }}>{r.from}</span>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>
                              −{r.trim_pct}%
                            </span>
                            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>→</span>
                            <span className={wf.itemTicker} style={{ color: 'var(--green)' }}>{r.to}</span>
                            {onAnalyze && (
                              <button
                                className={wf.smallBtn}
                                style={{ marginLeft: 4 }}
                                onClick={() => onAnalyze(r.to)}
                                title={t('portfolio.analyzeInDag')}
                              >
                                DAG
                              </button>
                            )}
                            <button
                              className={wf.smallBtn}
                              onClick={() => addToWatchlist(r.to)}
                              title={t('watchlist.add')}
                            >
                              +
                            </button>
                          </div>
                          <div className={wf.itemReason}>{r.reason}</div>
                        </div>
                        <span className={wf.badge} style={{ color: convictionColor, background: convictionBg }}>
                          {r.conviction}
                        </span>
                      </div>
                    );
                  })}
                </>
              )}

              {/* Additional candidates from plan */}
              {rebalance.plan.candidates.length > 0 && (
                <>
                  <div className={wf.groupLabel}>{t('portfolio.candidates')}</div>
                  {rebalance.plan.candidates.map((c, i) => (
                    <div key={i} className={wf.item}>
                      <div className={wf.itemMain}>
                        <span className={wf.itemTicker}>{c.ticker}</span>
                        <div className={wf.itemReason}>{c.reason}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          className={wf.smallBtn}
                          onClick={() => addToWatchlist(c.ticker)}
                          title={t('watchlist.add')}
                        >
                          + {t('watchlist.add')}
                        </button>
                        {onAnalyze && (
                          <button
                            className={wf.smallBtn}
                            onClick={() => onAnalyze(c.ticker)}
                            title={t('portfolio.analyzeInDag')}
                          >
                            DAG
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </>
              )}

              {/* Hot sector themes from plan */}
              {rebalance.plan.hot_sectors.length > 0 && (
                <>
                  <div className={wf.groupLabel}>{t('portfolio.hotSectors')}</div>
                  {rebalance.plan.hot_sectors.map((s, i) => (
                    <div key={i} className={wf.item}>
                      <div className={wf.itemMain}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                          <span className={wf.itemTicker}>{s.sector}</span>
                          <span style={{
                            fontSize: 11, fontWeight: 600,
                            color: s.change_pct >= 0 ? 'var(--green)' : 'var(--red)',
                          }}>
                            {s.change_pct >= 0 ? '+' : ''}{s.change_pct.toFixed(2)}%
                          </span>
                        </div>
                        <div className={wf.itemReason}>{s.why}</div>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Advice modal ── */}
      {adviceOpen && (
        <div className={styles.modalOverlay} onClick={() => setAdviceOpen(false)}>
          <div className={styles.modalPanel} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <span className={styles.modalTitle}>{t('portfolio.adviceTitle')}</span>
              <button className={styles.modalClose} aria-label={t('common.close')} onClick={() => setAdviceOpen(false)}>
                <X size={14} />
              </button>
            </div>

            <div className={styles.modalBody}>
              {adviceLoading && (
                <div className={styles.modalLoading}>
                  <Loader size={20} className={styles.spinner} />
                  <span>{t('portfolio.analyzing')}</span>
                </div>
              )}

              {!adviceLoading && adviceData && (
                <>
                  {adviceData.error && !adviceData.summary && (
                    <div className={styles.adviceError}>{adviceData.error}</div>
                  )}

                  {adviceData.summary && (
                    <p className={styles.adviceSummary}>{adviceData.summary}</p>
                  )}

                  {adviceData.actions.length > 0 && (
                    <div className={styles.adviceSection}>
                      {adviceData.actions.map((a) => (
                        <div key={a.ticker} className={styles.actionRow}>
                          <span
                            className={`${styles.actionBadge} ${
                              a.action === 'TRIM'
                                ? styles.badgeTrim
                                : a.action === 'ADD'
                                ? styles.badgeAdd
                                : styles.badgeHold
                            }`}
                          >
                            {a.action === 'TRIM'
                              ? t('portfolio.trim')
                              : a.action === 'ADD'
                              ? t('portfolio.add')
                              : t('portfolio.hold')}
                          </span>
                          <span className={styles.actionTicker}>{a.ticker}</span>
                          {a.pct != null && (
                            <span className={styles.actionPct}>{a.pct}%</span>
                          )}
                          <span className={styles.actionReason}>{a.reason}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {adviceData.suggestions.length > 0 && (
                    <div className={styles.suggestionsSection}>
                      <div className={styles.suggestionsLabel}>{t('portfolio.suggestions')}</div>
                      <div className={styles.suggestionChips}>
                        {adviceData.suggestions.map((s) => (
                          <div key={s.ticker} className={styles.suggestionChip} title={s.reason}>
                            <span className={styles.suggestionTicker}>{s.ticker}</span>
                            <span className={styles.suggestionReason}>{s.reason}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
