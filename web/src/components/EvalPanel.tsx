import { useEffect, useState, useCallback } from 'react';
import { fetchEvalLabels, fetchEvalScore, fetchEvalCompare, fetchEvalLeaderboard, runRollingBacktest, type EvalScore, type LeaderRow, type RollingBacktest, type SelectionBias } from '../api/client';
import { useI18n } from '../i18n/context';

// Compact strategy-evaluation panel: pick a recorded config label and see how
// its decisions performed on realized forward returns (net-of-cost, vs buy-hold,
// regime-tagged). Makes the eval harness visible to the user.
function pct(v: number | null | undefined): string {
  return typeof v === 'number' ? `${(v * 100).toFixed(1)}%` : '—';
}

export function EvalPanel() {
  const { t } = useI18n();
  const [labels, setLabels] = useState<{ label: string; count: number; model?: string | null }[]>([]);
  const [sel, setSel] = useState<string>('');
  const [score, setScore] = useState<EvalScore | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [selB, setSelB] = useState<string>('');
  const [cmp, setCmp] = useState<Record<string, string | null> | null>(null);
  const [cmpOverall, setCmpOverall] = useState<{ overall?: string; wins?: Record<string, number> } | null>(null);
  const [board, setBoard] = useState<LeaderRow[] | null>(null);
  const [boardBias, setBoardBias] = useState<SelectionBias | null>(null);
  const [showBoard, setShowBoard] = useState(false);
  const [roll, setRoll] = useState<RollingBacktest | null>(null);
  const [rollStrat, setRollStrat] = useState('tech_baseline');
  const [rollBusy, setRollBusy] = useState(false);

  useEffect(() => {
    fetchEvalLabels().then((l) => {
      setLabels(l);
      if (l.length && !sel) setSel(l[0].label);
    }).catch(() => setErr('failed to load labels'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = useCallback(async (label: string) => {
    if (!label) return;
    setLoading(true); setErr(null);
    try { setScore(await fetchEvalScore(label)); }
    catch (e) { setErr(e instanceof Error ? e.message : 'failed'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (sel) run(sel); }, [sel, run]);

  // FINSABER robustness backtest: run a strategy across many non-overlapping
  // windows over the last ~7 months and show the plain-language verdict.
  const runRoll = useCallback(async () => {
    setRollBusy(true); setRoll(null);
    try {
      const end = new Date();
      const start = new Date(end.getTime() - 210 * 864e5);
      const iso = (d: Date) => d.toISOString().slice(0, 10);
      setRoll(await runRollingBacktest({
        start_date: iso(start), end_date: iso(end), strategy: rollStrat, step_days: 30,
      }));
    } catch (e) {
      setRoll({ error: e instanceof Error ? e.message : 'failed' });
    } finally { setRollBusy(false); }
  }, [rollStrat]);

  // A/B compare when a second label is chosen
  useEffect(() => {
    if (sel && selB && sel !== selB) {
      fetchEvalCompare(sel, selB)
        .then((c) => { setCmp(c.better); setCmpOverall({ overall: c.overall, wins: c.wins }); })
        .catch(() => { setCmp(null); setCmpOverall(null); });
    } else {
      setCmp(null); setCmpOverall(null);
    }
  }, [sel, selB]);

  const beat = score?.beats_buy_hold;
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <strong style={{ fontSize: 14 }}>{t('eval.title')}
          <button onClick={async () => { setShowBoard(v => !v); if (!board) { try { const lb = await fetchEvalLeaderboard(); setBoard(lb.ranked); setBoardBias(lb.selection_bias ?? null); } catch { /* */ } } }}
            style={{ marginLeft: 10, padding: '3px 8px', borderRadius: 6, fontSize: 11, background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border)', cursor: 'pointer' }}>
            🏆 {showBoard ? t('eval.hide') : t('eval.leaderboard')}
          </button>
        </strong>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <select value={sel} onChange={(e) => setSel(e.target.value)}
            style={{ padding: '5px 8px', borderRadius: 6, background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
            {labels.length === 0 && <option value="">{t('eval.noData')}</option>}
            {labels.map((l) => <option key={l.label} value={l.label}>{l.label} ({l.count}){l.model ? ` · ${l.model}` : ''}</option>)}
          </select>
          <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{t('eval.vs')}</span>
          <select value={selB} onChange={(e) => setSelB(e.target.value)}
            style={{ padding: '5px 8px', borderRadius: 6, background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
            <option value="">{t('eval.single')}</option>
            {labels.map((l) => <option key={l.label} value={l.label}>{l.label}</option>)}
          </select>
        </div>
      </div>
      {cmp && (
        <div style={{ marginBottom: 8, padding: 8, background: 'var(--bg-tertiary)', borderRadius: 6, fontSize: 12 }}>
          {cmpOverall?.overall && (
            <div style={{ marginBottom: 6, fontSize: 13 }}>
              {t('eval.overallWinner')}: <strong>{cmpOverall.overall === 'tie' ? t('eval.tie') : cmpOverall.overall}</strong>
              {cmpOverall.wins && (
                <span style={{ color: 'var(--text-secondary)', marginLeft: 6 }}>
                  ({Object.entries(cmpOverall.wins).map(([k, v]) => `${k} ${v}`).join(' – ')})
                </span>
              )}
            </div>
          )}
          <strong>{sel} {t('eval.vs')} {selB} — {t('eval.winnerPerMetric')}:</strong>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 4 }}>
            {Object.entries(cmp).map(([k, v]) => (
              <span key={k}><span style={{ color: 'var(--text-secondary)' }}>{k}:</span> <strong>{v ?? '—'}</strong></span>
            ))}
          </div>
        </div>
      )}
      {showBoard && board && (
        <div style={{ marginBottom: 8, fontSize: 12 }}>
          <div style={{ color: 'var(--text-secondary)', marginBottom: 4 }}>{t('eval.rankedByExcess')}</div>
          {board.map((r) => (
            <div key={r.label} style={{ display: 'flex', gap: 8, padding: '2px 0' }}>
              <span style={{ width: 24 }}>#{r.rank}</span>
              <span style={{ flex: 1 }}>{r.label}</span>
              <span style={{ width: 70, textAlign: 'right', color: (r.excess_vs_buyhold ?? 0) >= 0 ? 'var(--green)' : 'var(--red)' }}>
                {typeof r.excess_vs_buyhold === 'number' ? `${(r.excess_vs_buyhold * 100).toFixed(1)}%` : '—'}
              </span>
              <span style={{ width: 44, textAlign: 'right' }}>{r.beats_buy_hold ? '✓BH' : '✗'}</span>
            </div>
          ))}
          {boardBias && typeof boardBias.trials === 'number' && boardBias.trials > 1 && (
            <div style={{ marginTop: 6, padding: 6, borderRadius: 6, background: 'var(--bg-secondary,var(--bg-tertiary))', color: 'var(--text-secondary)', fontSize: 11 }}>
              ⚠ {t('eval.selBiasPrefix')} {boardBias.trials} {t('eval.selBiasTrials')}
              {typeof boardBias.winner_p_bonferroni === 'number' && (
                <> {t('eval.selBiasPval')} <strong>{boardBias.winner_p_bonferroni.toFixed(3)}</strong>
                {boardBias.winner_p_bonferroni > 0.05 ? ` ${t('eval.selBiasNotSig')}` : ` ${t('eval.selBiasSig')}`}</>
              )}
            </div>
          )}
        </div>
      )}
      <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
          <span style={{ color: 'var(--text-secondary)' }}>{t('eval.robustness')}:</span>
          <select value={rollStrat} onChange={(e) => setRollStrat(e.target.value)}
            style={{ padding: '4px 6px', borderRadius: 6, background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
            <option value="tech_baseline">tech_baseline</option>
            <option value="mean_reversion">mean_reversion</option>
            <option value="momentum">momentum</option>
          </select>
          <button onClick={runRoll} disabled={rollBusy}
            style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border)', cursor: rollBusy ? 'wait' : 'pointer' }}>
            {rollBusy ? t('eval.running') : t('eval.run')}
          </button>
        </div>
        {roll && !roll.error && (
          <div style={{ marginTop: 6, fontSize: 12 }}>
            <div style={{ fontWeight: 600, color: (roll.excess_vs_buyhold?.mean ?? 0) > 0 ? 'var(--green)' : 'var(--text-primary)' }}>{roll.verdict}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 4, color: 'var(--text-secondary)' }}>
              <span>{t('eval.windows')}: <strong>{roll.beats_buy_hold_windows ?? '—'}</strong></span>
              <span>{t('eval.binomialP')}: <strong>{typeof roll.binomial_p_vs_coinflip === 'number' ? roll.binomial_p_vs_coinflip.toFixed(2) : '—'}</strong></span>
              <span>{t('eval.flipRate')}: <strong>{typeof roll.action_stability?.mean_flip_rate === 'number' ? roll.action_stability.mean_flip_rate.toFixed(2) : '—'}</strong></span>
              <span>{t('eval.maxDD')}: <strong>{typeof roll.max_drawdown === 'number' ? `${(roll.max_drawdown * 100).toFixed(1)}%` : '—'}</strong></span>
            </div>
          </div>
        )}
        {roll?.error && <div style={{ marginTop: 6, color: 'var(--red)', fontSize: 12 }}>{roll.error}</div>}
      </div>
      {err && <div style={{ color: 'var(--red)', fontSize: 12 }}>{err}</div>}
      {loading && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t('eval.scoring')}</div>}
      {score && !loading && (
        score.note && (score.directional ?? 0) === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {score.holds}/{score.n} {t('eval.hold')} — {score.note}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(130px,1fr))', gap: 8, fontSize: 12 }}>
            <Stat label={t('eval.hitRate')} v={pct(score.hit_rate)} />
            <Stat label={t('eval.netReturn')} v={pct(score.strategy_return)} pos={(score.strategy_return ?? 0) >= 0} />
            <Stat label={t('eval.buyHold')} v={pct(score.buy_hold_return)} />
            <Stat label={t('eval.excess')} v={pct(score.excess_vs_buyhold)} pos={(score.excess_vs_buyhold ?? 0) >= 0} />
            <Stat label={t('eval.beats')} v={beat == null ? '—' : beat ? t('eval.yes') : t('eval.no')} pos={!!beat} />
            <Stat label={t('eval.calibGap')} v={pct(score.calibration_gap)} />
            <Stat label={t('eval.brier')} v={typeof score.brier_score === 'number' ? score.brier_score.toFixed(3) : '—'} pos={typeof score.brier_score === 'number' ? score.brier_score < 0.25 : undefined} />
            <Stat label={t('eval.discrim')} v={typeof score.confidence_discrimination?.discrimination === 'number' ? score.confidence_discrimination.discrimination.toFixed(2) : '—'} pos={typeof score.confidence_discrimination?.discrimination === 'number' ? score.confidence_discrimination.discrimination > 0 : undefined} />
            <Stat label={t('eval.returnRisk')} v={typeof score.return_over_risk === 'number' ? score.return_over_risk.toFixed(2) : '—'} />
            <Stat label={t('eval.sortino')} v={typeof score.sortino === 'number' ? score.sortino.toFixed(2) : '—'} pos={typeof score.sortino === 'number' ? score.sortino >= 0 : undefined} />
            <Stat label={t('eval.regime')} v={score.window?.regime ?? '—'} />
            {(score.unscored ?? 0) > 0 && <Stat label={t('eval.unscored')} v={String(score.unscored)} pos={false} />}
          </div>
        )
      )}
    </div>
  );
}

function Stat({ label, v, pos }: { label: string; v: string; pos?: boolean }) {
  return (
    <div>
      <div style={{ color: 'var(--text-secondary)', fontSize: 10, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontWeight: 700, color: pos === undefined ? 'var(--text-primary)' : pos ? 'var(--green)' : 'var(--red)' }}>{v}</div>
    </div>
  );
}
