import { useState } from 'react';
import { BacktestChart, type BacktestResultData, type OHLCVData } from '../components/chart/BacktestChart';
import { runBacktestSync } from '../api/client';
import { useI18n } from '../i18n/context';
import styles from './BacktestPage.module.css';

const DEFAULT_CODE = `# Available: ctx.closes, ctx.opens, ctx.highs, ctx.lows, ctx.volumes
# Indicators: ctx.sma(20), ctx.ema(12), ctx.rsi(14), ctx.macd(), ctx.bollinger()
# Orders: ctx.buy(size_pct=1.0, reason="..."), ctx.sell(size_pct=1.0, reason="...")

sma_short = ctx.sma(10)
sma_long = ctx.sma(30)

if sma_short is not None and sma_long is not None:
    if sma_short > sma_long and ctx.position == 0:
        ctx.buy(1.0, "SMA crossover up")
    elif sma_short < sma_long and ctx.position > 0:
        ctx.sell(1.0, "SMA crossover down")
`;

export function BacktestPage() {
  const { t } = useI18n();
  const [ticker, setTicker] = useState('AAPL');
  const [startDate, setStartDate] = useState('2024-01-01');
  const [endDate, setEndDate] = useState('2024-12-31');
  const [code, setCode] = useState(DEFAULT_CODE);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BacktestResultData | null>(null);
  const [ohlcv, setOhlcv] = useState<OHLCVData[]>([]);
  const [error, setError] = useState('');

  const handleRun = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await runBacktestSync({
        ticker,
        start_date: startDate,
        end_date: endDate,
        algorithm_code: code,
      });

      if (data.result) {
        setResult(data.result);
      }
      if (data.ohlcv) {
        setOhlcv(data.ohlcv);
      }
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'response' in e) {
        const axiosErr = e as { response?: { data?: { detail?: string } } };
        setError(axiosErr.response?.data?.detail || 'Backtest failed');
      } else {
        setError(e instanceof Error ? e.message : 'Backtest failed');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.sidebar}>
        <h2 className={styles.title}>{t('backtest.title')}</h2>

        <div className={styles.field}>
          <label>{t('backtest.ticker')}</label>
          <input value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} />
        </div>

        <div className={styles.row}>
          <div className={styles.field}>
            <label>{t('backtest.start')}</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className={styles.field}>
            <label>{t('backtest.end')}</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>

        <div className={styles.field}>
          <label>{t('backtest.algorithm')}</label>
          <textarea
            className={styles.codeEditor}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            spellCheck={false}
          />
        </div>

        <button
          className={styles.runBtn}
          onClick={handleRun}
          disabled={loading}
        >
          {loading ? t('backtest.running') : t('backtest.run')}
        </button>

        {error && <div className={styles.error}>{error}</div>}
      </div>

      <div className={styles.main}>
        {ohlcv.length > 0 ? (
          <BacktestChart ohlcv={ohlcv} result={result} />
        ) : (
          <div className={styles.placeholder}>
            {t('backtest.placeholder')}
          </div>
        )}
      </div>
    </div>
  );
}
