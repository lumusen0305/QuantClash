import { useState, useEffect, useCallback, useRef } from 'react';
import styles from './WorkspacePage.module.css';
import { QuickAddWatchlist } from '../components/QuickAddWatchlist';
import { EvalPanel } from '../components/EvalPanel';
import { MiniMarkdown } from '../components/MiniMarkdown';
import {
  fetchActionQueue,
  fetchTriage,
  fetchWeeklyReport,
  runReview as apiRunReview,
  scanWatchlist,
  fetchQuote,
  fetchTrumpPosts,
  fetchDigestStatus,
  sendDigest,
  previewDigest,
  subscribeWatch,
  getWatchSubscription,
  fetchWatchStatus,
  runWatchNow,
  sendDailyNow,
  streamDigest,
  fetchBuyRecommendations,
  buildPortfolio,
  type ActionQueueResult,
  type ActionQueueItem,
  type TriageResult,
  type TriageLevel,
  type ReviewResult,
  type WeeklyReportResult,
  type ScanResult,
  type ScanTrigger,
  type TrumpFeed,
  type BuyRecResult,
  type PortfolioBuildResult,
} from '../api/client';
import { addToWatchlist } from '../lib/workspace';
import { useI18n } from '../i18n/context';
import {
  loadProfiles,
  loadWatchlistTickers,
  loadPositions,
  buildWatchItems,
  buildPositionInputs,
  loadWorkspaceCache,
  saveWorkspaceCache,
  appendJournal,
  appendFlagEntries,
  appendDagHistory,
  uid,
  type FlagEntry,
} from '../lib/workspace';

type T = (key: string) => string;

const TRIAGE_LEVEL_BADGE: Record<TriageLevel, string> = {
  'Need Review':    styles.badgeHigh,
  'Thesis Changed': styles.badgeHigh,
  'Risk Increased': styles.badgeHigh,
  'Watch Closely':  styles.badgeMedium,
  'Light Scan Only':styles.badgeNeutral,
  'No Action':      styles.badgeLow,
};

const TRIAGE_LEVEL_KEY: Record<TriageLevel, string> = {
  'Need Review':    'triage.level.needReview',
  'Watch Closely':  'triage.level.watchClosely',
  'Light Scan Only':'triage.level.lightScan',
  'No Action':      'triage.level.noAction',
  'Thesis Changed': 'triage.level.thesisChanged',
  'Risk Increased': 'triage.level.riskIncreased',
};

interface ReviewDrawerState {
  ticker: string;
  reviewType: string;
  /** Undefined while loading; present once the response arrives */
  result?: ReviewResult;
  saved: boolean;
  loading: boolean;
  error?: string;
}

interface WorkspacePageProps {
  onNavigate?: (page: string) => void;
}

export function WorkspacePage({ onNavigate }: WorkspacePageProps = {}) {
  const { t, locale } = useI18n();
  const autoScanFiredRef = useRef(false); // session-level guard: fire at most once per mount

  const [scan, setScan] = useState<ScanResult | null>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanCached, setScanCached] = useState(false);
  const [analyzeAllLoading, setAnalyzeAllLoading] = useState(false);
  const [analyzeAllError, setAnalyzeAllError] = useState<string | null>(null);
  // SSE live progress for "analyze all"
  const [aaProgress, setAaProgress] = useState<{
    done: number; total: number; current: string | null;
    results: { ticker: string; action: string | null }[];
    phase: 'analyzing' | 'emailing' | 'done' | null;
    emailed?: boolean;
  } | null>(null);

  const [buyRec, setBuyRec] = useState<BuyRecResult | null>(null);
  const [buyRecLoading, setBuyRecLoading] = useState(false);
  const [buyRecError, setBuyRecError] = useState<string | null>(null);
  const [buyRecCached, setBuyRecCached] = useState(false);
  const [portfolio, setPortfolio] = useState<PortfolioBuildResult | null>(null);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [portfolioError, setPortfolioError] = useState<string | null>(null);
  const [portfolioStyle, setPortfolioStyle] = useState<'conservative' | 'balanced' | 'aggressive'>('balanced');

  const [queue, setQueue] = useState<ActionQueueResult | null>(null);
  const [queueLoading, setQueueLoading] = useState(false);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [queueCached, setQueueCached] = useState(false);

  const [triage, setTriage] = useState<TriageResult | null>(null);
  const [triageLoading, setTriageLoading] = useState(false);
  const [triageError, setTriageError] = useState<string | null>(null);

  const [weekly, setWeekly] = useState<WeeklyReportResult | null>(null);
  const [weeklyLoading, setWeeklyLoading] = useState(false);
  const [weeklyError, setWeeklyError] = useState<string | null>(null);

  const [drawer, setDrawer] = useState<ReviewDrawerState | null>(null);
  const [reviewLoadingFor, setReviewLoadingFor] = useState<Set<string>>(new Set());
  const [reviewError, setReviewError] = useState<string | null>(null);

  // ── Core actions ──────────────────────────────────────────────────────────

  const runScan = useCallback(async () => {
    const tickers = loadWatchlistTickers();
    if (!tickers.length) { setScanError(t('scan.noWatchlist')); return; }
    setScanLoading(true); setScanError(null); setScanCached(false);
    try {
      const res = await scanWatchlist(tickers);
      setScan(res);
      saveWorkspaceCache({ ...loadWorkspaceCache(), scan: res, scanTs: Date.now() });
      // Persist per-ticker flag entries so history is browsable later
      appendFlagEntries(
        res.triggers.map((tr): FlagEntry => ({
          id: uid(),
          ts: Date.now(),
          ticker: tr.ticker,
          source: 'scan',
          label: tr.priority,
          reason: tr.events.map((e) => e.detail).join(' · '),
          change_pct: tr.chg_5d,
        }))
      );
    } catch (e) { setScanError(e instanceof Error ? e.message : String(e)); }
    finally { setScanLoading(false); }
  }, [t]);

  const runAnalyzeAll = useCallback(async () => {
    if (!scan || scan.triggers.length === 0) return;
    const tickers = scan.triggers.map((tr) => tr.ticker).slice(0, 6);
    const email = localStorage.getItem('qc-digest-email') || undefined;
    setAnalyzeAllLoading(true);
    setAnalyzeAllError(null);
    setAaProgress({ done: 0, total: tickers.length, current: null, results: [], phase: 'analyzing' });
    try {
      // Stream SSE so the user sees live per-ticker progress, results as they
      // finish, then email + history at the end.
      await streamDigest(
        tickers,
        { email, language: locale },
        (ev) => {
          if (ev.type === 'progress') {
            setAaProgress((p) => p && { ...p, current: ev.ticker ?? null, phase: 'analyzing' });
          } else if (ev.type === 'result') {
            // Persist this ticker to DAG history immediately
            if (ev.result && !(ev.result as Record<string, unknown>)._error) {
              appendDagHistory([{ id: uid(), ticker: ev.ticker!, timestamp: Date.now(), result: ev.result }]);
            }
            setAaProgress((p) => p && {
              ...p,
              done: (ev.index ?? p.done) + 1,
              current: null,
              results: [...p.results, { ticker: ev.ticker!, action: ev.action ?? null }],
            });
          } else if (ev.type === 'emailing') {
            setAaProgress((p) => p && { ...p, phase: 'emailing' });
          } else if (ev.type === 'emailed') {
            setAaProgress((p) => p && { ...p, emailed: !!ev.ok });
            if (email && !ev.ok && ev.error) {
              setAnalyzeAllError(`${t('analyzeAll.emailFailed')}: ${ev.error}`);
            }
          } else if (ev.type === 'done') {
            setAaProgress((p) => p && { ...p, phase: 'done', current: null });
          } else if (ev.type === 'error') {
            setAnalyzeAllError(ev.error ?? 'stream error');
          }
        },
      );
    } catch (e) {
      setAnalyzeAllError(e instanceof Error ? e.message : String(e));
    } finally {
      setAnalyzeAllLoading(false);
    }
  }, [scan, locale, t]);

  const runQueue = useCallback(async () => {
    const tickers = loadWatchlistTickers();
    const positions = loadPositions();
    if (!tickers.length && !positions.length) { setQueueError(t('queue.noWatchlist')); return; }
    setQueueLoading(true); setQueueError(null); setQueueCached(false);
    try {
      const profiles = loadProfiles();
      const res = await fetchActionQueue({
        watchlist: buildWatchItems(tickers, profiles),
        positions: buildPositionInputs(positions),
        language: locale,
      });
      setQueue(res);
      saveWorkspaceCache({ ...loadWorkspaceCache(), queue: res, queueTs: Date.now() });
      // Persist flag entries from action queue
      const queueFlags: FlagEntry[] = [
        ...res.high.map((item): FlagEntry => ({
          id: uid(), ts: Date.now(), ticker: item.ticker, source: 'queue',
          label: 'high', reason: item.reason,
        })),
        ...res.medium.map((item): FlagEntry => ({
          id: uid(), ts: Date.now(), ticker: item.ticker, source: 'queue',
          label: 'medium', reason: item.reason,
        })),
      ];
      appendFlagEntries(queueFlags);
    } catch (e) { setQueueError(e instanceof Error ? e.message : String(e)); }
    finally { setQueueLoading(false); }
  }, [locale, t]);

  const runTriage = useCallback(async () => {
    const tickers = loadWatchlistTickers();
    if (!tickers.length) { setTriageError(t('queue.noWatchlist')); return; }
    setTriageLoading(true); setTriageError(null);
    try {
      const profiles = loadProfiles();
      const res = await fetchTriage({ watchlist: buildWatchItems(tickers, profiles), language: locale });
      setTriage(res);
      saveWorkspaceCache({ ...loadWorkspaceCache(), triage: res, triageTs: Date.now() });
      // Persist triage flags
      appendFlagEntries(
        res.items
          .filter((it) => it.level !== 'No Action')
          .map((it): FlagEntry => ({
            id: uid(), ts: Date.now(), ticker: it.ticker, source: 'triage',
            label: it.level, reason: it.reason,
          }))
      );
    } catch (e) { setTriageError(e instanceof Error ? e.message : String(e)); }
    finally { setTriageLoading(false); }
  }, [locale, t]);

  const runWeekly = useCallback(async () => {
    const tickers = loadWatchlistTickers();
    if (!tickers.length) { setWeeklyError(t('queue.noWatchlist')); return; }
    setWeeklyLoading(true); setWeeklyError(null);
    try {
      const profiles = loadProfiles();
      const res = await fetchWeeklyReport({ watchlist: buildWatchItems(tickers, profiles), language: locale });
      setWeekly(res);
    } catch (e) { setWeeklyError(e instanceof Error ? e.message : String(e)); }
    finally { setWeeklyLoading(false); }
  }, [locale, t]);

  const runReviewFor = useCallback(async (ticker: string, review_type: string) => {
    // Guard: no-op if this ticker is already loading
    if (reviewLoadingFor.has(ticker)) return;
    setReviewLoadingFor((prev) => new Set(prev).add(ticker));
    setReviewError(null);

    // Open the drawer immediately in loading state — don't make the user wait
    // for 30-50s before seeing any feedback.
    setDrawer({ ticker, reviewType: review_type, loading: true, saved: false });

    try {
      const profiles = loadProfiles();
      const res = await apiRunReview({
        ticker,
        review_type,
        thesis: profiles[ticker]?.thesis,
        profile: profiles[ticker],
        language: locale,
      });
      setDrawer({ ticker, reviewType: review_type, result: res, loading: false, saved: false });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setDrawer((prev) =>
        prev ? { ...prev, loading: false, error: msg } : prev
      );
      setReviewError(`${ticker}: ${msg}`);
    } finally {
      setReviewLoadingFor((prev) => { const n = new Set(prev); n.delete(ticker); return n; });
    }
  }, [locale]);

  const saveToJournal = useCallback(async () => {
    if (!drawer || !drawer.result) return; // can't save while loading or on error
    let entryPrice: number | undefined;
    try { const q = await fetchQuote(drawer.ticker); entryPrice = q.price; } catch { /* optional */ }
    appendJournal({
      id: uid(), ts: Date.now(), ticker: drawer.ticker, review_type: drawer.reviewType,
      thesis: loadProfiles()[drawer.ticker]?.thesis, conclusion: drawer.result.conclusion,
      entry_price: entryPrice, review: drawer.result,
    });
    setDrawer({ ...drawer, saved: true });
  }, [drawer]);

  const downloadWeekly = useCallback(() => {
    if (!weekly) return;
    const blob = new Blob([weekly.markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `weekly-report-${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [weekly]);

  // ── On mount: restore cache, then auto-scan if watchlist non-empty and no cached scan ──

  useEffect(() => {
    const cache = loadWorkspaceCache();
    if (cache.scan)   { setScan(cache.scan);    setScanCached(true); }
    if (cache.queue)  { setQueue(cache.queue);  setQueueCached(true); }
    if (cache.triage)   setTriage(cache.triage);
    if (cache.buyRec) { setBuyRec(cache.buyRec); setBuyRecCached(true); }

    // Auto-scan: rule-based, instant, no LLM — safe to fire without user intent.
    // Only runs once per component lifecycle (autoScanFiredRef guards re-renders).
    // Skipped if: already cached, watchlist empty, or already fired this session.
    if (!autoScanFiredRef.current && !cache.scan) {
      autoScanFiredRef.current = true;
      const tickers = loadWatchlistTickers();
      if (tickers.length > 0) {
        setScanLoading(true);
        scanWatchlist(tickers)
          .then((res) => {
            setScan(res);
            saveWorkspaceCache({ ...loadWorkspaceCache(), scan: res, scanTs: Date.now() });
          })
          .catch(() => { /* silent — user can retry manually */ })
          .finally(() => setScanLoading(false));
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runBuyRec = useCallback(async () => {
    setBuyRecLoading(true); setBuyRecError(null); setBuyRecCached(false);
    try {
      const res = await fetchBuyRecommendations(locale);
      setBuyRec(res);
      saveWorkspaceCache({ ...loadWorkspaceCache(), buyRec: res, buyRecTs: Date.now() });
    } catch (e) { setBuyRecError(e instanceof Error ? e.message : String(e)); }
    finally { setBuyRecLoading(false); }
  }, [locale]);

  const runPortfolio = useCallback(async () => {
    const wl = loadWatchlistTickers();
    if (!wl.length) { setPortfolioError(t('queue.noWatchlist')); return; }
    setPortfolioLoading(true); setPortfolioError(null);
    try {
      const res = await buildPortfolio(wl.slice(0, 6), portfolioStyle, locale);
      setPortfolio(res);
    } catch (e) { setPortfolioError(e instanceof Error ? e.message : String(e)); }
    finally { setPortfolioLoading(false); }
  }, [locale, portfolioStyle, t]);

  // ── Derived ───────────────────────────────────────────────────────────────

  const tickers = loadWatchlistTickers();
  const watchlistEmpty = tickers.length === 0;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className={styles.page}>
      {/* ── Page masthead ── */}
      <div className={styles.masthead}>
        <div className={styles.mastheadLeft}>
          <h1 className={styles.mastheadTitle}>{t('workspace.pageTitle')}</h1>
          <p className={styles.mastheadSub}>{t('workspace.pageSub')}</p>
        </div>
        <div className={styles.mastheadActions}>
          <div className={styles.btnStack}>
            <button className={styles.primaryBtn} onClick={runScan} disabled={scanLoading || watchlistEmpty}>
              {scanLoading
                ? <><Spinner />{t('scan.running')}</>
                : t('scan.run')}
            </button>
            <span className={styles.aiHint}>{t('ai.hint')}</span>
          </div>
          <div className={styles.btnStack}>
            <button className={styles.primaryBtn} onClick={runQueue} disabled={queueLoading || watchlistEmpty}>
              {queueLoading
                ? <><Spinner />{t('queue.running')}</>
                : t('queue.run')}
            </button>
            <span className={styles.aiHint}>{t('ai.hintSlow')}</span>
          </div>
        </div>
      </div>

      {/* ── Scan section ── */}
      <Section
        title={t('scan.title')}
        titleNote={t('scan.subtitle')}
        action={null}
        cached={scanCached ? t('scan.cached') : undefined}
        error={watchlistEmpty ? null : scanError}
        onRetry={runScan}
        t={t}
      >
        {/* Empty watchlist: guided first action */}
        {watchlistEmpty && (
          <GuidedEmpty
            icon="🔭"
            body={t('workspace.emptyWatchlist')}
            btnLabel={t('workspace.emptyWatchlistBtn')}
            onBtn={() => onNavigate?.('discover')}
            extra={<QuickAddWatchlist t={t} onAdded={() => { /* tickers derived each render */ }} />}
          />
        )}

        {/* Watchlist present, no scan yet, not loading */}
        {!watchlistEmpty && !scan && !scanLoading && !scanError && (
          <GuidedEmpty
            icon="⚡"
            body={t('workspace.readyToScan')}
            btnLabel={t('workspace.readyToScanBtn')}
            onBtn={runScan}
          />
        )}

        {!watchlistEmpty && scanError && scanError !== t('scan.noWatchlist') && (
          <div className={styles.inlineError}>{scanError}</div>
        )}
        {!watchlistEmpty && scanLoading && !scan && <LoadingRow>{t('scan.running')}</LoadingRow>}

        {!watchlistEmpty && scan && (
          <>
            <p className={styles.metaNote}>
              {t('scan.summary').replace('{triggered}', String(scan.triggered)).replace('{scanned}', String(scan.scanned))}
            </p>
            {scan.triggers.length === 0 && <Empty>{t('scan.empty')}</Empty>}
            {scan.triggers.length > 0 && (
              <div className={styles.btnStack} style={{ marginBottom: 12 }}>
                <button
                  className={styles.primaryBtn}
                  onClick={runAnalyzeAll}
                  disabled={analyzeAllLoading}
                >
                  {analyzeAllLoading
                    ? <><Spinner />{t('scan.analyzingAll')}</>
                    : t('scan.analyzeAll').replace('{n}', String(Math.min(scan.triggers.length, 6)))}
                </button>
                <span className={styles.aiHint}>{t('scan.analyzeAllHint')}</span>
                {scan.triggers.length > 6 && (
                  <span className={styles.aiHint}>{t('scan.analyzeAllCap')}</span>
                )}
                {aaProgress && (
                  <div className={styles.aaProgressBox}>
                    <div className={styles.aaProgressTrack}>
                      <div
                        className={styles.aaProgressFill}
                        style={{ width: `${aaProgress.total ? (aaProgress.done / aaProgress.total) * 100 : 0}%` }}
                      />
                    </div>
                    <div className={styles.aaProgressLabel}>
                      {aaProgress.phase === 'done'
                        ? <span>{t('analyzeAll.complete').replace('{n}', String(aaProgress.done))}{aaProgress.emailed ? ` · ${t('analyzeAll.emailedOk')}` : ''}</span>
                        : aaProgress.phase === 'emailing'
                          ? <span>{t('analyzeAll.emailing')}</span>
                          : <span>{t('analyzeAll.progress')
                              .replace('{done}', String(aaProgress.done))
                              .replace('{total}', String(aaProgress.total))}
                              {aaProgress.current ? ` · ${aaProgress.current}` : ''}</span>}
                    </div>
                    {aaProgress.results.length > 0 && (
                      <div className={styles.aaResultChips}>
                        {aaProgress.results.map((r) => (
                          <span key={r.ticker}
                            className={`${styles.aaChip} ${r.action === 'BUY' ? styles.aaChipBuy : r.action === 'SELL' ? styles.aaChipSell : styles.aaChipHold}`}>
                            {r.ticker} {r.action ?? '—'}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {analyzeAllError && (
                  <span className={styles.inlineError}>
                    {t('scan.analyzeAllError')}: {analyzeAllError}
                  </span>
                )}
              </div>
            )}
            <div className={styles.cardList}>
              {scan.triggers.map((trigger) => (
                <ScanCard key={trigger.ticker} trigger={trigger}
                  reviewLoading={reviewLoadingFor.has(trigger.ticker)}
                  onReview={(ticker, rt) => runReviewFor(ticker, rt)} t={t} />
              ))}
            </div>
          </>
        )}
        {reviewError && <div className={styles.inlineError}>{reviewError}</div>}
      </Section>

      {/* ── Buy Picks ── */}
      <Section
        title={t('buyrec.title')}
        titleNote={t('buyrec.subtitle')}
        action={
          <div className={styles.btnStack} style={{ alignItems: 'flex-end' }}>
            <button
              className={styles.primaryBtn}
              onClick={runBuyRec}
              disabled={buyRecLoading}
            >
              {buyRecLoading ? <><Spinner />{t('buyrec.running')}</> : t('buyrec.run')}
            </button>
            <span className={styles.aiHint}>{t('buyrec.hint')}</span>
          </div>
        }
        cached={buyRecCached ? t('buyrec.cached') : undefined}
        error={buyRecError}
        onRetry={runBuyRec}
        t={t}
      >
        {!buyRec && !buyRecLoading && !buyRecError && <Empty>{t('buyrec.run')}</Empty>}
        {buyRecLoading && <LoadingRow>{t('buyrec.running')}</LoadingRow>}
        {buyRec && (
          <>
            {buyRec.summary && (
              <p className={styles.metaNote}>{buyRec.summary}</p>
            )}
            {buyRec.recommendations.length === 0 && (
              <Empty>{t('buyrec.empty')}</Empty>
            )}
            <div className={styles.buyRecGrid}>
              {buyRec.recommendations.map((rec) => {
                const isHigh = rec.conviction === 'high';
                return (
                  <div key={rec.ticker} className={styles.buyRecCard}>
                    <div className={styles.buyRecCardHeader}>
                      <span className={styles.buyRecTicker}>{rec.ticker}</span>
                      <span className={`${styles.badge} ${isHigh ? styles.badgeLow : styles.badgeMedium}`}>
                        {isHigh ? t('buyrec.conviction.high') : t('buyrec.conviction.medium')}
                      </span>
                      <button
                        className={styles.buyRecWlBtn}
                        onClick={() => addToWatchlist(rec.ticker)}
                        title={t('watchlist.add')}
                      >
                        + {t('watchlist.add')}
                      </button>
                    </div>
                    <span className={styles.buyRecVerified}>{t('buyrec.dagVerified')}</span>
                    <p className={styles.buyRecThesis}>{rec.thesis}</p>
                    {(rec.entry_price != null || rec.target_price != null || rec.stop_loss != null || rec.time_horizon) && (
                      <p className={styles.buyRecMeta}>
                        {rec.entry_price != null && <span style={{ marginRight: 12 }}>🟢 {t('buyrec.entry')} ${rec.entry_price}</span>}
                        {rec.target_price != null && <span style={{ marginRight: 12 }}>🎯 {t('buyrec.target')} ${rec.target_price}</span>}
                        {rec.stop_loss != null && <span style={{ marginRight: 12 }}>🛑 {t('buyrec.stop')} ${rec.stop_loss}</span>}
                        {rec.time_horizon && <span>⏱ {rec.time_horizon}</span>}
                      </p>
                    )}
                    {rec.catalyst && (
                      <p className={styles.buyRecMeta}>
                        <span className={styles.buyRecMetaLabel}>{t('buyrec.catalyst')}</span>
                        {rec.catalyst}
                      </p>
                    )}
                    {rec.risk && (
                      <p className={styles.buyRecMeta}>
                        <span className={styles.buyRecMetaLabel}>{t('buyrec.risk')}</span>
                        {rec.risk}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            {buyRec.rejected && buyRec.rejected.length > 0 && (
              <p className={styles.metaNote} style={{ marginTop: 10, opacity: 0.75 }}>
                {t('buyrec.rejected')}: {buyRec.rejected.map((r) => `${r.ticker}(${r.action})`).join('、')}
              </p>
            )}
          </>
        )}
      </Section>

      {/* ── Portfolio Builder (AlphaAgents: conviction-weighted + risk style) ── */}
      <Section
        title={t('portbuild.title')}
        titleNote={t('portbuild.subtitle')}
        action={
          <div className={styles.btnStack} style={{ alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <select
                value={portfolioStyle}
                onChange={(e) => setPortfolioStyle(e.target.value as 'conservative' | 'balanced' | 'aggressive')}
                style={{ padding: '6px 8px', borderRadius: 6, background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
              >
                <option value="conservative">🛡 {t('dag.riskConservative')}</option>
                <option value="balanced">⚖ {t('dag.riskBalanced')}</option>
                <option value="aggressive">🔥 {t('dag.riskAggressive')}</option>
              </select>
              <button className={styles.primaryBtn} onClick={runPortfolio} disabled={portfolioLoading}>
                {portfolioLoading ? <><Spinner />{t('portbuild.running')}</> : t('portbuild.run')}
              </button>
            </div>
            <span className={styles.aiHint}>{t('portbuild.hint')}</span>
          </div>
        }
        error={portfolioError}
        onRetry={runPortfolio}
        t={t}
      >
        {!portfolio && !portfolioLoading && !portfolioError && <Empty>{t('portbuild.run')}</Empty>}
        {portfolioLoading && <LoadingRow>{t('portbuild.running')}</LoadingRow>}
        {portfolio && (
          <>
            <p className={styles.metaNote}>{portfolio.note}</p>
            {portfolio.positions.length === 0 && <Empty>{t('portbuild.empty')}</Empty>}
            {portfolio.positions.map((p) => (
              <div key={p.ticker} style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '6px 0' }}>
                <span style={{ width: 64, fontWeight: 700 }}>{p.ticker}</span>
                <span style={{ flex: 1, height: 14, background: 'var(--bg-tertiary)', borderRadius: 4, overflow: 'hidden' }}>
                  <span style={{ display: 'block', width: `${p.weight_pct}%`, height: '100%', background: 'var(--accent, #00a870)' }} />
                </span>
                <span style={{ width: 52, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{p.weight_pct}%</span>
                <span style={{ width: 48, textAlign: 'right', color: 'var(--text-secondary)', fontSize: 12 }}>{Math.round(p.confidence * 100)}%</span>
              </div>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '8px 0 0', opacity: 0.7 }}>
              <span style={{ width: 64 }}>{t('portbuild.cash')}</span>
              <span style={{ flex: 1 }} />
              <span style={{ width: 52, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{portfolio.cash_pct}%</span>
              <span style={{ width: 48 }} />
            </div>
          </>
        )}
      </Section>

      {/* ── Strategy Eval (forward-return backtest of recorded configs) ── */}
      <EvalPanel />

      {/* ── Action Queue ── */}
      <Section
        title={t('queue.title')}
        titleNote={t('queue.titleNote')}
        action={null}
        cached={queueCached ? t('queue.cached') : undefined}
        error={queueError === t('queue.noWatchlist') ? null : queueError}
        onRetry={runQueue}
        t={t}
      >
        {queueError === t('queue.noWatchlist') && (
          <QuickAddWatchlist t={t} onAdded={() => { setQueueError(null); }} />
        )}
        {!queue && !queueLoading && !queueError && <Empty>{t('queue.empty')}</Empty>}
        {queueLoading && !queue && <LoadingRow>{t('queue.running')}</LoadingRow>}
        {queue && (
          <>
            {queue.summary && <div className={styles.summaryBanner}>{queue.summary}</div>}
            {queue.high.length > 0 && (
              <>
                <GroupLabel>{t('queue.high')}</GroupLabel>
                {queue.high.map((item) => (
                  <QueueRow key={`h-${item.ticker}`} item={item} severity="high"
                    onReview={() => runReviewFor(item.ticker, item.review_type)}
                    loading={reviewLoadingFor.has(item.ticker)} reviewLabel={t('queue.runReview')} />
                ))}
              </>
            )}
            {queue.medium.length > 0 && (
              <>
                <GroupLabel>{t('queue.medium')}</GroupLabel>
                {queue.medium.map((item) => (
                  <QueueRow key={`m-${item.ticker}`} item={item} severity="medium"
                    onReview={() => runReviewFor(item.ticker, item.review_type)}
                    loading={reviewLoadingFor.has(item.ticker)} reviewLabel={t('queue.runReview')} />
                ))}
              </>
            )}
            {queue.no_action.length > 0 && (
              <>
                <GroupLabel>{t('queue.noAction')}</GroupLabel>
                <div className={styles.chips}>
                  {queue.no_action.map((tk) => <span key={tk} className={styles.chip}>{tk}</span>)}
                </div>
              </>
            )}
            {reviewError && <div className={styles.inlineError}>{reviewError}</div>}
          </>
        )}
      </Section>

      {/* ── Triage ── */}
      <Section
        title={t('triage.title')}
        action={
          <div className={styles.btnStack} style={{ alignItems: 'flex-end' }}>
            <button className={styles.secondaryBtn} onClick={runTriage} disabled={triageLoading || watchlistEmpty}>
              {triageLoading ? <><Spinner />{t('triage.running')}</> : t('triage.run')}
            </button>
            <span className={styles.aiHint}>{t('ai.hintSlow')}</span>
          </div>
        }
        error={triageError}
        onRetry={runTriage}
        t={t}
      >
        {!triage && !triageLoading && !triageError && <Empty>{t('triage.empty')}</Empty>}
        {triageLoading && <LoadingRow>{t('triage.running')}</LoadingRow>}
        {triage && triage.items.map((it) => (
          <div key={it.ticker} className={styles.triageRow}>
            <div className={styles.triageLeft}>
              <span className={styles.rowTicker}>{it.ticker}</span>
              <span className={styles.rowReason}>{it.reason}</span>
            </div>
            <span className={`${styles.badge} ${TRIAGE_LEVEL_BADGE[it.level] || styles.badgeNeutral}`}>
              {t(TRIAGE_LEVEL_KEY[it.level] || 'triage.level.noAction')}
            </span>
          </div>
        ))}
      </Section>

      {/* ── Weekly Report ── */}
      <Section
        title={t('weekly.title')}
        action={
          <div className={styles.btnRow}>
            {weekly && <button className={styles.secondaryBtn} onClick={downloadWeekly}>{t('weekly.download')}</button>}
            <div className={styles.btnStack} style={{ alignItems: 'flex-end' }}>
              <button className={styles.secondaryBtn} onClick={runWeekly} disabled={weeklyLoading || watchlistEmpty}>
                {weeklyLoading ? <><Spinner />{t('weekly.running')}</> : t('weekly.run')}
              </button>
              <span className={styles.aiHint}>{t('ai.hintSlow')}</span>
            </div>
          </div>
        }
        error={weeklyError}
        onRetry={runWeekly}
        t={t}
      >
        {!weekly && !weeklyLoading && !weeklyError && <Empty>{t('weekly.empty')}</Empty>}
        {weeklyLoading && <LoadingRow>{t('weekly.running')}</LoadingRow>}
        {weekly && (
          <>
            {weekly.high_priority.length > 0 && (<>
              <GroupLabel>{t('weekly.highPriority')}</GroupLabel>
              {weekly.high_priority.map((e, i) => (
                <div key={`wh-${i}`} className={styles.weeklyRow}>
                  <span className={styles.rowTicker}>{e.ticker}</span>
                  <span className={styles.rowReason}>{e.note}</span>
                </div>
              ))}
            </>)}
            {weekly.thesis_changed.length > 0 && (<>
              <GroupLabel>{t('weekly.thesisChanged')}</GroupLabel>
              {weekly.thesis_changed.map((e, i) => (
                <div key={`wt-${i}`} className={styles.weeklyRow}>
                  <span className={styles.rowTicker}>{e.ticker}</span>
                  <span className={styles.rowReason}>{e.note}</span>
                </div>
              ))}
            </>)}
            {weekly.exposure_changes && (<>
              <GroupLabel>{t('weekly.exposureChanges')}</GroupLabel>
              <div className={styles.summaryBanner}>{weekly.exposure_changes}</div>
            </>)}
            {weekly.key_events.length > 0 && (<>
              <GroupLabel>{t('weekly.keyEvents')}</GroupLabel>
              <ul className={styles.bulletList}>
                {weekly.key_events.map((ev, i) => <li key={i}>{ev}</li>)}
              </ul>
            </>)}
            {weekly.next_week_watch.length > 0 && (<>
              <GroupLabel>{t('weekly.nextWeek')}</GroupLabel>
              <div className={styles.chips}>
                {weekly.next_week_watch.map((tk, i) => <span key={i} className={styles.chip}>{tk}</span>)}
              </div>
            </>)}
            {weekly.no_action.length > 0 && (<>
              <GroupLabel>{t('weekly.noAction')}</GroupLabel>
              <div className={styles.chips}>
                {weekly.no_action.map((tk) => <span key={tk} className={styles.chip}>{tk}</span>)}
              </div>
            </>)}
            {weekly.markdown && (
              <div className={styles.markdownRendered}>
                <MiniMarkdown text={weekly.markdown} className={styles.weeklyMarkdownBody} />
              </div>
            )}
          </>
        )}
      </Section>

      {/* ── Digest Report ── */}
      <DigestSection t={t} locale={locale} />

      {/* ── Trump Watch ── */}
      <TrumpWatchSection t={t} locale={locale} />

      {drawer && (
        <ReviewDrawer
          state={drawer}
          onClose={() => setDrawer(null)}
          onSave={saveToJournal}
          onRetry={drawer.error
            ? () => runReviewFor(drawer.ticker, drawer.reviewType)
            : undefined}
          t={t}
        />
      )}
    </div>
  );
}

// ─── Guided empty state ───────────────────────────────────────────────────────

function GuidedEmpty({ icon, body, btnLabel, onBtn, extra }: {
  icon: string;
  body: string;
  btnLabel: string;
  onBtn: () => void;
  extra?: React.ReactNode;
}) {
  return (
    <div className={styles.guidedEmpty}>
      <span className={styles.guidedEmptyIcon}>{icon}</span>
      <p className={styles.guidedEmptyBody}>{body}</p>
      <button className={styles.guidedEmptyBtn} onClick={onBtn}>{btnLabel}</button>
      {extra && <div className={styles.guidedEmptyExtra}>{extra}</div>}
    </div>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, titleNote, action, cached, error, onRetry, children, t }: {
  title: string; titleNote?: string; action: React.ReactNode; cached?: string;
  error: string | null; onRetry: () => void; children: React.ReactNode; t: T;
}) {
  return (
    <div className={styles.section}>
      <div className={styles.sectionHead}>
        <div className={styles.sectionHeadLeft}>
          <h2 className={styles.sectionTitle}>{title}</h2>
          {titleNote && <span className={styles.sectionNote}>{titleNote}</span>}
        </div>
        {action && <div>{action}</div>}
      </div>
      {cached && <div className={styles.cachedNote}>{cached}</div>}
      {error && (
        <div className={styles.errorBox}>
          <span>{error}</span>
          <button className={styles.retryBtn} onClick={onRetry}>{t('common.retry')}</button>
        </div>
      )}
      {children}
    </div>
  );
}

// ─── Digest Report ──────────────────────────────────────────────────────────

const DIGEST_EMAIL_KEY = 'qc-digest-email';
const DIGEST_MAX = 6;

function DigestSection({ t, locale }: { t: T; locale: string }) {
  const watchlist = loadWatchlistTickers();

  // Default-select the first up-to-6 watchlist tickers.
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(watchlist.slice(0, DIGEST_MAX))
  );
  const [email, setEmail] = useState<string>(
    () => localStorage.getItem(DIGEST_EMAIL_KEY) || ''
  );

  const [smtpConfigured, setSmtpConfigured] = useState<boolean | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const statusFetchedRef = useRef(false);

  // Fetch SMTP status once on mount.
  useEffect(() => {
    if (statusFetchedRef.current) return;
    statusFetchedRef.current = true;
    fetchDigestStatus()
      .then((s) => setSmtpConfigured(s.smtp_configured))
      .catch(() => setSmtpConfigured(false));
  }, []);

  const selectedTickers = watchlist.filter((tk) => selected.has(tk));
  const atCap = selectedTickers.length >= DIGEST_MAX;

  const toggle = useCallback((ticker: string) => {
    setSent(false);
    setError(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(ticker)) {
        next.delete(ticker);
      } else {
        // Cap at DIGEST_MAX — ignore extra selections beyond the limit.
        if (next.size >= DIGEST_MAX) return prev;
        next.add(ticker);
      }
      return next;
    });
  }, []);

  const onEmailChange = useCallback((value: string) => {
    setEmail(value);
    setSent(false);
    try { localStorage.setItem(DIGEST_EMAIL_KEY, value); } catch { /* quota */ }
  }, []);

  const runPreview = useCallback(async () => {
    if (!selectedTickers.length) return;
    setPreviewing(true);
    setError(null);
    try {
      await previewDigest(selectedTickers, locale);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('digest.error'));
    } finally {
      setPreviewing(false);
    }
  }, [selectedTickers, locale, t]);

  const runSend = useCallback(async () => {
    if (!selectedTickers.length || !email) return;
    setSending(true);
    setError(null);
    setSent(false);
    try {
      const res = await sendDigest(selectedTickers, email, locale);
      if (res.ok) {
        setSent(true);
      } else {
        setError(res.error || t('digest.error'));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('digest.error'));
    } finally {
      setSending(false);
    }
  }, [selectedTickers, email, locale, t]);

  const busy = previewing || sending;
  const noneSelected = selectedTickers.length === 0;
  const emailReady = email.trim().length > 0 && smtpConfigured === true;

  // ── Auto-watch (server-side subscription) ─────────────────────────────────
  const [watchEnabled, setWatchEnabled] = useState(false);
  const [watchNews, setWatchNews] = useState(true);
  const [watchAnomaly, setWatchAnomaly] = useState(true);
  const [watchSmtp, setWatchSmtp] = useState<boolean | null>(null);
  const [watchSaving, setWatchSaving] = useState(false);
  const [watchChecking, setWatchChecking] = useState(false);
  const [watchQueued, setWatchQueued] = useState(false);
  const [watchError, setWatchError] = useState<string | null>(null);
  const [dailyEnabled, setDailyEnabled] = useState<boolean | null>(null);
  const [dailyHour, setDailyHour] = useState<number | null>(null);
  const [dailySending, setDailySending] = useState(false);
  const [dailyQueued, setDailyQueued] = useState(false);
  const watchHydratedRef = useRef(false);

  // Reflect existing subscription + SMTP capability on mount (once email known).
  useEffect(() => {
    if (watchHydratedRef.current) return;
    watchHydratedRef.current = true;

    fetchWatchStatus()
      .then((s) => {
        setWatchSmtp(s.smtp_configured);
        setDailyEnabled(s.daily_enabled ?? false);
        setDailyHour(s.daily_hour_utc ?? null);
      })
      .catch(() => setWatchSmtp(false));

    const saved = localStorage.getItem(DIGEST_EMAIL_KEY) || '';
    if (!saved) return;
    getWatchSubscription(saved)
      .then((sub) => {
        if (!sub) return;
        setWatchEnabled(sub.enabled);
        setWatchNews(sub.triggers?.news ?? true);
        setWatchAnomaly(sub.triggers?.anomaly ?? true);
      })
      .catch(() => { /* silent — defaults stand */ });
  }, []);

  // Persist the subscription. `enabled` is passed explicitly so the toggle can
  // disable without depending on async state updates.
  const persistWatch = useCallback(
    async (enabled: boolean, news: boolean, anomaly: boolean) => {
      if (!email.trim()) { setWatchError(t('watch.noEmail')); return; }
      setWatchSaving(true);
      setWatchError(null);
      setWatchQueued(false);
      try {
        const res = await subscribeWatch({
          email: email.trim(),
          tickers: selectedTickers,
          triggers: { news, anomaly },
          language: locale,
          enabled,
        });
        if (!res.ok) {
          setWatchError(res.error || t('digest.error'));
          return false;
        }
        return true;
      } catch (e) {
        setWatchError(e instanceof Error ? e.message : t('digest.error'));
        return false;
      } finally {
        setWatchSaving(false);
      }
    },
    [email, selectedTickers, locale, t]
  );

  const onToggleWatch = useCallback(async () => {
    const next = !watchEnabled;
    const ok = await persistWatch(next, watchNews, watchAnomaly);
    if (ok) setWatchEnabled(next);
  }, [watchEnabled, watchNews, watchAnomaly, persistWatch]);

  const onToggleTrigger = useCallback(
    async (kind: 'news' | 'anomaly') => {
      const news = kind === 'news' ? !watchNews : watchNews;
      const anomaly = kind === 'anomaly' ? !watchAnomaly : watchAnomaly;
      // Reflect locally first for snappy feedback.
      if (kind === 'news') setWatchNews(news);
      else setWatchAnomaly(anomaly);
      // Only re-sync the server if a subscription is active.
      if (watchEnabled) await persistWatch(true, news, anomaly);
    },
    [watchNews, watchAnomaly, watchEnabled, persistWatch]
  );

  const onCheckNow = useCallback(async () => {
    if (!email.trim()) return;
    setWatchChecking(true);
    setWatchError(null);
    setWatchQueued(false);
    try {
      const res = await runWatchNow(email.trim());
      if (res.queued || res.ok) setWatchQueued(true);
    } catch (e) {
      setWatchError(e instanceof Error ? e.message : t('digest.error'));
    } finally {
      setWatchChecking(false);
    }
  }, [email, t]);

  const onSendDailyNow = useCallback(async () => {
    if (!email.trim()) return;
    setDailySending(true);
    setDailyQueued(false);
    setWatchError(null);
    try {
      const res = await sendDailyNow(email.trim());
      if (res.queued || res.ok) setDailyQueued(true);
      else setWatchError(res.error || t('digest.error'));
    } catch (e) {
      setWatchError(e instanceof Error ? e.message : t('digest.error'));
    } finally {
      setDailySending(false);
    }
  }, [email, t]);

  const watchEmailReady = email.trim().length > 0;

  return (
    <Section
      title={t('digest.title')}
      titleNote={t('digest.subtitle')}
      action={null}
      error={null}
      onRetry={() => {}}
      t={t}
    >
      {watchlist.length === 0 && <Empty>{t('queue.noWatchlist')}</Empty>}

      {watchlist.length > 0 && (
        <>
          <div className={styles.digestWarn}>
            <span className={styles.digestWarnIcon}>⚠</span>
            <span>{t('digest.slowHint')}</span>
          </div>

          {/* Ticker selection */}
          <div className={styles.digestField}>
            <span className={styles.digestFieldLabel}>{t('digest.selectTickers')}</span>
            <div className={styles.digestTickerChips}>
              {watchlist.map((tk) => {
                const on = selected.has(tk);
                // Dim unselectable chips once the cap is reached.
                const over = !on && atCap;
                return (
                  <button
                    key={tk}
                    type="button"
                    className={`${styles.digestChip} ${on ? styles.digestChipOn : ''} ${over ? styles.digestChipOver : ''}`}
                    onClick={() => toggle(tk)}
                    aria-pressed={on}
                    disabled={busy}
                  >
                    {tk}
                  </button>
                );
              })}
            </div>
            <span className={styles.digestStatusHint}>{t('digest.maxNote')}</span>
          </div>

          {/* Email */}
          <div className={styles.digestField}>
            <label className={styles.digestFieldLabel} htmlFor="digest-email">
              {t('digest.email')}
            </label>
            <input
              id="digest-email"
              type="email"
              className={styles.digestEmailInput}
              placeholder={t('digest.emailPlaceholder')}
              value={email}
              onChange={(e) => onEmailChange(e.target.value)}
              disabled={busy}
            />
            {smtpConfigured === false && (
              <span className={styles.digestStatusHint}>{t('digest.noSmtp')}</span>
            )}
          </div>

          {/* Actions */}
          <div className={styles.digestActions}>
            <button
              className={styles.primaryBtn}
              onClick={runPreview}
              disabled={busy || noneSelected}
            >
              {previewing
                ? <><Spinner />{t('digest.previewing')}</>
                : t('digest.preview')}
            </button>
            <button
              className={styles.secondaryBtn}
              onClick={runSend}
              disabled={busy || noneSelected || !emailReady}
            >
              {sending
                ? <><Spinner />{t('digest.sending')}</>
                : t('digest.send')}
            </button>
            {sent && <span className={styles.digestStatusOk}>{t('digest.sent')}</span>}
            {error && <span className={styles.digestStatusErr}>{error}</span>}
          </div>

          {/* ── Auto-watch sub-block ── */}
          <div className={styles.watchBlock}>
            <div className={styles.watchHead}>
              <div className={styles.watchHeadText}>
                <span className={styles.watchTitle}>{t('watch.title')}</span>
                <span className={styles.watchExplainer}>{t('watch.explainer')}</span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={watchEnabled}
                aria-label={t('watch.enable')}
                className={`${styles.watchSwitch} ${watchEnabled ? styles.watchSwitchOn : ''}`}
                onClick={onToggleWatch}
                disabled={watchSaving || !watchEmailReady || noneSelected}
              >
                <span className={styles.watchSwitchKnob} />
              </button>
            </div>

            <div className={styles.watchControls}>
              <span className={styles.watchStateLabel}>
                {watchSaving
                  ? <><Spinner />{t('digest.sending')}</>
                  : watchEnabled
                    ? <span className={styles.watchStateOn}>{t('watch.enabled')}</span>
                    : <span className={styles.watchStateOff}>{t('watch.disabled')}</span>}
              </span>

              <div className={styles.watchTriggers}>
                <button
                  type="button"
                  className={`${styles.digestChip} ${watchNews ? styles.digestChipOn : ''}`}
                  aria-pressed={watchNews}
                  onClick={() => onToggleTrigger('news')}
                  disabled={watchSaving}
                >
                  {t('watch.triggerNews')}
                </button>
                <button
                  type="button"
                  className={`${styles.digestChip} ${watchAnomaly ? styles.digestChipOn : ''}`}
                  aria-pressed={watchAnomaly}
                  onClick={() => onToggleTrigger('anomaly')}
                  disabled={watchSaving}
                >
                  {t('watch.triggerAnomaly')}
                </button>
              </div>

              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={onCheckNow}
                disabled={watchChecking || !watchEmailReady}
              >
                {watchChecking
                  ? <><Spinner />{t('digest.sending')}</>
                  : t('watch.checkNow')}
              </button>

              {watchQueued && <span className={styles.digestStatusOk}>{t('watch.queued')}</span>}
              {watchError && <span className={styles.digestStatusErr}>{watchError}</span>}
            </div>

            {/* ── Daily scheduled report sub-block ── */}
            <div className={styles.watchDailyBlock}>
              <div className={styles.watchDailyRow}>
                <span className={styles.watchDailyTitle}>{t('watch.dailyTitle')}</span>
                <span className={styles.watchDailyStatus}>
                  {dailyEnabled === null
                    ? null
                    : dailyEnabled && dailyHour !== null
                      ? t('watch.dailyOn').replace('{h}', String(dailyHour).padStart(2, '0'))
                      : t('watch.dailyOff')}
                </span>
              </div>
              <div className={styles.watchControls}>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={onSendDailyNow}
                  disabled={dailySending || !watchEmailReady || watchSmtp === false}
                  title={t('watch.dailyHint')}
                >
                  {dailySending
                    ? <><Spinner />{t('digest.sending')}</>
                    : t('watch.sendDaily')}
                </button>
                {dailyQueued && (
                  <span className={styles.digestStatusOk}>{t('watch.dailyQueued')}</span>
                )}
              </div>
              <span className={styles.watchExplainer} style={{ marginTop: 4 }}>
                {t('watch.dailyHint')}
              </span>
            </div>

            {watchSmtp === false && (
              <div className={styles.watchWarn}>
                <span className={styles.digestWarnIcon}>⚠</span>
                <span>{t('watch.noSmtp')}</span>
              </div>
            )}
          </div>
        </>
      )}
    </Section>
  );
}

// ─── Trump Watch ──────────────────────────────────────────────────────────────

function formatTrumpDate(iso: string, locale: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(locale === 'zh-TW' ? 'zh-TW' : 'en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function TrumpWatchSection({ t, locale }: { t: T; locale: string }) {
  const [feed, setFeed] = useState<TrumpFeed | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetchTrumpPosts(12);
      setFeed(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('trump.error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  // Auto-load once per mount (guarded against StrictMode double-fire).
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    void load();
  }, [load]);

  const posts = feed?.posts ?? [];
  const isTruth = feed?.source === 'truthsocial';
  const hasSource = !!feed && feed.source !== 'none';

  return (
    <Section
      title={t('trump.title')}
      titleNote={t('trump.subtitle')}
      action={
        <button className={styles.secondaryBtn} onClick={load} disabled={loading}>
          {loading ? <><Spinner />{t('trump.loading')}</> : feed ? t('trump.refresh') : t('trump.load')}
        </button>
      }
      error={error}
      onRetry={load}
      t={t}
    >
      {loading && !feed && <LoadingRow>{t('trump.loading')}</LoadingRow>}
      {!loading && feed && posts.length === 0 && <Empty>{t('trump.empty')}</Empty>}
      {posts.length > 0 && (
        <div className={styles.cardList}>
          {posts.map((post, i) => (
            <TrumpCard
              key={post.url ? `${post.url}-${i}` : `trump-${i}`}
              text={post.text}
              url={post.url}
              date={formatTrumpDate(post.published_at, locale)}
              sourceLabel={isTruth ? t('trump.sourceTruth') : t('trump.sourceNews')}
              isTruth={isTruth}
              showSource={hasSource}
            />
          ))}
        </div>
      )}
    </Section>
  );
}

function TrumpCard({ text, url, date, sourceLabel, isTruth, showSource }: {
  text: string; url: string; date: string;
  sourceLabel: string; isTruth: boolean; showSource: boolean;
}) {
  const inner = (
    <>
      <div className={styles.trumpCardTop}>
        {showSource && (
          <span className={`${styles.badge} ${isTruth ? styles.badgeAccent : styles.badgeNeutral}`}>
            {sourceLabel}
          </span>
        )}
        {date && <span className={styles.trumpDate}>{date}</span>}
      </div>
      <p className={styles.trumpText}>{text}</p>
    </>
  );
  const className = `${styles.trumpCard} ${isTruth ? styles.trumpCardTruth : ''}`;
  return url ? (
    <a className={`${className} ${styles.trumpCardLink}`} href={url} target="_blank" rel="noopener noreferrer">
      {inner}
    </a>
  ) : (
    <div className={className}>{inner}</div>
  );
}

// ─── Scan card ────────────────────────────────────────────────────────────────

function ScanCard({ trigger, reviewLoading, onReview, t }: {
  trigger: ScanTrigger; reviewLoading: boolean;
  onReview: (ticker: string, rt: string) => void; t: T;
}) {
  const isHigh = trigger.priority === 'high';
  const chgSign = trigger.chg_5d >= 0 ? '+' : '';
  return (
    <div className={styles.scanCard}>
      <div className={styles.scanCardLeft}>
        <div className={styles.scanCardTop}>
          <span className={styles.rowTicker}>{trigger.ticker}</span>
          <span className={`${styles.badge} ${isHigh ? styles.badgeHigh : styles.badgeMedium}`}>
            {isHigh ? t('scan.priority.high') : t('scan.priority.medium')}
          </span>
          <span className={`${styles.statChip} ${trigger.chg_5d >= 0 ? styles.positive : styles.negative}`}>
            {t('scan.chg5d')} {chgSign}{trigger.chg_5d.toFixed(1)}%
          </span>
          <span className={styles.statChip}>{trigger.rel_volume.toFixed(1)}× {t('scan.relVol')}</span>
          {trigger.events.map((ev, i) => (
            <span key={i} className={styles.eventChip} title={ev.detail}>{ev.type}</span>
          ))}
        </div>
        <div className={styles.scanCardDetails}>
          {trigger.events.map((ev, i) => <p key={i} className={styles.eventDetail}>{ev.detail}</p>)}
        </div>
      </div>
      <div className={styles.btnStack} style={{ alignItems: 'flex-end' }}>
        <button className={styles.reviewBtn}
          onClick={() => onReview(trigger.ticker, trigger.recommended_review)}
          disabled={reviewLoading}>
          {reviewLoading ? <Spinner /> : t('scan.runReview')}
        </button>
        <span className={styles.aiHint}>{t('ai.hintSlow')}</span>
      </div>
    </div>
  );
}

// ─── Queue row ────────────────────────────────────────────────────────────────

function QueueRow({ item, severity, onReview, loading, reviewLabel }: {
  item: ActionQueueItem; severity: 'high' | 'medium';
  onReview: () => void; loading: boolean; reviewLabel: string;
}) {
  return (
    <div className={styles.queueRow}>
      <div className={styles.queueLeft}>
        <span className={styles.rowTicker}>{item.ticker}</span>
        <span className={styles.rowReason}>{item.reason}</span>
      </div>
      <div className={styles.queueRight}>
        <span className={`${styles.badge} ${severity === 'high' ? styles.badgeHigh : styles.badgeMedium}`}>
          {item.review_type}
        </span>
        <button className={styles.reviewBtn} onClick={onReview} disabled={loading}>
          {loading ? <Spinner /> : reviewLabel}
        </button>
      </div>
    </div>
  );
}

// ─── Primitives ───────────────────────────────────────────────────────────────

function GroupLabel({ children }: { children: React.ReactNode }) {
  return <div className={styles.groupLabel}>{children}</div>;
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div className={styles.empty}>{children}</div>;
}
function LoadingRow({ children }: { children: React.ReactNode }) {
  return <div className={styles.loadingRow}><Spinner /><span>{children}</span></div>;
}
function Spinner() {
  return <span className={styles.spinner} />;
}

// ─── Review Drawer (exported — used by JournalPage) ───────────────────────────
// ReviewDrawerState is defined near the top of this file (line ~54).
// JournalPage always passes a fully-loaded result; loading defaults to false.

// Seven skeleton lines mimic the 7 review sections while loading
function ReviewSkeleton() {
  return (
    <div className={styles.reviewSkeleton}>
      {[80, 60, 75, 55, 70, 65, 50].map((w, i) => (
        <div key={i} className={styles.reviewSkeletonGroup}>
          <div className={`${styles.reviewSkeletonLabel} ${styles.shimmer}`} />
          <div className={`${styles.reviewSkeletonLine} ${styles.shimmer}`} style={{ width: `${w}%` }} />
          <div className={`${styles.reviewSkeletonLine} ${styles.shimmer}`} style={{ width: `${Math.max(w - 18, 30)}%` }} />
        </div>
      ))}
    </div>
  );
}

export function ReviewDrawer({ state, onClose, onSave, onRetry, t }: {
  state: ReviewDrawerState;
  onClose: () => void;
  onSave: () => void;
  onRetry?: () => void;
  t: T;
}) {
  const r = state.result;
  const isDegraded = r?.degraded === true;

  const sections = r
    ? [
        { label: t('review.conclusion'),      body: r.conclusion },
        { label: t('review.whyTriggered'),    body: r.why_triggered },
        { label: t('review.bullCase'),        body: r.bull_case },
        { label: t('review.bearCase'),        body: r.bear_case },
        { label: t('review.riskReview'),      body: r.risk_review },
        { label: t('review.whatWouldChange'), body: r.what_would_change_our_mind },
        { label: t('review.nextTrigger'),     body: r.next_review_trigger },
      ]
    : [];

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.drawer} onClick={(e) => e.stopPropagation()}>
        {/* ── Header ── */}
        <div className={styles.drawerHead}>
          <div>
            <h2 className={styles.drawerTitle}>{state.ticker}</h2>
            <div className={styles.drawerSub}>{state.reviewType}</div>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">×</button>
        </div>

        {/* ── Body ── */}
        <div className={styles.drawerBody}>
          {/* LOADING state */}
          {state.loading && (
            <div className={styles.reviewLoadingPanel}>
              <span className={`${styles.spinner} ${styles.reviewLoadingSpinner}`} />
              <p className={styles.reviewLoadingTitle}>{t('review.loading')}</p>
              <p className={styles.reviewLoadingHint}>{t('review.loadingHint')}</p>
              <ReviewSkeleton />
            </div>
          )}

          {/* ERROR state */}
          {!state.loading && state.error && (
            <div className={styles.reviewErrorPanel}>
              <p className={styles.reviewErrorMsg}>{state.error}</p>
              {onRetry && (
                <button className={styles.secondaryBtn} onClick={onRetry}>
                  {t('review.retry')}
                </button>
              )}
            </div>
          )}

          {/* DEGRADED banner (AI unavailable, fallback result) */}
          {!state.loading && !state.error && isDegraded && (
            <div className={styles.reviewDegradedBanner}>
              <span className={styles.reviewDegradedIcon}>⚠</span>
              <span className={styles.reviewDegradedText}>{t('review.degraded')}</span>
              {onRetry && (
                <button className={styles.secondaryBtn} onClick={onRetry}
                  style={{ marginLeft: 'auto', flexShrink: 0 }}>
                  {t('review.retry')}
                </button>
              )}
            </div>
          )}

          {/* RESULT sections */}
          {!state.loading && !state.error && sections.map((s) =>
            s.body ? (
              <div key={s.label} className={styles.reviewSection}>
                <div className={styles.reviewLabel}>{s.label}</div>
                <div className={styles.reviewBody}>{s.body}</div>
              </div>
            ) : null
          )}
        </div>

        {/* ── Footer ── */}
        <div className={styles.drawerActions}>
          <div className={styles.btnStack}>
            <button
              className={styles.primaryBtn}
              onClick={onSave}
              disabled={state.saved || state.loading || !!state.error || !r}
            >
              {state.saved ? t('review.saved') : t('review.saveToJournal')}
            </button>
            {!state.loading && !r && null}
            {!state.loading && r && (
              <span className={styles.aiHint} style={{ textAlign: 'center' }}>{t('ai.hint')}</span>
            )}
          </div>
          <button className={styles.secondaryBtn} onClick={onClose}>{t('common.close')}</button>
        </div>
      </div>
    </div>
  );
}
