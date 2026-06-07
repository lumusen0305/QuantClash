import { useEffect, useRef, useState, useCallback } from 'react';
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  ColorType,
  type IChartApi,
  type ISeriesApi,
} from 'lightweight-charts';
import {
  Search,
  ExternalLink,
  ChevronRight,
  X,
  TrendingUp,
  TrendingDown,
  Loader,
  Star,
  PanelLeftClose,
  PanelLeftOpen,
  FolderPlus,
  ChevronDown,
  Pencil,
  Trash2,
  Check,
  Workflow,
} from 'lucide-react';
import { api } from '../api/client';
import { useI18n } from '../i18n/context';
import { useTheme } from '../theme/context';
import styles from './ChartPage.module.css';
import { loadWatchlistFolders } from '../lib/workspace';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SearchResult {
  symbol: string;
  description: string;
  type: string;
  exchange: string;
}

interface Quote {
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

interface OHLCVBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface NewsItem {
  title: string;
  source: string;
  url: string;
  summary: string;
  published_at: string;
}

interface WatchlistQuote {
  price: number;
  change_pct: number;
}

interface WatchlistFolder {
  id: string;
  name: string;
  tickers: string[];
}

type Period = '1D' | '1W' | '1M' | '3M' | '1Y';

const PERIODS: Period[] = ['1D', '1W', '1M', '3M', '1Y'];
const FOLDERS_KEY = 'qc-watchlist-folders';
const REFRESH_INTERVAL = 30_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatPrice(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function genId(): string {
  return Math.random().toString(36).slice(2, 9);
}

function loadFolders(): WatchlistFolder[] {
  // Delegate to the shared canonical loader so every page reads the same data.
  // It handles the legacy `qc-watchlist` migration and the first-run seed in one place.
  const folders = loadWatchlistFolders();
  if (folders.length > 0) return folders;
  // Keep the watchlist UI renderable even when empty.
  return [{ id: 'default', name: 'My List', tickers: [] }];
}

function saveFolders(folders: WatchlistFolder[]): void {
  localStorage.setItem(FOLDERS_KEY, JSON.stringify(folders));
}

function allTickers(folders: WatchlistFolder[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const f of folders) {
    for (const t of f.tickers) {
      if (!seen.has(t)) {
        seen.add(t);
        result.push(t);
      }
    }
  }
  return result;
}

// ─── Mini Sparkline ────────────────────────────────────────────────────────────

function Sparkline({ changePct, width = 56, height = 22 }: { changePct: number; width?: number; height?: number }) {
  const positive = changePct >= 0;
  const color = positive ? 'var(--green)' : 'var(--red)';

  // Generate synthetic 8-point trend from the change_pct
  const seed = Math.abs(changePct);
  const points: number[] = [];
  let v = 0.5;
  for (let i = 0; i < 8; i++) {
    const noise = ((Math.sin(i * 2.3 + seed) + Math.cos(i * 1.7 + seed * 0.4)) * 0.18);
    v = Math.max(0.05, Math.min(0.95, v + noise));
    points.push(v);
  }
  // Clamp final point to reflect the actual direction
  if (positive) {
    points[7] = Math.max(points[7], points[0] + 0.15);
  } else {
    points[7] = Math.min(points[7], points[0] - 0.15);
  }
  // Normalize to height
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const pad = 3;
  const xs = points.map((_, i) => (i / (points.length - 1)) * width);
  const ys = points.map((p) => pad + ((1 - (p - min) / range) * (height - pad * 2)));
  const d = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ');

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" className={styles.sparkline}>
      <polyline
        points={xs.map((x, i) => `${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ')}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity="0.85"
      />
      <circle cx={xs[xs.length - 1].toFixed(1)} cy={ys[ys.length - 1].toFixed(1)} r="2" fill={color} opacity="0.9" />
      {/* Suppress unused 'd' lint warning — keep for potential future area fill */}
      {false && <path d={d} />}
    </svg>
  );
}

// ─── Chart hook ───────────────────────────────────────────────────────────────

function useChart(
  containerRef: React.RefObject<HTMLDivElement | null>,
  ohlcv: OHLCVBar[],
  theme: 'dark' | 'light',
) {
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null);

  // init chart once
  useEffect(() => {
    if (!containerRef.current) return;

    const isDark = theme === 'dark';
    const bgColor = isDark ? '#131722' : '#ffffff';
    const textColor = isDark ? '#787b86' : '#787b86';
    const gridColor = isDark ? '#1e222d' : '#f0f3fa';
    const crosshairColor = isDark ? '#363a45' : '#9598a1';
    const borderColor = isDark ? '#363a45' : '#d1d4dc';

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: bgColor },
        textColor,
        fontFamily: "'Trebuchet MS', sans-serif",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: gridColor },
        horzLines: { color: gridColor },
      },
      crosshair: {
        vertLine: { color: crosshairColor, width: 1, style: 0 },
        horzLine: { color: crosshairColor, width: 1, style: 0 },
      },
      rightPriceScale: {
        borderColor,
        scaleMargins: { top: 0.05, bottom: 0.2 },
      },
      timeScale: {
        borderColor,
        timeVisible: true,
        secondsVisible: false,
      },
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderUpColor: '#26a69a',
      borderDownColor: '#ef5350',
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });

    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    chartRef.current = chart;
    candleRef.current = candleSeries;
    volumeRef.current = volumeSeries;

    const handleResize = () => {
      if (containerRef.current) {
        const w = containerRef.current.clientWidth;
        const h = containerRef.current.clientHeight;
        // Only resize when the container actually has dimensions — when the page
        // is hidden (display:none) these are 0; applying 0 leaves a blank chart.
        if (w > 0 && h > 0) {
          chart.applyOptions({ width: w, height: h });
          chart.timeScale().fitContent();
        }
      }
    };
    window.addEventListener('resize', handleResize);
    // ResizeObserver fires when the container goes 0 -> real height, i.e. when
    // the user switches to this tab (display:none -> contents). window.resize
    // does NOT fire on tab switch, so without this the chart stays at height 0.
    const ro = new ResizeObserver(handleResize);
    ro.observe(containerRef.current);

    return () => {
      window.removeEventListener('resize', handleResize);
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  // update data whenever ohlcv changes
  useEffect(() => {
    if (!candleRef.current || !volumeRef.current || ohlcv.length === 0) return;

    candleRef.current.setData(
      ohlcv.map((d) => ({
        time: d.date as unknown as import('lightweight-charts').Time,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
      })),
    );

    volumeRef.current.setData(
      ohlcv.map((d) => ({
        time: d.date as unknown as import('lightweight-charts').Time,
        value: d.volume,
        color: d.close >= d.open ? 'rgba(38,166,154,0.35)' : 'rgba(239,83,80,0.35)',
      })),
    );

    chartRef.current?.timeScale().fitContent();
  }, [ohlcv]);
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface ChartPageProps {
  initialTicker?: string | null;
  onTickerConsumed?: () => void;
  /** Jump to the DAG editor and run full analysis on the current ticker. */
  onAnalyze?: (ticker: string) => void;
}

export function ChartPage({ initialTicker, onTickerConsumed, onAnalyze }: ChartPageProps = {}) {
  const [ticker, setTicker] = useState('AAPL');

  // Switch ticker when navigated from Discovery
  useEffect(() => {
    if (initialTicker) {
      setTicker(initialTicker);
      onTickerConsumed?.();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTicker]);

  const [period, setPeriod] = useState<Period>('3M');
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [ohlcv, setOhlcv] = useState<OHLCVBar[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [newsOpen, setNewsOpen] = useState(true);
  const [loadingChart, setLoadingChart] = useState(false);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [loadingNews, setLoadingNews] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Folder-based watchlist state
  const [folders, setFolders] = useState<WatchlistFolder[]>(loadFolders);
  const [activeFolderId, setActiveFolderId] = useState<string>(() => loadFolders()[0]?.id ?? 'default');
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [watchlistOpen, setWatchlistOpen] = useState(true);
  const [watchlistQuotes, setWatchlistQuotes] = useState<Record<string, WatchlistQuote>>({});

  // Folder editing state
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Sidebar watchlist search state
  const [sidebarQuery, setSidebarQuery] = useState('');
  const [sidebarResults, setSidebarResults] = useState<SearchResult[]>([]);
  const [sidebarDropdown, setSidebarDropdown] = useState(false);
  const [sidebarAdded, setSidebarAdded] = useState<string | null>(null);
  const sidebarSearchRef = useRef<HTMLDivElement>(null);
  const sidebarDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { t } = useI18n();
  const { theme } = useTheme();

  useChart(chartContainerRef, ohlcv, theme);

  // ── Derived ───────────────────────────────────────────────────────────────────

  const activeFolder = folders.find((f) => f.id === activeFolderId) ?? folders[0];
  const isInWatchlist = activeFolder ? activeFolder.tickers.includes(ticker) : false;

  // ── Fetch helpers ────────────────────────────────────────────────────────────

  const fetchQuote = useCallback(async (sym: string) => {
    setLoadingQuote(true);
    try {
      const res = await api.get<Quote>(`/stocks/${sym}/quote`);
      setQuote(res.data);
    } catch {
      setQuote(null);
    } finally {
      setLoadingQuote(false);
    }
  }, []);

  const fetchOhlcv = useCallback(async (sym: string, p: Period) => {
    setLoadingChart(true);
    setError(null);
    try {
      const res = await api.get<{ ticker: string; data: OHLCVBar[] }>(
        `/stocks/${sym}/ohlcv`,
        { params: { period: p.toLowerCase() } },
      );
      setOhlcv(res.data.data);
    } catch {
      setError('Failed to load chart data.');
      setOhlcv([]);
    } finally {
      setLoadingChart(false);
    }
  }, []);

  const fetchNews = useCallback(async (sym: string) => {
    setLoadingNews(true);
    try {
      const res = await api.get<{ ticker: string; news: NewsItem[] }>(`/stocks/${sym}/news`);
      setNews(res.data.news);
    } catch {
      setNews([]);
    } finally {
      setLoadingNews(false);
    }
  }, []);

  const fetchWatchlistQuotes = useCallback(async (syms: string[]) => {
    if (syms.length === 0) return;
    const results = await Promise.allSettled(
      syms.map((sym) =>
        api.get<Quote>(`/stocks/${sym}/quote`).then((r) => ({ sym, data: r.data })),
      ),
    );
    const next: Record<string, WatchlistQuote> = {};
    for (const r of results) {
      if (r.status === 'fulfilled') {
        next[r.value.sym] = {
          price: r.value.data.price,
          change_pct: r.value.data.change_pct,
        };
      }
    }
    setWatchlistQuotes((prev) => ({ ...prev, ...next }));
  }, []);

  // ── Effects ──────────────────────────────────────────────────────────────────

  // Load all data when ticker or period changes
  useEffect(() => {
    fetchQuote(ticker);
    fetchOhlcv(ticker, period);
    fetchNews(ticker);
  }, [ticker, period, fetchQuote, fetchOhlcv, fetchNews]);

  // Fetch watchlist quotes on mount and when folders change
  useEffect(() => {
    fetchWatchlistQuotes(allTickers(folders));
  }, [folders, fetchWatchlistQuotes]);

  // Refresh watchlist quotes every 30s
  useEffect(() => {
    if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    refreshTimerRef.current = setInterval(() => {
      fetchWatchlistQuotes(allTickers(folders));
    }, REFRESH_INTERVAL);
    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  }, [folders, fetchWatchlistQuotes]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 1) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await api.get<{ results: SearchResult[] }>('/stocks/search', {
          params: { q: query },
        });
        setSearchResults(res.data.results);
        setShowDropdown(true);
      } catch {
        setSearchResults([]);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
      if (sidebarSearchRef.current && !sidebarSearchRef.current.contains(e.target as Node)) {
        setSidebarDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Sidebar search: debounced query → API
  useEffect(() => {
    if (sidebarDebounceRef.current) clearTimeout(sidebarDebounceRef.current);
    const q = sidebarQuery.trim();
    if (q.length < 1) { setSidebarResults([]); setSidebarDropdown(false); return; }
    sidebarDebounceRef.current = setTimeout(async () => {
      try {
        const res = await api.get<{ results: SearchResult[] }>('/stocks/search', { params: { q } });
        setSidebarResults(res.data.results);
        setSidebarDropdown(res.data.results.length > 0);
      } catch { setSidebarResults([]); }
    }, 300);
    return () => { if (sidebarDebounceRef.current) clearTimeout(sidebarDebounceRef.current); };
  }, [sidebarQuery]);

  // Focus rename input when it appears
  useEffect(() => {
    if (renamingFolderId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingFolderId]);

  // ── Folder handlers ───────────────────────────────────────────────────────────

  const updateFolders = (next: WatchlistFolder[]) => {
    setFolders(next);
    saveFolders(next);
  };

  // Add a ticker to the currently active folder (from sidebar search)
  const addTickerToActiveFolder = useCallback((sym: string) => {
    const normalized = sym.trim().toUpperCase();
    if (!normalized) return;
    setFolders((prev) => {
      const targetId = activeFolderId ?? prev[0]?.id;
      const next = prev.map((f) => {
        if (f.id !== targetId) return f;
        if (f.tickers.includes(normalized)) return f;
        return { ...f, tickers: [...f.tickers, normalized] };
      });
      saveFolders(next);
      fetchWatchlistQuotes([normalized]);
      return next;
    });
    setSidebarAdded(normalized);
    setSidebarQuery('');
    setSidebarResults([]);
    setSidebarDropdown(false);
    setTimeout(() => setSidebarAdded(null), 2000);
  }, [activeFolderId, fetchWatchlistQuotes]);

  const addFolder = () => {
    const name = window.prompt(t('chart.newFolder'), 'New List');
    if (!name || !name.trim()) return;
    const newFolder: WatchlistFolder = { id: genId(), name: name.trim(), tickers: [] };
    const next = [...folders, newFolder];
    updateFolders(next);
    setActiveFolderId(newFolder.id);
  };

  const startRename = (folder: WatchlistFolder) => {
    setRenamingFolderId(folder.id);
    setRenameValue(folder.name);
  };

  const commitRename = (folderId: string) => {
    const trimmed = renameValue.trim();
    if (trimmed) {
      updateFolders(folders.map((f) => f.id === folderId ? { ...f, name: trimmed } : f));
    }
    setRenamingFolderId(null);
  };

  const deleteFolder = (folderId: string) => {
    if (folders.length <= 1) return; // keep at least one
    const next = folders.filter((f) => f.id !== folderId);
    updateFolders(next);
    if (activeFolderId === folderId) {
      setActiveFolderId(next[0].id);
    }
  };

  const toggleFolderCollapse = (folderId: string) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  // ── Watchlist handlers ────────────────────────────────────────────────────────

  const toggleWatchlist = () => {
    const folderId = activeFolderId ?? folders[0]?.id;
    if (!folderId) return;
    setFolders((prev) => {
      const next = prev.map((f) => {
        if (f.id !== folderId) return f;
        if (f.tickers.includes(ticker)) {
          return { ...f, tickers: f.tickers.filter((s) => s !== ticker) };
        } else {
          fetchWatchlistQuotes([ticker]);
          return { ...f, tickers: [...f.tickers, ticker] };
        }
      });
      saveFolders(next);
      return next;
    });
    // clean quote cache if removing
    setWatchlistQuotes((q) => {
      const stillPresent = folders.some((f) =>
        f.id !== (activeFolderId ?? folders[0]?.id) && f.tickers.includes(ticker)
      );
      if (isInWatchlist && !stillPresent) {
        const copy = { ...q };
        delete copy[ticker];
        return copy;
      }
      return q;
    });
  };

  const removeFromFolder = (folderId: string, sym: string) => {
    setFolders((prev) => {
      const next = prev.map((f) =>
        f.id === folderId ? { ...f, tickers: f.tickers.filter((s) => s !== sym) } : f,
      );
      saveFolders(next);
      return next;
    });
    // clean quote cache only if not present in any other folder
    const stillPresent = folders.some((f) => f.id !== folderId && f.tickers.includes(sym));
    if (!stillPresent) {
      setWatchlistQuotes((q) => {
        const copy = { ...q };
        delete copy[sym];
        return copy;
      });
    }
  };

  // ── Render helpers ────────────────────────────────────────────────────────────

  const selectSymbol = (sym: string) => {
    setTicker(sym);
    setQuery('');
    setShowDropdown(false);
  };

  const isPositive = quote ? quote.change >= 0 : null;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className={styles.page}>
      {/* ── Top bar ── */}
      <div className={styles.topBar}>
        {/* Watchlist toggle */}
        <button
          className={`${styles.watchlistToggleBtn} ${watchlistOpen ? styles.watchlistToggleBtnActive : ''}`}
          onClick={() => setWatchlistOpen((v) => !v)}
          title={watchlistOpen ? 'Hide watchlist' : t('chart.watchlist')}
        >
          {watchlistOpen
            ? <PanelLeftClose size={14} />
            : <PanelLeftOpen size={14} />
          }
        </button>

        {/* Search */}
        <div className={styles.searchWrap} ref={searchRef}>
          <Search size={14} className={styles.searchIcon} />
          <input
            className={styles.searchInput}
            type="text"
            placeholder={t('chart.searchPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => searchResults.length > 0 && setShowDropdown(true)}
          />
          {query && (
            <button className={styles.searchClear} aria-label={t('common.clear')} onClick={() => { setQuery(''); setShowDropdown(false); }}>
              <X size={12} />
            </button>
          )}
          {showDropdown && searchResults.length > 0 && (
            <div className={styles.dropdown}>
              {searchResults.map((r) => (
                <button
                  key={r.symbol}
                  className={styles.dropdownItem}
                  onClick={() => selectSymbol(r.symbol)}
                >
                  <span className={styles.dropdownSymbol}>{r.symbol}</span>
                  <span className={styles.dropdownDesc}>{r.description}</span>
                  <span className={styles.dropdownExchange}>{r.exchange}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Active ticker badge */}
        <div className={styles.tickerBadge}>
          <span className={styles.tickerSymbol}>{ticker}</span>
          {quote && <span className={styles.tickerName}>{quote.name}</span>}
        </div>

        {/* Star / watchlist button */}
        <button
          className={`${styles.starBtn} ${isInWatchlist ? styles.starBtnActive : ''}`}
          onClick={toggleWatchlist}
          title={isInWatchlist ? t('chart.removeFromWatchlist') : t('chart.addToWatchlist')}
          aria-label={isInWatchlist ? t('chart.removeFromWatchlist') : t('chart.addToWatchlist')}
        >
          <Star size={14} className={isInWatchlist ? styles.starFilled : styles.starOutline} />
        </button>

        {/* DAG analysis button — jump to editor and run full analysis on this ticker */}
        {onAnalyze && (
          <button
            className={styles.dagAnalyzeBtn}
            onClick={() => onAnalyze(ticker)}
            title={t('chart.runDag')}
            aria-label={t('chart.runDag')}
          >
            <Workflow size={14} />
            <span>{t('chart.runDag')}</span>
          </button>
        )}

        {/* Quote strip */}
        {quote && !loadingQuote && (
          <div className={styles.quoteStrip}>
            <span className={`${styles.quotePrice} ${isPositive ? styles.positive : styles.negative}`}>
              {formatPrice(quote.price)}
            </span>
            <span className={`${styles.quoteChange} ${isPositive ? styles.positive : styles.negative}`}>
              {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {isPositive ? '+' : ''}{formatPrice(quote.change)}
              <span className={styles.quotePct}>
                ({isPositive ? '+' : ''}{quote.change_pct.toFixed(2)}%)
              </span>
            </span>
            <span className={styles.quoteSep} />
            <span className={styles.quoteMeta}><span className={styles.quoteLabel}>{t('chart.open')}</span>{formatPrice(quote.open)}</span>
            <span className={styles.quoteMeta}><span className={styles.quoteLabel}>{t('chart.high')}</span>{formatPrice(quote.high)}</span>
            <span className={styles.quoteMeta}><span className={styles.quoteLabel}>{t('chart.low')}</span>{formatPrice(quote.low)}</span>
            <span className={styles.quoteMeta}><span className={styles.quoteLabel}>{t('chart.prevClose')}</span>{formatPrice(quote.prev_close)}</span>
          </div>
        )}
        {loadingQuote && <div className={styles.quoteLoading}><Loader size={14} className={styles.spinner} /></div>}

        <div className={styles.topBarSpacer} />

        {/* News toggle */}
        <button
          className={`${styles.newsToggle} ${newsOpen ? styles.newsToggleActive : ''}`}
          onClick={() => setNewsOpen((v) => !v)}
          title={newsOpen ? 'Hide news' : 'Show news'}
        >
          <ChevronRight size={14} className={`${styles.newsToggleIcon} ${newsOpen ? styles.newsToggleIconOpen : ''}`} />
          {t('chart.news')}
        </button>
      </div>

      {/* ── Period selector ── */}
      <div className={styles.toolbar}>
        <div className={styles.periodGroup}>
          {PERIODS.map((p) => (
            <button
              key={p}
              className={`${styles.periodBtn} ${period === p ? styles.periodBtnActive : ''}`}
              onClick={() => setPeriod(p)}
            >
              {p}
            </button>
          ))}
        </div>
        {loadingChart && (
          <span className={styles.chartLoading}>
            <Loader size={12} className={styles.spinner} />
            {t('chart.loading')}
          </span>
        )}
        {error && <span className={styles.chartError}>{t('chart.loadError')}</span>}
      </div>

      {/* ── Body ── */}
      <div className={styles.body}>
        {/* Watchlist sidebar */}
        {watchlistOpen && (
          <aside className={styles.watchlistSidebar}>
            {/* Sidebar header with add-folder button */}
            <div className={styles.watchlistHeader}>
              <span className={styles.watchlistHeaderTitle}>{t('chart.watchlist')}</span>
              <button
                className={styles.folderAddBtn}
                onClick={addFolder}
                title={t('chart.newFolder')}
                aria-label={t('chart.newFolder')}
              >
                <FolderPlus size={13} />
              </button>
            </div>

            {/* ── Sidebar search-to-add input ── */}
            <div className={styles.sidebarSearch} ref={sidebarSearchRef}>
              <div className={styles.sidebarSearchWrap}>
                <Search size={11} className={styles.sidebarSearchIcon} />
                <input
                  className={styles.sidebarSearchInput}
                  type="text"
                  placeholder={t('chart.sidebarSearchPlaceholder')}
                  value={sidebarQuery}
                  onChange={(e) => setSidebarQuery(e.target.value)}
                  onFocus={() => sidebarResults.length > 0 && setSidebarDropdown(true)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const raw = sidebarQuery.trim().toUpperCase();
                      if (raw) addTickerToActiveFolder(raw);
                    }
                    if (e.key === 'Escape') { setSidebarDropdown(false); setSidebarQuery(''); }
                  }}
                />
                {sidebarAdded && (
                  <span className={styles.sidebarAddedFlash}>{t('chart.sidebarAdded')}</span>
                )}
              </div>
              {sidebarDropdown && sidebarResults.length > 0 && (
                <div className={styles.sidebarDropdown}>
                  {sidebarResults.slice(0, 7).map((r) => (
                    <button
                      key={r.symbol}
                      className={styles.sidebarDropdownItem}
                      onClick={() => addTickerToActiveFolder(r.symbol)}
                    >
                      <span className={styles.sidebarDropdownSymbol}>{r.symbol}</span>
                      <span className={styles.sidebarDropdownDesc}>{r.description}</span>
                      <span className={styles.sidebarDropdownAdd}>{t('chart.sidebarAddBtn')}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Folder list */}
            <div className={styles.watchlistList}>
              {folders.map((folder) => {
                const isCollapsed = collapsedFolders.has(folder.id);
                const isActiveFolder = folder.id === activeFolderId;
                const isRenaming = renamingFolderId === folder.id;

                return (
                  <div key={folder.id} className={styles.folderSection}>
                    {/* Folder header row */}
                    <div
                      className={`${styles.folderHeader} ${isActiveFolder ? styles.folderHeaderActive : ''}`}
                      onClick={() => {
                        setActiveFolderId(folder.id);
                        if (isCollapsed) toggleFolderCollapse(folder.id);
                      }}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === 'Enter' && setActiveFolderId(folder.id)}
                      aria-expanded={!isCollapsed}
                    >
                      <button
                        className={`${styles.folderCollapseBtn} ${isCollapsed ? '' : styles.folderCollapseBtnOpen}`}
                        onClick={(e) => { e.stopPropagation(); toggleFolderCollapse(folder.id); }}
                        aria-label={isCollapsed ? 'Expand folder' : 'Collapse folder'}
                      >
                        <ChevronDown size={11} />
                      </button>

                      {isRenaming ? (
                        <input
                          ref={renameInputRef}
                          className={styles.folderRenameInput}
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onBlur={() => commitRename(folder.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitRename(folder.id);
                            if (e.key === 'Escape') setRenamingFolderId(null);
                          }}
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <span className={styles.folderName} onDoubleClick={(e) => { e.stopPropagation(); startRename(folder); }}>
                          {folder.name}
                        </span>
                      )}

                      <span className={styles.folderCount}>{folder.tickers.length}</span>

                      <div className={styles.folderActions}>
                        {!isRenaming && (
                          <button
                            className={styles.folderActionBtn}
                            onClick={(e) => { e.stopPropagation(); startRename(folder); }}
                            title={t('chart.renameFolder')}
                            aria-label={t('chart.renameFolder')}
                          >
                            {isRenaming ? <Check size={10} /> : <Pencil size={10} />}
                          </button>
                        )}
                        {isRenaming && (
                          <button
                            className={styles.folderActionBtn}
                            onClick={(e) => { e.stopPropagation(); commitRename(folder.id); }}
                            title={t('tip.confirmRename')}
                          >
                            <Check size={10} />
                          </button>
                        )}
                        {folders.length > 1 && (
                          <button
                            className={`${styles.folderActionBtn} ${styles.folderDeleteBtn}`}
                            onClick={(e) => { e.stopPropagation(); deleteFolder(folder.id); }}
                            title={t('chart.deleteFolder')}
                            aria-label={t('chart.deleteFolder')}
                          >
                            <Trash2 size={10} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Card grid — shown when not collapsed */}
                    {!isCollapsed && (
                      <div className={styles.folderCards}>
                        {folder.tickers.length === 0 && (
                          <div className={styles.watchlistEmpty}>{t('chart.watchlistEmpty')}</div>
                        )}
                        {folder.tickers.map((sym) => {
                          const wq = watchlistQuotes[sym];
                          const pos = wq ? wq.change_pct >= 0 : null;
                          const isActive = sym === ticker;
                          return (
                            <div
                              key={sym}
                              className={`${styles.tickerCard} ${isActive ? styles.tickerCardActive : ''}`}
                              onClick={() => selectSymbol(sym)}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(e) => e.key === 'Enter' && selectSymbol(sym)}
                              aria-label={`Switch to ${sym}`}
                            >
                              <button
                                className={styles.cardRemoveBtn}
                                onClick={(e) => { e.stopPropagation(); removeFromFolder(folder.id, sym); }}
                                title={t('chart.removeFromWatchlist')}
                                aria-label={`Remove ${sym}`}
                              >
                                <X size={9} />
                              </button>

                              <div className={styles.cardTop}>
                                <span className={styles.cardSymbol}>{sym}</span>
                                {wq && pos !== null && (
                                  <span className={`${styles.cardPct} ${pos ? styles.positive : styles.negative}`}>
                                    {pos ? '▲' : '▼'}{Math.abs(wq.change_pct).toFixed(2)}%
                                  </span>
                                )}
                              </div>

                              <div className={styles.cardBottom}>
                                <span className={styles.cardPrice}>
                                  {wq ? formatPrice(wq.price) : '—'}
                                </span>
                                {wq && pos !== null && (
                                  <Sparkline changePct={wq.change_pct} width={48} height={20} />
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </aside>
        )}

        {/* Chart area */}
        <div className={styles.chartArea}>
          <div ref={chartContainerRef} className={styles.chart} />
        </div>

        {/* News sidebar */}
        {newsOpen && (
          <aside className={styles.newsSidebar}>
            <div className={styles.newsHeader}>
              <span className={styles.newsHeaderTitle}>{t('chart.news')}</span>
              <span className={styles.newsHeaderTicker}>{ticker}</span>
            </div>
            <div className={styles.newsList}>
              {loadingNews && (
                <div className={styles.newsLoading}>
                  <Loader size={16} className={styles.spinner} />
                </div>
              )}
              {!loadingNews && news.length === 0 && (
                <div className={styles.newsEmpty}>{t('chart.noNews')}</div>
              )}
              {!loadingNews && news.map((item, i) => (
                <a
                  key={i}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.newsCard}
                >
                  <div className={styles.newsCardMeta}>
                    <span className={styles.newsSource}>{item.source}</span>
                    <span className={styles.newsTime}>{timeAgo(item.published_at)}</span>
                    <ExternalLink size={10} className={styles.newsExternal} />
                  </div>
                  <p className={styles.newsTitle}>{item.title}</p>
                  {item.summary && (
                    <p className={styles.newsSummary}>{item.summary}</p>
                  )}
                </a>
              ))}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
