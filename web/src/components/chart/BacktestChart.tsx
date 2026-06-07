import { useEffect, useRef } from 'react';
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  ColorType,
} from 'lightweight-charts';
import { useI18n } from '../../i18n/context';
import styles from './BacktestChart.module.css';

export interface OHLCVData {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Signal {
  date: string;
  action: 'BUY' | 'SELL';
  price: number;
  size_pct: number;
  reason: string;
}

export interface BacktestResultData {
  signals: Signal[];
  total_return_pct: number;
  win_rate: number;
  sharpe_ratio: number;
  sortino_ratio?: number;
  cagr_pct?: number;
  max_drawdown_pct: number;
  equity_curve: Array<{ date: string; equity: number }>;
  final_equity: number;
}

interface BacktestChartProps {
  ohlcv: OHLCVData[];
  result: BacktestResultData | null;
  onMarkerClick?: (signal: Signal) => void;
}

export function BacktestChart({ ohlcv, result, onMarkerClick }: BacktestChartProps) {
  const { t } = useI18n();
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#131722' },
        textColor: '#787b86',
      },
      grid: {
        vertLines: { color: '#1e222d' },
        horzLines: { color: '#1e222d' },
      },
      crosshair: {
        vertLine: { color: '#363a45' },
        horzLine: { color: '#363a45' },
      },
      rightPriceScale: {
        borderColor: '#363a45',
      },
      timeScale: {
        borderColor: '#363a45',
        timeVisible: false,
      },
      width: chartContainerRef.current.clientWidth,
      height: 400,
    });

    chartRef.current = chart;

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderDownColor: '#ef5350',
      borderUpColor: '#26a69a',
      wickDownColor: '#ef5350',
      wickUpColor: '#26a69a',
    });
    candleSeriesRef.current = candleSeries;

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });

    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    if (ohlcv.length > 0) {
      const candleData = ohlcv.map((d) => ({
        time: d.time,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
      }));
      candleSeries.setData(candleData);

      const volumeData = ohlcv.map((d) => ({
        time: d.time,
        value: d.volume,
        color: d.close >= d.open ? 'rgba(38,166,154,0.3)' : 'rgba(239,83,80,0.3)',
      }));
      volumeSeries.setData(volumeData);

      chart.timeScale().fitContent();
    }

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [ohlcv]);

  // Add B/S markers when result changes
  useEffect(() => {
    if (!candleSeriesRef.current || !result) return;

    const markers = result.signals.map((sig) => ({
      time: sig.date,
      position: sig.action === 'BUY' ? 'belowBar' as const : 'aboveBar' as const,
      color: sig.action === 'BUY' ? '#26a69a' : '#ef5350',
      shape: sig.action === 'BUY' ? 'arrowUp' as const : 'arrowDown' as const,
      text: sig.action,
    }));

    const seriesMarkers = createSeriesMarkers(candleSeriesRef.current, markers);
    return () => { seriesMarkers.detach(); };
  }, [result]);

  return (
    <div className={styles.container}>
      <div ref={chartContainerRef} className={styles.chart} />
      {result && (
        <div className={styles.stats}>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Return</span>
            <span className={`${styles.statValue} ${result.total_return_pct >= 0 ? styles.positive : styles.negative}`}>
              {result.total_return_pct >= 0 ? '+' : ''}{result.total_return_pct.toFixed(2)}%
            </span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>{t('backtest.winRate')}</span>
            <span className={styles.statValue}>{(result.win_rate * 100).toFixed(1)}%</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Sharpe</span>
            <span className={styles.statValue}>{result.sharpe_ratio.toFixed(2)}</span>
          </div>
          {result.sortino_ratio != null && (
            <div className={styles.stat}>
              <span className={styles.statLabel}>Sortino</span>
              <span className={styles.statValue}>{result.sortino_ratio.toFixed(2)}</span>
            </div>
          )}
          {result.cagr_pct != null && (
            <div className={styles.stat}>
              <span className={styles.statLabel}>CAGR</span>
              <span className={`${styles.statValue} ${result.cagr_pct >= 0 ? styles.positive : styles.negative}`}>
                {result.cagr_pct >= 0 ? '+' : ''}{result.cagr_pct.toFixed(2)}%
              </span>
            </div>
          )}
          <div className={styles.stat}>
            <span className={styles.statLabel}>Max DD</span>
            <span className={`${styles.statValue} ${styles.negative}`}>
              -{result.max_drawdown_pct.toFixed(2)}%
            </span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Signals</span>
            <span className={styles.statValue}>{result.signals.length}</span>
          </div>
        </div>
      )}
      {result && result.signals.length > 0 && (
        <div className={styles.signalList}>
          {result.signals.map((sig, i) => (
            <button
              key={i}
              className={styles.signalItem}
              onClick={() => onMarkerClick?.(sig)}
            >
              <span className={sig.action === 'BUY' ? styles.buyBadge : styles.sellBadge}>
                {sig.action}
              </span>
              <span className={styles.signalDate}>{sig.date}</span>
              <span className={styles.signalPrice}>${sig.price.toFixed(2)}</span>
              <span className={styles.signalReason}>{sig.reason}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
