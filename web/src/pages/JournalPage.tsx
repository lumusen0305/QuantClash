import { useState, useEffect, useCallback } from 'react';
import styles from './workflow.module.css';
import { fetchQuote } from '../api/client';
import { useI18n } from '../i18n/context';
import {
  loadJournal,
  saveJournal,
  loadFlagLog,
  type JournalEntry,
  type FlagEntry,
} from '../lib/workspace';
import { ReviewDrawer } from './WorkspacePage';

interface JournalPageProps { onNavigate?: (page: string) => void; }

type JournalView = 'journal' | 'triggers';

// Source badge colour
function sourceBadgeClass(source: FlagEntry['source']): string {
  if (source === 'scan') return styles.badgeAccent;
  if (source === 'queue') return styles.badgeHigh;
  return styles.badgeMedium; // triage
}

export function JournalPage({ onNavigate }: JournalPageProps = {}) {
  const { t } = useI18n();
  const [view, setView] = useState<JournalView>('journal');
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [flagLog, setFlagLog] = useState<FlagEntry[]>([]);
  const [quotes, setQuotes] = useState<Record<string, number>>({});
  const [loadingQuotes, setLoadingQuotes] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    setEntries(loadJournal());
    setFlagLog(loadFlagLog());
  }, []);

  useEffect(() => {
    const uniqueTickers = [...new Set(entries.map((e) => e.ticker))];
    if (!uniqueTickers.length) return;
    let cancelled = false;
    (async () => {
      setLoadingQuotes(true);
      setError(null);
      try {
        const results = await Promise.allSettled(
          uniqueTickers.map(async (tk) => {
            const q = await fetchQuote(tk);
            return [tk, q.price] as const;
          })
        );
        if (cancelled) return;
        const map: Record<string, number> = {};
        results.forEach((r) => {
          if (r.status === 'fulfilled') map[r.value[0]] = r.value[1];
        });
        setQuotes(map);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoadingQuotes(false);
      }
    })();
    return () => { cancelled = true; };
  }, [entries]);

  const persist = useCallback((next: JournalEntry[]) => {
    setEntries(next);
    saveJournal(next);
  }, []);

  const toggleAction = useCallback(
    (id: string) => {
      persist(entries.map((e) => (e.id === id ? { ...e, action_taken: !e.action_taken } : e)));
    },
    [entries, persist]
  );

  const remove = useCallback(
    (id: string) => {
      persist(entries.filter((e) => e.id !== id));
    },
    [entries, persist]
  );

  const expandedEntry = entries.find((e) => e.id === expanded) || null;

  // Group flag log by ticker
  const flagsByTicker = flagLog.reduce<Record<string, FlagEntry[]>>((acc, f) => {
    if (!acc[f.ticker]) acc[f.ticker] = [];
    acc[f.ticker].push(f);
    return acc;
  }, {});

  const flagTickers = Object.keys(flagsByTicker).sort((a, b) => {
    const latestA = flagsByTicker[a][0].ts;
    const latestB = flagsByTicker[b][0].ts;
    return latestB - latestA;
  });

  const formatDate = (ts: number) =>
    new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    + ' ' + new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  function sourceLabel(src: FlagEntry['source']): string {
    return t(`flag.source.${src}`);
  }

  return (
    <div className={styles.page}>
      {/* ── Header + sub-tab toggle ── */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>{t('journal.title')}</h1>
          <p className={styles.subtitle}>{t('journal.subtitle')}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {loadingQuotes && view === 'journal' && (
            <span className={styles.loadingRow}>
              <span className={styles.spinner} /> {t('common.loading')}
            </span>
          )}
          {/* Sub-tab pills */}
          <div className={styles.journalViewToggle}>
            <button
              className={`${styles.journalViewBtn} ${view === 'journal' ? styles.journalViewBtnActive : ''}`}
              onClick={() => setView('journal')}
            >
              {t('journal.title')}
            </button>
            <button
              className={`${styles.journalViewBtn} ${view === 'triggers' ? styles.journalViewBtnActive : ''}`}
              onClick={() => setView('triggers')}
            >
              {t('journal.watchTriggers')}
              {flagLog.length > 0 && (
                <span className={styles.journalViewCount}>{flagLog.length}</span>
              )}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className={styles.errorBox}>
          <span>{error}</span>
        </div>
      )}

      {/* ── Decision Journal view ── */}
      {view === 'journal' && (
        <>
          {!entries.length && (
            <div className={styles.section} style={{ marginTop: 24, textAlign: 'center' }}>
              <div style={{ fontSize: 36, marginBottom: 10, opacity: 0.6 }}>📓</div>
              <h3 className={styles.sectionTitle} style={{ justifyContent: 'center', marginBottom: 8 }}>
                {t('journal.emptyTitle')}
              </h3>
              <p className={styles.muted} style={{ maxWidth: 380, margin: '0 auto 16px', lineHeight: 1.6 }}>
                {t('journal.emptyBody')}
              </p>
              {onNavigate && (
                <button className={styles.button} onClick={() => onNavigate('workspace')}>
                  {t('journal.emptyGoToday')}
                </button>
              )}
            </div>
          )}

          {entries.map((e) => {
            const current = quotes[e.ticker];
            const ret =
              e.entry_price && current ? ((current - e.entry_price) / e.entry_price) * 100 : null;
            const days = Math.max(0, Math.floor((Date.now() - e.ts) / 86_400_000));
            return (
              <div className={styles.section} key={e.id}>
                <div className={styles.sectionHead}>
                  <h2 className={styles.sectionTitle}>
                    {e.ticker}
                    <span className={`${styles.badge} ${styles.badgeAccent}`}>{e.review_type}</span>
                  </h2>
                  <span className={styles.muted}>
                    {t('journal.daysElapsed').replace('{days}', String(days))}
                  </span>
                </div>

                <div className={styles.statGrid} style={{ marginBottom: 12 }}>
                  {e.entry_price != null && (
                    <div className={styles.statCard}>
                      <div className={styles.statLabel}>{t('journal.entryPrice')}</div>
                      <div className={styles.statValue}>${e.entry_price.toFixed(2)}</div>
                    </div>
                  )}
                  {current != null && (
                    <div className={styles.statCard}>
                      <div className={styles.statLabel}>{t('journal.currentPrice')}</div>
                      <div className={styles.statValue}>${current.toFixed(2)}</div>
                    </div>
                  )}
                  {ret != null && (
                    <div className={styles.statCard}>
                      <div className={styles.statLabel}>{t('journal.return')}</div>
                      <div className={`${styles.statValue} ${ret >= 0 ? styles.positive : styles.negative}`}>
                        {ret >= 0 ? '+' : ''}{ret.toFixed(2)}%
                      </div>
                    </div>
                  )}
                </div>

                <div className={styles.reviewSection}>
                  <div className={styles.reviewLabel}>{t('journal.conclusion')}</div>
                  <div className={styles.reviewBody}>{e.conclusion}</div>
                </div>

                {e.thesis && (
                  <div className={styles.reviewSection}>
                    <div className={styles.reviewLabel}>{t('journal.thesis')}</div>
                    <div className={styles.reviewBody}>{e.thesis}</div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button
                    className={styles.smallBtn}
                    onClick={() => setExpanded(expanded === e.id ? null : e.id)}
                  >
                    {expanded === e.id ? t('journal.hideReview') : t('journal.viewReview')}
                  </button>
                  <button className={styles.smallBtn} onClick={() => toggleAction(e.id)}>
                    {e.action_taken ? t('journal.actionTaken') : t('journal.notActed')}
                  </button>
                  <button className={styles.smallBtn} onClick={() => remove(e.id)}>
                    {t('journal.delete')}
                  </button>
                </div>
              </div>
            );
          })}

          {expandedEntry && (
            <ReviewDrawer
              state={{
                ticker: expandedEntry.ticker,
                reviewType: expandedEntry.review_type,
                result: expandedEntry.review,
                saved: true,
                loading: false,
              }}
              onClose={() => setExpanded(null)}
              onSave={() => setExpanded(null)}
              t={t}
            />
          )}
        </>
      )}

      {/* ── Watch Triggers view ── */}
      {view === 'triggers' && (
        <>
          {flagTickers.length === 0 && (
            <div className={styles.empty}>{t('journal.watchTriggersEmpty')}</div>
          )}

          {flagTickers.map((ticker) => {
            const flags = flagsByTicker[ticker];
            return (
              <div key={ticker} className={styles.section}>
                <div className={styles.sectionHead}>
                  <h2 className={styles.sectionTitle}>{ticker}</h2>
                  <span className={styles.muted}>{flags.length}×</span>
                </div>
                {flags.map((f) => (
                  <div key={f.id} className={styles.item}>
                    <div className={styles.itemMain}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                        <span className={`${styles.badge} ${sourceBadgeClass(f.source)}`}>
                          {sourceLabel(f.source)}
                        </span>
                        <span className={styles.itemTicker}>{f.label}</span>
                        {f.change_pct != null && (
                          <span style={{
                            fontSize: 11, fontWeight: 600,
                            color: f.change_pct >= 0 ? 'var(--green)' : 'var(--red)',
                            fontVariantNumeric: 'tabular-nums',
                          }}>
                            {f.change_pct >= 0 ? '+' : ''}{f.change_pct.toFixed(2)}%
                          </span>
                        )}
                        <span className={styles.muted} style={{ marginLeft: 'auto', fontSize: 11 }}>
                          {formatDate(f.ts)}
                        </span>
                      </div>
                      {f.reason && (
                        <div className={styles.itemReason}>{f.reason}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
