import { useEffect, useRef, useState } from 'react';
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  ColorType,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
} from 'lightweight-charts';
import { api } from '../../api/client';
import { useTheme } from '../../theme/context';
import type { OHLCVRecord } from '../../api/client';
import styles from './ResultChart.module.css';

interface FinalDecision {
  action?: string;
  confidence?: number;
  entry_price?: number;
  target_price?: number;
  stop_loss?: number;
  time_horizon?: string;
  reasoning?: string;
}

interface ResultChartProps {
  ticker: string;
  finalDecision?: FinalDecision | null;
}

function computeSMA(closes: number[], period: number): (number | null)[] {
  return closes.map((_, i) => {
    if (i < period - 1) return null;
    const slice = closes.slice(i - period + 1, i + 1);
    return slice.reduce((a, b) => a + b, 0) / period;
  });
}

export function ResultChart({ ticker, finalDecision }: ResultChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const { theme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

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
        fontSize: 10,
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
        scaleMargins: { top: 0.05, bottom: 0.22 },
      },
      timeScale: {
        borderColor,
        timeVisible: true,
        secondsVisible: false,
        barSpacing: 4,
      },
      width: containerRef.current.clientWidth,
      height: 220,
    });

    chartRef.current = chart;

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderUpColor: '#26a69a',
      borderDownColor: '#ef5350',
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });
    candleRef.current = candleSeries;

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });
    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    });

    // SMA 10 — blue
    const sma10Series = chart.addSeries(LineSeries, {
      color: '#2962ff',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });

    // SMA 30 — orange
    const sma30Series = chart.addSeries(LineSeries, {
      color: '#ff9800',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });

    const handleResize = () => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    // Fetch OHLCV data
    setLoading(true);
    setError(false);

    api
      .get<{ ticker: string; data: OHLCVRecord[] }>(`/stocks/${ticker}/ohlcv`, {
        params: { period: '3m' },
      })
      .then((res) => {
        const data = res.data.data;
        if (!data || data.length === 0) {
          setError(true);
          return;
        }

        const candleData = data.map((d) => ({
          time: d.date as unknown as import('lightweight-charts').Time,
          open: d.open,
          high: d.high,
          low: d.low,
          close: d.close,
        }));
        candleSeries.setData(candleData);

        const volumeData = data.map((d) => ({
          time: d.date as unknown as import('lightweight-charts').Time,
          value: d.volume,
          color: d.close >= d.open ? 'rgba(38,166,154,0.28)' : 'rgba(239,83,80,0.28)',
        }));
        volumeSeries.setData(volumeData);

        // Compute SMAs
        const closes = data.map((d) => d.close);
        const sma10Values = computeSMA(closes, 10);
        const sma30Values = computeSMA(closes, 30);

        sma10Series.setData(
          data
            .map((d, i) => ({ time: d.date as unknown as import('lightweight-charts').Time, value: sma10Values[i] }))
            .filter((p) => p.value !== null) as { time: import('lightweight-charts').Time; value: number }[],
        );

        sma30Series.setData(
          data
            .map((d, i) => ({ time: d.date as unknown as import('lightweight-charts').Time, value: sma30Values[i] }))
            .filter((p) => p.value !== null) as { time: import('lightweight-charts').Time; value: number }[],
        );

        // Buy/sell marker on last bar
        if (finalDecision?.action === 'BUY' || finalDecision?.action === 'SELL') {
          const lastBar = data[data.length - 1];
          const isBuy = finalDecision.action === 'BUY';
          createSeriesMarkers(candleSeries, [
            {
              time: lastBar.date as unknown as import('lightweight-charts').Time,
              position: isBuy ? 'belowBar' : 'aboveBar',
              color: isBuy ? '#26a69a' : '#ef5350',
              shape: isBuy ? 'arrowUp' : 'arrowDown',
              text: finalDecision.action,
              size: 2,
            },
          ]);
        }

        // Entry price line
        if (finalDecision?.entry_price != null) {
          candleSeries.createPriceLine({
            price: finalDecision.entry_price,
            color: '#00a870',
            lineWidth: 2,
            lineStyle: 0, // solid
            axisLabelVisible: true,
            title: 'Entry',
          });
        }

        // Target price line
        if (finalDecision?.target_price != null) {
          candleSeries.createPriceLine({
            price: finalDecision.target_price,
            color: '#26a69a',
            lineWidth: 1,
            lineStyle: 2, // dashed
            axisLabelVisible: true,
            title: 'Target',
          });
        }

        // Stop loss line
        if (finalDecision?.stop_loss != null) {
          candleSeries.createPriceLine({
            price: finalDecision.stop_loss,
            color: '#ef5350',
            lineWidth: 1,
            lineStyle: 2, // dashed
            axisLabelVisible: true,
            title: 'Stop',
          });
        }

        chart.timeScale().fitContent();
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
    };
    // Re-create chart when ticker or theme changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker, theme]);

  return (
    <div className={styles.wrap}>
      {/* Legend row */}
      <div className={styles.legend}>
        <span className={styles.legendItem}>
          <span className={styles.legendDot} style={{ background: '#2962ff' }} />
          SMA10
        </span>
        <span className={styles.legendItem}>
          <span className={styles.legendDot} style={{ background: '#ff9800' }} />
          SMA30
        </span>
        {finalDecision?.entry_price != null && (
          <span className={styles.legendItem}>
            <span className={styles.legendDash} style={{ borderColor: '#00a870' }} />
            Entry ${finalDecision.entry_price}
          </span>
        )}
        {finalDecision?.target_price != null && (
          <span className={styles.legendItem}>
            <span className={styles.legendDash} style={{ borderColor: '#26a69a' }} />
            {/* t('result.target') */}
            Target
          </span>
        )}
        {finalDecision?.stop_loss != null && (
          <span className={styles.legendItem}>
            <span className={styles.legendDash} style={{ borderColor: '#ef5350' }} />
            {/* t('result.stop') */}
            Stop
          </span>
        )}
      </div>
      <div className={styles.chartContainer} ref={containerRef} />
      {loading && (
        <div className={styles.overlay}>
          <span className={styles.loadingDot} />
          <span className={styles.loadingDot} />
          <span className={styles.loadingDot} />
        </div>
      )}
      {error && !loading && (
        <div className={styles.overlay}>
          <span className={styles.errorText}>Chart unavailable</span>
        </div>
      )}
    </div>
  );
}
