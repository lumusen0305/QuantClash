import { useEffect, useState, useCallback } from 'react';
import { fetchEvalLabels, fetchEvalScore, type EvalScore } from '../api/client';

// Compact strategy-evaluation panel: pick a recorded config label and see how
// its decisions performed on realized forward returns (net-of-cost, vs buy-hold,
// regime-tagged). Makes the eval harness visible to the user.
function pct(v: number | null | undefined): string {
  return typeof v === 'number' ? `${(v * 100).toFixed(1)}%` : '—';
}

export function EvalPanel() {
  const [labels, setLabels] = useState<{ label: string; count: number }[]>([]);
  const [sel, setSel] = useState<string>('');
  const [score, setScore] = useState<EvalScore | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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

  const beat = score?.beats_buy_hold;
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <strong style={{ fontSize: 14 }}>Strategy Eval (forward-return backtest)</strong>
        <select value={sel} onChange={(e) => setSel(e.target.value)}
          style={{ padding: '5px 8px', borderRadius: 6, background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
          {labels.length === 0 && <option value="">no eval data yet</option>}
          {labels.map((l) => <option key={l.label} value={l.label}>{l.label} ({l.count})</option>)}
        </select>
      </div>
      {err && <div style={{ color: 'var(--danger,#dc2626)', fontSize: 12 }}>{err}</div>}
      {loading && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>scoring…</div>}
      {score && !loading && (
        score.note && (score.directional ?? 0) === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {score.holds}/{score.n} HOLD — {score.note}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(130px,1fr))', gap: 8, fontSize: 12 }}>
            <Stat label="Hit rate" v={pct(score.hit_rate)} />
            <Stat label="Net return" v={pct(score.strategy_return)} pos={(score.strategy_return ?? 0) >= 0} />
            <Stat label="Buy & hold" v={pct(score.buy_hold_return)} />
            <Stat label="Excess vs B&H" v={pct(score.excess_vs_buyhold)} pos={(score.excess_vs_buyhold ?? 0) >= 0} />
            <Stat label="Beats B&H" v={beat == null ? '—' : beat ? '✓ yes' : '✗ no'} pos={!!beat} />
            <Stat label="Calib. gap" v={pct(score.calibration_gap)} />
            <Stat label="Return/risk" v={typeof score.return_over_risk === 'number' ? score.return_over_risk.toFixed(2) : '—'} />
            <Stat label="Regime" v={score.window?.regime ?? '—'} />
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
      <div style={{ fontWeight: 700, color: pos === undefined ? 'var(--text-primary)' : pos ? '#16a34a' : '#dc2626' }}>{v}</div>
    </div>
  );
}
