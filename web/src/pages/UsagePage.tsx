import { useState, useEffect, useCallback, useMemo } from 'react';
import styles from './workflow.module.css';
import { fetchUsageSummary, resetUsage, type UsageSummary } from '../api/client';
import { useI18n } from '../i18n/context';

const PALETTE = [
  '#2962ff',
  '#26a69a',
  '#ff9800',
  '#ef5350',
  '#ab47bc',
  '#42a5f5',
  '#66bb6a',
  '#ec407a',
];

interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

function DonutChart({ slices, size = 160 }: { slices: DonutSlice[]; size?: number }) {
  const radius = size / 2;
  const inner = radius * 0.6;
  const total = slices.reduce((s, sl) => s + sl.value, 0) || 1;
  let angle = -Math.PI / 2;
  const arcs = slices.map((sl) => {
    const frac = sl.value / total;
    const start = angle;
    const end = angle + frac * Math.PI * 2;
    angle = end;
    const x1 = radius + radius * Math.cos(start);
    const y1 = radius + radius * Math.sin(start);
    const x2 = radius + radius * Math.cos(end);
    const y2 = radius + radius * Math.sin(end);
    const large = frac > 0.5 ? 1 : 0;
    return {
      sl,
      d: `M ${radius} ${radius} L ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2} Z`,
    };
  });
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {arcs.map((a, i) => (
        <path key={i} d={a.d} fill={a.sl.color} />
      ))}
      <circle cx={radius} cy={radius} r={inner} fill="var(--bg-secondary)" />
    </svg>
  );
}

function DailyTrend({ data }: { data: { date: string; cost: number }[] }) {
  const w = 640;
  const h = 140;
  const pad = 8;
  if (data.length < 2) return null;
  const max = Math.max(...data.map((d) => d.cost), 0.0001);
  const stepX = (w - pad * 2) / (data.length - 1);
  const points = data.map((d, i) => {
    const x = pad + i * stepX;
    const y = h - pad - (d.cost / max) * (h - pad * 2);
    return [x, y] as const;
  });
  const line = points.map(([x, y]) => `${x},${y}`).join(' ');
  const area = `${pad},${h - pad} ${line} ${pad + (data.length - 1) * stepX},${h - pad}`;
  return (
    <svg
      width="100%"
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      style={{ display: 'block' }}
    >
      <polygon points={area} fill="var(--accent)" opacity={0.12} />
      <polyline
        points={line}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {points.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={2.5} fill="var(--accent)" />
      ))}
    </svg>
  );
}

export function UsagePage() {
  const { t } = useI18n();
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const s = await fetchUsageSummary();
      setSummary(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const reset = useCallback(async () => {
    if (!window.confirm(t('usage.resetConfirm'))) return;
    setResetting(true);
    setError(null);
    try {
      await resetUsage();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setResetting(false);
    }
  }, [load, t]);

  const providerSlices: DonutSlice[] = useMemo(() => {
    if (!summary) return [];
    return summary.providers.map((p, i) => ({
      label: p.name,
      value: p.cost || p.requests,
      color: PALETTE[i % PALETTE.length],
    }));
  }, [summary]);

  const topModels = useMemo(() => {
    if (!summary) return [];
    return [...summary.models].sort((a, b) => b.cost - a.cost).slice(0, 8);
  }, [summary]);

  const maxModelCost = useMemo(
    () => Math.max(...topModels.map((m) => m.cost), 0.0001),
    [topModels]
  );

  const fmtCost = (n: number | null | undefined = 0) => `$${(n ?? 0).toFixed(4)}`;
  const fmtTokens = (raw: number | null | undefined = 0) => {
    const n = raw ?? 0;
    return n >= 1_000_000
      ? `${(n / 1_000_000).toFixed(2)}M`
      : n >= 1000
      ? `${(n / 1000).toFixed(1)}K`
      : String(n);
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>{t('usage.title')}</h1>
          <p className={styles.subtitle}>{t('usage.subtitle')}</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className={styles.ghost} onClick={load} disabled={loading}>
            {t('common.refresh')}
          </button>
          <button className={styles.ghost} onClick={reset} disabled={resetting}>
            {resetting ? (
              <span className={styles.loadingRow}>
                <span className={styles.spinner} /> {t('usage.reset')}
              </span>
            ) : (
              t('usage.reset')
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className={styles.errorBox}>
          <span>{error}</span>
          <button className={styles.smallBtn} onClick={load}>
            {t('common.retry')}
          </button>
        </div>
      )}

      {loading && !summary && (
        <div className={styles.loadingRow}>
          <span className={styles.spinner} /> {t('common.loading')}
        </div>
      )}

      {summary && (
        <>
          <div className={styles.statGrid}>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>{t('usage.totalCost')}</div>
              <div className={styles.statValue}>{fmtCost(summary.total.cost)}</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>{t('usage.totalRequests')}</div>
              <div className={styles.statValue}>{(summary.total.requests ?? 0).toLocaleString()}</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>{t('usage.inputTokens')}</div>
              <div className={styles.statValue}>{fmtTokens(summary.total.input_tokens)}</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>{t('usage.outputTokens')}</div>
              <div className={styles.statValue}>{fmtTokens(summary.total.output_tokens)}</div>
            </div>
          </div>

          {summary.providers.length > 0 && (
            <div className={styles.section}>
              <div className={styles.sectionHead}>
                <h2 className={styles.sectionTitle}>{t('usage.providers')}</h2>
              </div>
              <div className={styles.donutWrap}>
                <DonutChart slices={providerSlices} />
                <div className={styles.legend}>
                  {summary.providers.map((p, i) => (
                    <div className={styles.legendItem} key={p.name}>
                      <span
                        className={styles.legendDot}
                        style={{ background: PALETTE[i % PALETTE.length] }}
                      />
                      {p.name}
                      <span className={styles.legendVal}>
                        {fmtCost(p.cost)} · {p.requests} {t('usage.requests')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {topModels.length > 0 && (
            <div className={styles.section}>
              <div className={styles.sectionHead}>
                <h2 className={styles.sectionTitle}>{t('usage.models')}</h2>
              </div>
              {topModels.map((m) => (
                <div className={styles.barRow} key={m.name}>
                  <span className={styles.barLabel} title={m.name}>
                    {m.name}
                  </span>
                  <span className={styles.barTrack}>
                    <span
                      className={styles.barFill}
                      style={{ width: `${(m.cost / maxModelCost) * 100}%` }}
                    />
                  </span>
                  <span className={styles.barValue}>{fmtCost(m.cost)}</span>
                </div>
              ))}
            </div>
          )}

          {summary.daily.length > 1 && (
            <div className={styles.section}>
              <div className={styles.sectionHead}>
                <h2 className={styles.sectionTitle}>{t('usage.daily')}</h2>
              </div>
              <DailyTrend data={summary.daily.map((d) => ({ date: d.date, cost: d.cost }))} />
            </div>
          )}

          {summary.total.requests === 0 && <div className={styles.empty}>{t('usage.empty')}</div>}
        </>
      )}
    </div>
  );
}
