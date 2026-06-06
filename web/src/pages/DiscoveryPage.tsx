import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { RefreshCw } from 'lucide-react';
import { fetchMarketMovers, runScreen, fetchScreenerFields, runFactorScreen, fetchSectorRotation, fetchPairs, type ScreenerFilters, type ScreenerResult, type ScreenerRow, type FactorRow, type SectorRotation, type PairRow } from '../api/client';
import { useI18n } from '../i18n/context';
import { addToWatchlist, isInWatchlist } from '../lib/workspace';
import styles from './DiscoveryPage.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Mover {
  ticker: string;
  price: number;
  change: number;
  change_pct: number;
  volume?: number;
}

interface MoversData {
  gainers: Mover[];
  losers: Mover[];
  most_active: Mover[];
}

interface TreemapRect {
  x: number; y: number; width: number; height: number; data: Mover;
}

interface SectorGroup {
  name: string; movers: Mover[]; totalVolume: number; avgChangePct: number;
}

interface SectorRect {
  x: number; y: number; width: number; height: number; sector: SectorGroup;
}

type DiscoverTab = 'heatmap' | 'screener' | 'factors' | 'sectors' | 'pairs';

// ─── Sector Mapping ───────────────────────────────────────────────────────────

const SECTOR_MAP: Record<string, string> = {
  AAPL: 'Consumer Electronics', MSFT: 'Infrastructure Software', GOOGL: 'Internet Content',
  GOOG: 'Internet Content', META: 'Internet Content', NVDA: 'Semiconductors',
  AMD: 'Semiconductors', INTC: 'Semiconductors', AVGO: 'Semiconductors',
  QCOM: 'Semiconductors', TSM: 'Semiconductors', MU: 'Semiconductors',
  AMAT: 'Semiconductors', TSLA: 'Auto Manufacturers', AMZN: 'Internet Retail',
  JPM: 'Banks', BAC: 'Banks', WFC: 'Banks', GS: 'Banks', MS: 'Banks',
  V: 'Credit Services', MA: 'Credit Services', PYPL: 'Credit Services',
  NFLX: 'Entertainment', DIS: 'Entertainment', ORCL: 'Infrastructure Software',
  CRM: 'Infrastructure Software', SAP: 'Infrastructure Software',
  NOW: 'Infrastructure Software', PLTR: 'Infrastructure Software',
  PANW: 'Infrastructure Software', CRWD: 'Infrastructure Software',
  SNOW: 'Infrastructure Software', UNH: 'Health Insurance',
  JNJ: 'Pharmaceuticals', PFE: 'Pharmaceuticals', ABBV: 'Pharmaceuticals',
  LLY: 'Pharmaceuticals', XOM: 'Oil & Gas', CVX: 'Oil & Gas',
  WMT: 'Discount Stores', COST: 'Discount Stores',
  PG: 'Consumer Goods', KO: 'Consumer Goods', PEP: 'Consumer Goods',
  BRK: 'Financials', BRKB: 'Financials',
};

const SECTOR_LABELS: Record<string, string> = {
  'Semiconductors': '半導體', 'Internet Content': '互聯網',
  'Infrastructure Software': '基礎設施軟件', 'Consumer Electronics': '消費電子',
  'Banks': '銀行', 'Internet Retail': '互聯網零售', 'Credit Services': '信用服務',
  'Auto Manufacturers': '汽車製造', 'Entertainment': '娛樂',
  'Health Insurance': '健康保險', 'Pharmaceuticals': '製藥',
  'Oil & Gas': '石油天然氣', 'Discount Stores': '折扣零售',
  'Consumer Goods': '消費品', 'Financials': '金融', 'Other': '其他',
};

// ─── Color Helpers ────────────────────────────────────────────────────────────

function getColor(changePct: number): string {
  const abs = Math.min(Math.abs(changePct), 5);
  if (abs < 0.5) return 'rgba(109, 123, 145, 0.2)';
  const opacity = abs < 1 ? 0.08 : abs < 2 ? 0.15 : 0.25;
  return changePct > 0 ? `rgba(0, 168, 112, ${opacity})` : `rgba(240, 58, 85, ${opacity})`;
}

function getTextColor(changePct: number): string {
  if (Math.abs(changePct) < 0.5) return 'rgba(145, 152, 161, 0.9)';
  return changePct >= 0 ? '#00A870' : '#F03A55';
}

function getSectorHeaderColor(changePct: number): string {
  if (Math.abs(changePct) < 0.5) return 'rgba(145, 152, 161, 0.9)';
  return changePct >= 0 ? '#00C896' : '#F03A55';
}

// ─── Treemap Algorithm ────────────────────────────────────────────────────────

function layoutTreemap(items: { value: number; data: Mover }[], x: number, y: number, w: number, h: number): TreemapRect[] {
  if (items.length === 0) return [];
  if (items.length === 1) return [{ x, y, width: w, height: h, data: items[0].data }];
  const total = items.reduce((s, i) => s + i.value, 0);
  if (total === 0) return [];
  const sorted = [...items].sort((a, b) => b.value - a.value);
  let bestSplit = 1, bestWorst = Infinity;
  for (let i = 1; i < sorted.length; i++) {
    const leftSum = sorted.slice(0, i).reduce((s, x) => s + x.value, 0);
    const leftRatio = leftSum / total;
    const isWide = w >= h;
    const leftW = isWide ? w * leftRatio : w, leftH = isWide ? h : h * leftRatio;
    const rightW = isWide ? w * (1 - leftRatio) : w, rightH = isWide ? h : h * (1 - leftRatio);
    const worst = Math.max(
      leftH > 0 && leftW > 0 ? Math.max(leftW / leftH, leftH / leftW) : Infinity,
      rightH > 0 && rightW > 0 ? Math.max(rightW / rightH, rightH / rightW) : Infinity
    );
    if (worst < bestWorst) { bestWorst = worst; bestSplit = i; }
  }
  const left = sorted.slice(0, bestSplit), right = sorted.slice(bestSplit);
  const leftRatio = left.reduce((s, x) => s + x.value, 0) / total;
  const isWide = w >= h;
  return isWide
    ? [...layoutTreemap(left, x, y, w * leftRatio, h), ...layoutTreemap(right, x + w * leftRatio, y, w * (1 - leftRatio), h)]
    : [...layoutTreemap(left, x, y, w, h * leftRatio), ...layoutTreemap(right, x, y + h * leftRatio, w, h * (1 - leftRatio))];
}

function layoutSectors(sectors: SectorGroup[], x: number, y: number, w: number, h: number): SectorRect[] {
  if (sectors.length === 0) return [];
  if (sectors.length === 1) return [{ x, y, width: w, height: h, sector: sectors[0] }];
  const total = sectors.reduce((s, sec) => s + sec.totalVolume, 0);
  if (total === 0) return [];
  const sorted = [...sectors].sort((a, b) => b.totalVolume - a.totalVolume);
  let bestSplit = 1, bestWorst = Infinity;
  for (let i = 1; i < sorted.length; i++) {
    const leftSum = sorted.slice(0, i).reduce((s, sec) => s + sec.totalVolume, 0);
    const leftRatio = leftSum / total;
    const isWide = w >= h;
    const leftW = isWide ? w * leftRatio : w, leftH = isWide ? h : h * leftRatio;
    const rightW = isWide ? w * (1 - leftRatio) : w, rightH = isWide ? h : h * (1 - leftRatio);
    const worst = Math.max(
      leftH > 0 && leftW > 0 ? Math.max(leftW / leftH, leftH / leftW) : Infinity,
      rightH > 0 && rightW > 0 ? Math.max(rightW / rightH, rightH / rightW) : Infinity
    );
    if (worst < bestWorst) { bestWorst = worst; bestSplit = i; }
  }
  const left = sorted.slice(0, bestSplit), right = sorted.slice(bestSplit);
  const leftRatio = left.reduce((s, sec) => s + sec.totalVolume, 0) / total;
  const isWide = w >= h;
  return isWide
    ? [...layoutSectors(left, x, y, w * leftRatio, h), ...layoutSectors(right, x + w * leftRatio, y, w * (1 - leftRatio), h)]
    : [...layoutSectors(left, x, y, w, h * leftRatio), ...layoutSectors(right, x, y + h * leftRatio, w, h * (1 - leftRatio))];
}

// ─── Data Processing ──────────────────────────────────────────────────────────

function dedupeMovers(data: MoversData): Mover[] {
  const seen = new Set<string>(); const out: Mover[] = [];
  for (const list of [data.gainers, data.losers, data.most_active])
    for (const m of list) if (!seen.has(m.ticker)) { seen.add(m.ticker); out.push(m); }
  return out;
}

function groupBySector(movers: Mover[]): SectorGroup[] {
  const map = new Map<string, Mover[]>();
  for (const m of movers) {
    const sector = SECTOR_MAP[m.ticker] ?? 'Other';
    if (!map.has(sector)) map.set(sector, []);
    map.get(sector)!.push(m);
  }
  const groups: SectorGroup[] = [];
  for (const [name, ms] of map.entries()) {
    groups.push({
      name, movers: ms,
      totalVolume: ms.reduce((s, m) => s + (m.volume ?? 1_000_000), 0),
      avgChangePct: ms.reduce((s, m) => s + m.change_pct, 0) / ms.length,
    });
  }
  return groups.sort((a, b) => b.totalVolume - a.totalVolume);
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmt(n: number, d = 2): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function sign(n: number): string { return n >= 0 ? '+' : ''; }
function fmtVol(n: number): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + 'B';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(0) + 'K';
  return String(n);
}

// ─── Tooltip ──────────────────────────────────────────────────────────────────

interface TooltipState { mover: Mover; x: number; y: number; }

function Tooltip({ state }: { state: TooltipState }) {
  const { mover, x, y } = state;
  const textColor = getTextColor(mover.change_pct);
  return (
    <div className={styles.tooltip} style={{
      left: x + 12, top: y - 10,
      transform: x > window.innerWidth - 200 ? 'translateX(-110%)' : undefined,
    }}>
      <div className={styles.tooltipTicker}>{mover.ticker}</div>
      <div className={styles.tooltipPrice}>${fmt(mover.price)}</div>
      <div className={styles.tooltipChange} style={{ color: textColor }}>
        {sign(mover.change)}{fmt(mover.change)} ({sign(mover.change_pct)}{fmt(mover.change_pct)}%)
      </div>
      {mover.volume != null && <div className={styles.tooltipVolume}>Vol: {fmtVol(mover.volume)}</div>}
    </div>
  );
}

// ─── Stock Cell ───────────────────────────────────────────────────────────────

function StockCell({ rect, gap, onHover, onClick }: {
  rect: TreemapRect; gap: number;
  onHover: (mover: Mover | null, x: number, y: number) => void;
  onClick: (ticker: string) => void;
}) {
  const { x, y, width, height, data } = rect;
  const rx = x + gap, ry = y + gap, rw = width - gap * 2, rh = height - gap * 2;
  if (rw < 4 || rh < 4) return null;
  const textColor = getTextColor(data.change_pct);
  const tickerSize = rw > 80 ? 14 : rw > 50 ? 11 : 9;
  const showTicker = rw > 28 && rh > 20, showPct = rw > 40 && rh > 36;
  const cx = rx + rw / 2, cy = ry + rh / 2;
  return (
    <g className={styles.stockCell} onClick={() => onClick(data.ticker)}
      onMouseMove={(e) => onHover(data, e.clientX, e.clientY)}
      onMouseLeave={() => onHover(null, 0, 0)} style={{ cursor: 'pointer' }}>
      <rect x={rx} y={ry} width={rw} height={rh} rx={2} fill={getColor(data.change_pct)} className={styles.stockRect} />
      {showTicker && <text x={cx} y={showPct ? cy - 7 : cy + tickerSize * 0.35} textAnchor="middle"
        fontSize={tickerSize} fontWeight="700" fill={textColor}
        style={{ userSelect: 'none', pointerEvents: 'none', fontFamily: 'inherit' }}>{data.ticker}</text>}
      {showPct && <text x={cx} y={cy + 10} textAnchor="middle"
        fontSize={Math.min(tickerSize - 1, 11)} fontWeight="500" fill={textColor}
        style={{ userSelect: 'none', pointerEvents: 'none', fontFamily: 'inherit' }}>
        {sign(data.change_pct)}{fmt(data.change_pct)}%</text>}
    </g>
  );
}

// ─── Sector Block ─────────────────────────────────────────────────────────────

const HEADER_H = 40, SECTOR_GAP = 4, CELL_GAP = 1;

function SectorBlock({ sRect, onHover, onSelectTicker }: {
  sRect: SectorRect;
  onHover: (mover: Mover | null, x: number, y: number) => void;
  onSelectTicker: (ticker: string) => void;
}) {
  const { x, y, width, height, sector } = sRect;
  const bx = x + SECTOR_GAP, by = y + SECTOR_GAP;
  const bw = width - SECTOR_GAP * 2, bh = height - SECTOR_GAP * 2;
  if (bw < 20 || bh < 20) return null;
  const innerH = Math.max(0, bh - HEADER_H);
  const headerColor = getSectorHeaderColor(sector.avgChangePct);
  const label = SECTOR_LABELS[sector.name] ?? sector.name;
  const items = sector.movers.map((m) => ({ value: Math.max(m.volume ?? 1_000_000, 1), data: m }));
  const stockRects = innerH > 10 ? layoutTreemap(items, 0, 0, bw, innerH) : [];
  return (
    <g>
      <rect x={bx} y={by} width={bw} height={bh} rx={3}
        fill="rgba(30, 34, 45, 0.6)" stroke="rgba(54, 58, 69, 0.5)" strokeWidth={0.5} />
      <foreignObject x={bx} y={by} width={bw} height={HEADER_H}>
        {/* @ts-expect-error xmlns required for foreignObject */}
        <div xmlns="http://www.w3.org/1999/xhtml" className={styles.sectorHeader}>
          <span className={styles.sectorName}>{label}</span>
          <span className={styles.sectorPct} style={{ color: headerColor }}>
            {sign(sector.avgChangePct)}{fmt(sector.avgChangePct)}%
          </span>
        </div>
      </foreignObject>
      <g transform={`translate(${bx}, ${by + HEADER_H})`}>
        {stockRects.map((r) => (
          <StockCell key={r.data.ticker} rect={r} gap={CELL_GAP} onHover={onHover} onClick={onSelectTicker} />
        ))}
      </g>
    </g>
  );
}

// ─── Heatmap Legend ───────────────────────────────────────────────────────────

function HeatmapLegend() {
  return (
    <div className={styles.legend}>
      {[-3, -2, -1, 0, 1, 2, 3].map((v) => (
        <div key={v} className={styles.legendItem}>
          <div className={styles.legendSwatch} style={{ background: getColor(v) }} />
          <span className={styles.legendLabel} style={{ color: getTextColor(v) }}>
            {v > 0 ? '+' : ''}{v}%
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function TreemapSkeleton({ width, height }: { width: number; height: number }) {
  const rects = [
    { x: 4, y: 4, w: width * 0.45 - 8, h: height * 0.6 - 8 },
    { x: width * 0.45 + 4, y: 4, w: width * 0.35 - 8, h: height * 0.6 - 8 },
    { x: width * 0.8 + 4, y: 4, w: width * 0.2 - 8, h: height * 0.6 - 8 },
    { x: 4, y: height * 0.6 + 4, w: width * 0.3 - 8, h: height * 0.4 - 8 },
    { x: width * 0.3 + 4, y: height * 0.6 + 4, w: width * 0.4 - 8, h: height * 0.4 - 8 },
    { x: width * 0.7 + 4, y: height * 0.6 + 4, w: width * 0.3 - 8, h: height * 0.4 - 8 },
  ];
  return (
    <svg width={width} height={height} className={styles.skeletonSvg}>
      {rects.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={Math.max(0, r.w)} height={Math.max(0, r.h)} rx={3} className={styles.skeletonRect} />
      ))}
    </svg>
  );
}

// ─── Screener (embedded) ──────────────────────────────────────────────────────

// Per-row watchlist toggle button
function WatchlistRowBtn({ ticker, t }: { ticker: string; t: (k: string) => string }) {
  const [added, setAdded] = useState(() => isInWatchlist(ticker));
  return (
    <button
      className={`${styles.wlBtn} ${added ? styles.wlBtnDone : ''}`}
      title={added ? t('watchlist.added') : t('watchlist.add')}
      onClick={(e) => {
        e.stopPropagation();
        if (added) return;
        addToWatchlist(ticker);
        setAdded(true);
      }}
    >
      {added ? '✓' : '+'}
    </button>
  );
}

function EmbeddedScreener({ onViewChart }: { onViewChart: (ticker: string) => void }) {
  const { t } = useI18n();
  const [filters, setFilters] = useState<ScreenerFilters>({ sort_by: 'chg_1d', desc: true, limit: 50 });
  const [sortableCols, setSortableCols] = useState<string[]>(['chg_1d', 'chg_1w', 'chg_1m', 'price', 'rel_volume']);
  const [universe, setUniverse] = useState<number | null>(null);
  const [result, setResult] = useState<ScreenerResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchScreenerFields()
      .then((f) => { setSortableCols(f.sortable); setUniverse(f.universe_size); })
      .catch(() => {});
  }, []);

  const setNum = useCallback((key: keyof ScreenerFilters, raw: string) => {
    setFilters((prev) => {
      const next = { ...prev };
      if (raw === '') delete next[key];
      else (next[key] as number) = parseFloat(raw);
      return next;
    });
  }, []);

  const toggleBool = useCallback((key: keyof ScreenerFilters) => {
    setFilters((prev) => {
      const next = { ...prev };
      if (next[key]) delete next[key];
      else (next[key] as boolean) = true;
      return next;
    });
  }, []);

  const setSort = useCallback((col: string) => {
    setFilters((prev) => ({
      ...prev,
      sort_by: col,
      desc: prev.sort_by === col ? !prev.desc : true,
    }));
  }, []);

  const run = useCallback(async () => {
    setLoading(true); setError(null);
    try { setResult(await runScreen(filters)); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, [filters]);

  const fmtPct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
  const pctCls = (n: number) => n >= 0 ? styles.scPositive : styles.scNegative;

  // Column definitions for the sortable header
  const COL_DEFS: { key: string; label: string }[] = [
    { key: 'price',   label: t('screener.price') },
    { key: 'chg_1d',  label: t('screener.chg1d') },
    { key: 'chg_1w',  label: t('screener.chg1w') },
    { key: 'chg_1m',  label: t('screener.chg1m') },
    { key: 'chg_3m',  label: t('screener.chg3m') },
    { key: 'from_high_pct', label: t('screener.fromHigh') },
    { key: 'rel_volume',    label: t('screener.relVolume') },
  ];

  return (
    <div className={styles.screener}>

      {/* ── Filter card ─────────────────────────────────────────────────────── */}
      <div className={styles.filterCard}>

        {/* Row 1: price range + change% + rel-vol */}
        <div className={styles.filterRow}>
          {/* Price */}
          <div className={styles.filterGroup}>
            <span className={styles.filterGroupLabel}>Price ($)</span>
            <div className={styles.filterPair}>
              <input className={styles.filterInput} placeholder="min"
                value={(filters.min_price as number | undefined) ?? ''}
                onChange={(e) => setNum('min_price', e.target.value)} />
              <span className={styles.filterDash}>–</span>
              <input className={styles.filterInput} placeholder="max"
                value={(filters.max_price as number | undefined) ?? ''}
                onChange={(e) => setNum('max_price', e.target.value)} />
            </div>
          </div>

          <span className={styles.filterSep} />

          {/* Change % */}
          <div className={styles.filterGroup}>
            <span className={styles.filterGroupLabel}>Min Chg %</span>
            <div className={styles.filterPair}>
              <div className={styles.filterLabeled}>
                <span className={styles.filterInline}>1D</span>
                <input className={styles.filterInput} placeholder="0"
                  value={(filters.min_chg_1d as number | undefined) ?? ''}
                  onChange={(e) => setNum('min_chg_1d', e.target.value)} />
              </div>
              <div className={styles.filterLabeled}>
                <span className={styles.filterInline}>1W</span>
                <input className={styles.filterInput} placeholder="0"
                  value={(filters.min_chg_1w as number | undefined) ?? ''}
                  onChange={(e) => setNum('min_chg_1w', e.target.value)} />
              </div>
              <div className={styles.filterLabeled}>
                <span className={styles.filterInline}>1M</span>
                <input className={styles.filterInput} placeholder="0"
                  value={(filters.min_chg_1m as number | undefined) ?? ''}
                  onChange={(e) => setNum('min_chg_1m', e.target.value)} />
              </div>
            </div>
          </div>

          <span className={styles.filterSep} />

          {/* Rel volume */}
          <div className={styles.filterGroup}>
            <span className={styles.filterGroupLabel}>Rel Vol ≥</span>
            <input className={styles.filterInput} placeholder="1.0"
              value={(filters.min_rel_volume as number | undefined) ?? ''}
              onChange={(e) => setNum('min_rel_volume', e.target.value)} />
          </div>

          <span className={styles.filterSep} />

          {/* Limit */}
          <div className={styles.filterGroup}>
            <span className={styles.filterGroupLabel}>{t('screener.limit')}</span>
            <input className={styles.filterInputNarrow} placeholder="50"
              value={filters.limit ?? ''}
              onChange={(e) => setNum('limit', e.target.value)} />
          </div>
        </div>

        {/* Row 2: bool chips + sort + run */}
        <div className={styles.filterRow}>
          {/* Bool chips */}
          <div className={styles.boolChips}>
            {([
              { key: 'above_sma20' as keyof ScreenerFilters, label: 'SMA 20' },
              { key: 'above_sma50' as keyof ScreenerFilters, label: 'SMA 50' },
              { key: 'near_high'   as keyof ScreenerFilters, label: '52w High' },
            ]).map(({ key, label }) => (
              <button key={key}
                className={`${styles.boolChip} ${filters[key] ? styles.boolChipOn : ''}`}
                onClick={() => toggleBool(key)}>
                {label}
              </button>
            ))}
          </div>

          <span className={styles.filterSep} />

          {/* Sort */}
          <div className={styles.filterGroup}>
            <span className={styles.filterGroupLabel}>{t('screener.sortBy')}</span>
            <div className={styles.filterPair}>
              <select className={styles.filterSelect}
                value={filters.sort_by}
                onChange={(e) => setFilters((p) => ({ ...p, sort_by: e.target.value }))}>
                {sortableCols.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <button
                className={`${styles.boolChip} ${styles.boolChipOn}`}
                onClick={() => setFilters((p) => ({ ...p, desc: !p.desc }))}
                title={t('tip.toggleDir')}>
                {filters.desc ? '↓' : '↑'}
              </button>
            </div>
          </div>

          {/* Spacer */}
          <span style={{ flex: 1 }} />

          {/* Universe + run */}
          {universe != null && (
            <span className={styles.universeNote}>
              {t('screener.universe').replace('{n}', String(universe))}
            </span>
          )}
          <button className={styles.runBtn} onClick={run} disabled={loading}>
            {loading
              ? <><span className={styles.scSpinner} />{t('screener.running')}</>
              : t('screener.run')}
          </button>
        </div>
      </div>

      {/* ── Results ─────────────────────────────────────────────────────────── */}
      {error && (
        <div className={styles.scError}>
          <span>{error}</span>
          <button className={styles.scRetry} onClick={run}>{t('common.retry')}</button>
        </div>
      )}
      {!result && !loading && !error && (
        <div className={styles.scEmpty}>{t('screener.empty')}</div>
      )}
      {loading && !result && (
        <div className={styles.scLoading}>
          <span className={styles.scSpinner} />{t('screener.running')}
        </div>
      )}

      {result && (
        <>
          <div className={styles.scMeta}>
            {t('screener.results').replace('{count}', String(result.count))}
          </div>
          <div className={styles.scTableWrap}>
            <table className={styles.scTable}>
              <thead>
                <tr>
                  <th className={styles.scThLeft}>Ticker</th>
                  {COL_DEFS.map(({ key, label }) => {
                    const active = filters.sort_by === key;
                    const canSort = sortableCols.includes(key);
                    return (
                      <th key={key}
                        className={`${styles.scTh} ${canSort ? styles.scThSort : ''} ${active ? styles.scThActive : ''}`}
                        onClick={canSort ? () => setSort(key) : undefined}>
                        {label}{active ? (filters.desc ? ' ↓' : ' ↑') : ''}
                      </th>
                    );
                  })}
                  <th className={styles.scThAction} />
                </tr>
              </thead>
              <tbody>
                {result.results.map((r: ScreenerRow) => (
                  <tr key={r.ticker} className={styles.scRow} onClick={() => onViewChart(r.ticker)}>
                    <td className={styles.scTdTicker}>{r.ticker}</td>
                    <td className={styles.scTd}>${r.price.toFixed(2)}</td>
                    <td className={`${styles.scTd} ${pctCls(r.chg_1d)}`}>{fmtPct(r.chg_1d)}</td>
                    <td className={`${styles.scTd} ${pctCls(r.chg_1w)}`}>{fmtPct(r.chg_1w)}</td>
                    <td className={`${styles.scTd} ${pctCls(r.chg_1m)}`}>{fmtPct(r.chg_1m)}</td>
                    <td className={`${styles.scTd} ${pctCls(r.chg_3m)}`}>{fmtPct(r.chg_3m)}</td>
                    <td className={`${styles.scTd} ${pctCls(r.from_high_pct)}`}>{fmtPct(r.from_high_pct)}</td>
                    <td className={styles.scTd}>{r.rel_volume.toFixed(2)}×</td>
                    <td className={styles.scTdAction} onClick={(e) => e.stopPropagation()}>
                      <WatchlistRowBtn ticker={r.ticker} t={t} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

// ── Multi-factor screener (Value / Momentum / Quality / Low-Vol) ──
function FactorBar({ label, value }: { label: string; value: number }) {
  const pct = Math.round(value * 100);
  const color = value >= 0.66 ? 'var(--green)' : value >= 0.33 ? '#d97706' : 'var(--red)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
      <span style={{ width: 64, color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{ flex: 1, height: 6, background: 'var(--bg-tertiary)', borderRadius: 3, overflow: 'hidden' }}>
        <span style={{ display: 'block', width: `${pct}%`, height: '100%', background: color }} />
      </span>
      <span style={{ width: 28, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{pct}</span>
    </div>
  );
}

function FactorScreener({ onViewChart }: { onViewChart: (ticker: string) => void }) {
  const { t } = useI18n();
  const [rows, setRows] = useState<FactorRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await runFactorScreen(undefined, undefined, 25);
      setRows(res.ranked);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { run(); }, [run]);

  return (
    <div style={{ padding: '12px 16px', overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t('factors.subtitle')}</span>
        <button className={styles.runBtn} onClick={run} disabled={loading}>
          {loading ? t('factors.scoring') : t('common.retry')}
        </button>
      </div>
      {error && <div style={{ color: 'var(--red)', fontSize: 12 }}>{error}</div>}
      {loading && rows.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t('factors.scoring')}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
        {rows.map((r) => (
          <div key={r.ticker}
            style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, cursor: 'pointer', background: 'var(--bg-secondary)' }}
            onClick={() => onViewChart(r.ticker)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
              <span style={{ fontWeight: 700 }}>#{r.rank} {r.ticker}</span>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>${r.price}</span>
              <span style={{ fontWeight: 800, color: 'var(--accent)' }}>{r.composite.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <FactorBar label={t('factors.value')} value={r.factors.value} />
              <FactorBar label={t('factors.momentum')} value={r.factors.momentum} />
              <FactorBar label={t('factors.quality')} value={r.factors.quality} />
              <FactorBar label={t('factors.lowVol')} value={r.factors.low_vol} />
              {r.factors.high_proximity != null && (
                <FactorBar label={t('factors.highProx')} value={r.factors.high_proximity} />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Sector rotation view ──
function SectorRotationView() {
  const { t } = useI18n();
  const [data, setData] = useState<SectorRotation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setData(await fetchSectorRotation()); }
    catch (e) { setError(e instanceof Error ? e.message : 'failed'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  return (
    <div style={{ padding: '12px 16px', overflowY: 'auto' }}>
      {data?.tilt && (
        <div style={{ marginBottom: 10, fontSize: 13 }}>
          <strong>{data.tilt}</strong>
          <span style={{ color: 'var(--text-secondary)', marginLeft: 10 }}>
            {t('discover.leaders')}: {data.leaders?.join(', ')}
          </span>
        </div>
      )}
      {error && <div style={{ color: 'var(--red)', fontSize: 12 }}>{error}</div>}
      {loading && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t('factors.scoring')}</div>}
      {(data?.sectors ?? []).map((s) => (
        <div key={s.etf} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
          <span style={{ width: 24, color: 'var(--text-secondary)' }}>#{s.rank}</span>
          <span style={{ width: 56, fontWeight: 700 }}>{s.etf}</span>
          <span style={{ flex: 1, fontSize: 13 }}>{s.sector}{s.defensive ? ' 🛡' : ''}</span>
          <span style={{ width: 70, textAlign: 'right', color: s.mom_1m >= 0 ? 'var(--green)' : 'var(--red)', fontSize: 12 }}>1m {s.mom_1m}%</span>
          <span style={{ width: 70, textAlign: 'right', color: s.mom_3m >= 0 ? 'var(--green)' : 'var(--red)', fontSize: 12 }}>3m {s.mom_3m}%</span>
        </div>
      ))}
    </div>
  );
}

// ── Pairs-trading view ──
function PairsView() {
  const { t } = useI18n();
  const [pairs, setPairs] = useState<PairRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState<string>('');
  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await fetchPairs(); setPairs(r.pairs); setNote(r.note || ''); }
    catch { setNote('failed'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  return (
    <div style={{ padding: '12px 16px', overflowY: 'auto' }}>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>{t('discover.pairsHint')}</div>
      {loading && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t('factors.scoring')}</div>}
      {!loading && pairs.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{note}</div>}
      {pairs.map((p) => (
        <div key={p.pair} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
          <span style={{ width: 110, fontWeight: 700 }}>{p.pair}</span>
          <span style={{ width: 80, fontSize: 12, color: 'var(--text-secondary)' }}>ρ {p.correlation}</span>
          <span style={{ width: 70, fontSize: 12, color: Math.abs(p.spread_z) >= 2 ? '#d97706' : 'var(--text-secondary)' }}>z {p.spread_z}</span>
          <span style={{ flex: 1, fontSize: 13 }}>{p.trade}</span>
        </div>
      ))}
    </div>
  );
}

interface DiscoveryPageProps { onSelectTicker: (ticker: string) => void; }
const REFRESH_MS = 5 * 60 * 1_000;

export function DiscoveryPage({ onSelectTicker }: DiscoveryPageProps) {
  const { t } = useI18n();
  const [tab, setTab] = useState<DiscoverTab>('heatmap');
  const [movers, setMovers] = useState<MoversData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [dims, setDims] = useState({ width: 0, height: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      const e = entries[0];
      if (e) setDims({ width: e.contentRect.width, height: e.contentRect.height });
    });
    obs.observe(el);
    setDims({ width: el.clientWidth, height: el.clientHeight });
    return () => obs.disconnect();
  }, []);

  const loadMovers = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const data = await fetchMarketMovers();
      if (!mountedRef.current) return;
      setMovers(data); setLastRefresh(new Date());
    } catch { /* silently degrade */ }
    finally { if (mountedRef.current) { setLoading(false); setRefreshing(false); } }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    loadMovers();
    const timer = setInterval(() => loadMovers(true), REFRESH_MS);
    return () => { mountedRef.current = false; clearInterval(timer); };
  }, [loadMovers]);

  const handleHover = useCallback((mover: Mover | null, x: number, y: number) => {
    setTooltip(mover ? { mover, x, y } : null);
  }, []);

  const allStocks = movers ? dedupeMovers(movers) : [];
  const sectors = useMemo(() => groupBySector(allStocks), [allStocks]);
  const { svgW, svgH } = { svgW: dims.width, svgH: dims.height };
  const sectorRects = svgW > 0 && svgH > 0 && sectors.length > 0
    ? layoutSectors(sectors, 0, 0, svgW, svgH) : [];
  const timeStr = lastRefresh.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className={styles.page}>
      {/* ── Unified header ── */}
      <div className={styles.pageHeader}>
        {/* Segmented control */}
        <div className={styles.segControl}>
          <button
            className={`${styles.segBtn} ${tab === 'heatmap' ? styles.segBtnActive : ''}`}
            onClick={() => setTab('heatmap')}>
            {t('discover.heatmap')}
          </button>
          <button
            className={`${styles.segBtn} ${tab === 'screener' ? styles.segBtnActive : ''}`}
            onClick={() => setTab('screener')}>
            {t('discover.screener')}
          </button>
          <button
            className={`${styles.segBtn} ${tab === 'factors' ? styles.segBtnActive : ''}`}
            onClick={() => setTab('factors')}>
            {t('discover.factors')}
          </button>
          <button
            className={`${styles.segBtn} ${tab === 'sectors' ? styles.segBtnActive : ''}`}
            onClick={() => setTab('sectors')}>
            {t('discover.sectorsTab')}
          </button>
          <button
            className={`${styles.segBtn} ${tab === 'pairs' ? styles.segBtnActive : ''}`}
            onClick={() => setTab('pairs')}>
            {t('discover.pairs')}
          </button>
        </div>

        {/* Heatmap legend — only when heatmap active */}
        {tab === 'heatmap' && <HeatmapLegend />}

        <div className={styles.headerRight}>
          {tab === 'heatmap' && (
            <>
              {refreshing && <span className={styles.refreshingLabel}>{t('discover.refreshing')}</span>}
              <span className={styles.lastRefresh}>{timeStr}</span>
              <button className={`${styles.refreshBtn} ${refreshing ? styles.spin : ''}`}
                onClick={() => loadMovers(true)} title={t('common.refresh')} aria-label={t('tip.refreshMarket')}>
                <RefreshCw size={12} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Heatmap tab ── */}
      {tab === 'heatmap' && (
        <div className={styles.treemapContainer} ref={containerRef}>
          {loading ? (
            <TreemapSkeleton width={svgW || 600} height={svgH || 400} />
          ) : allStocks.length === 0 ? (
            <div className={styles.emptyState}><span className={styles.emptyText}>{t('discover.noData')}</span></div>
          ) : svgW > 0 && svgH > 0 ? (
            <svg width={svgW} height={svgH} className={styles.treemapSvg} aria-label={t('discover.heatmap')}>
              {sectorRects.map((sr) => (
                <SectorBlock key={sr.sector.name} sRect={sr} onHover={handleHover} onSelectTicker={onSelectTicker} />
              ))}
            </svg>
          ) : null}
          {tooltip && <Tooltip state={tooltip} />}
        </div>
      )}

      {/* ── Screener tab ── */}
      {tab === 'screener' && <EmbeddedScreener onViewChart={onSelectTicker} />}

      {/* ── Multi-factor screener tab ── */}
      {tab === 'factors' && <FactorScreener onViewChart={onSelectTicker} />}

      {/* ── Sector rotation tab ── */}
      {tab === 'sectors' && <SectorRotationView />}

      {/* ── Pairs-trading tab ── */}
      {tab === 'pairs' && <PairsView />}
    </div>
  );
}
