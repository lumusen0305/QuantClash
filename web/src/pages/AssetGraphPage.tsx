import { useState, useEffect, useCallback, useMemo } from 'react';
import styles from './AssetGraphPage.module.css';
import { QuickAddWatchlist } from '../components/QuickAddWatchlist';
import { classifyAsset, type AssetProfile } from '../api/client';
import { useI18n } from '../i18n/context';
import {
  loadProfiles,
  saveProfiles,
  loadWatchlistTickers,
  loadPositions,
} from '../lib/workspace';

type T = (key: string) => string;
type StatusKind = 'valid' | 'drifting' | 'broken' | 'unknown';

function statusKind(status?: string): StatusKind {
  if (!status) return 'unknown';
  const s = status.toLowerCase();
  if (s.includes('valid') || s.includes('有效')) return 'valid';
  if (s.includes('drift') || s.includes('偏移')) return 'drifting';
  if (s.includes('broke') || s.includes('失效')) return 'broken';
  return 'unknown';
}

export function AssetGraphPage() {
  const { t, locale } = useI18n();
  const [profiles, setProfiles] = useState<Record<string, AssetProfile>>({});
  const [held, setHeld] = useState<Set<string>>(new Set());
  const [tickers, setTickers] = useState<string[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [classifying, setClassifying] = useState<Set<string>>(new Set());
  const [classifyingAll, setClassifyingAll] = useState(false);
  const [classifyAllProgress, setClassifyAllProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setProfiles(loadProfiles());
    const watch = loadWatchlistTickers();
    const positions = loadPositions();
    const heldSet = new Set(positions.map((p) => p.ticker));
    setHeld(heldSet);
    const all = new Set<string>([...watch, ...positions.map((p) => p.ticker)]);
    setTickers([...all].sort());
  }, []);

  const persist = useCallback((next: Record<string, AssetProfile>) => {
    setProfiles(next);
    saveProfiles(next);
  }, []);

  const updateField = useCallback(
    (ticker: string, field: keyof AssetProfile, value: string) => {
      const current = profiles[ticker] || { ticker };
      persist({ ...profiles, [ticker]: { ...current, ticker, [field]: value } });
    },
    [profiles, persist]
  );

  const classify = useCallback(async (ticker: string) => {
    setClassifying((s) => { const n = new Set(s); n.add(ticker); return n; });
    setError(null);
    try {
      const heldCtx = held.has(ticker) ? 'Currently held position.' : 'On watchlist.';
      const res = await classifyAsset({ ticker, portfolio_context: heldCtx, language: locale });
      const current = loadProfiles();
      const merged: AssetProfile = { ...(current[ticker] || {}), ...res, ticker };
      const next = { ...current, [ticker]: merged };
      persist(next);
    } catch (e) {
      setError(`${ticker}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setClassifying((s) => { const n = new Set(s); n.delete(ticker); return n; });
    }
  }, [held, locale, persist]);

  const classifyAll = useCallback(async () => {
    setClassifyingAll(true);
    setError(null);
    for (const ticker of tickers) {
      setClassifyAllProgress(ticker);
      try {
        const heldCtx = held.has(ticker) ? 'Currently held position.' : 'On watchlist.';
        const res = await classifyAsset({ ticker, portfolio_context: heldCtx, language: locale });
        const current = loadProfiles();
        const merged: AssetProfile = { ...(current[ticker] || {}), ...res, ticker };
        persist({ ...current, [ticker]: merged });
        // Re-read after each to keep state fresh
        setProfiles(loadProfiles());
      } catch {
        /* skip failed tickers */
      }
    }
    setClassifyingAll(false);
    setClassifyAllProgress(null);
    setProfiles(loadProfiles());
  }, [tickers, held, locale, persist]);

  // Group tickers by theme for the "map" view
  const themeGroups = useMemo(() => {
    const groups = new Map<string, string[]>();
    const unthemed: string[] = [];
    for (const ticker of tickers) {
      const theme = profiles[ticker]?.theme?.trim();
      if (theme) {
        if (!groups.has(theme)) groups.set(theme, []);
        groups.get(theme)!.push(ticker);
      } else {
        unthemed.push(ticker);
      }
    }
    const result: Array<{ theme: string; tickers: string[] }> = [];
    for (const [theme, ts] of groups.entries()) result.push({ theme, tickers: ts });
    result.sort((a, b) => b.tickers.length - a.tickers.length);
    if (unthemed.length) result.push({ theme: '', tickers: unthemed });
    return result;
  }, [tickers, profiles]);

  const hasAnyTheme = themeGroups.some((g) => g.theme !== '');

  // ── Empty state ──────────────────────────────────────────────────────────────

  if (!tickers.length) {
    return (
      <div className={styles.page}>
        <PageHeader t={t} />
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>🗺</div>
          <h3 className={styles.emptyTitle}>Teach the app about your holdings.</h3>
          <p className={styles.emptyBody}>{t('asset.emptyBody')}</p>
          <QuickAddWatchlist
            t={t}
            onAdded={() => {
              // Re-derive tickers from storage after adding
              const watch = loadWatchlistTickers();
              const positions = loadPositions();
              const heldSet = new Set(positions.map((p) => p.ticker));
              setHeld(heldSet);
              const all = new Set<string>([...watch, ...positions.map((p) => p.ticker)]);
              setTickers([...all].sort());
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <PageHeader t={t} />

      {/* Explainer banner */}
      <div className={styles.explainer}>
        <p className={styles.explainerText}>{t('asset.explainer')}</p>
        <button
          className={styles.classifyAllBtn}
          onClick={classifyAll}
          disabled={classifyingAll}
        >
          {classifyingAll ? (
            <><span className={styles.spinner} /> {classifyAllProgress ? `${classifyAllProgress}…` : t('asset.classifyingAll')}</>
          ) : t('asset.classifyAll')}
        </button>
      </div>

      {error && (
        <div className={styles.errorBox}>
          <span>{error}</span>
          <button className={styles.smallBtn} onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {/* Theme-grouped cards */}
      {hasAnyTheme ? (
        themeGroups.map((group) => (
          <div key={group.theme || '__none__'} className={styles.themeGroup}>
            {group.theme ? (
              <div className={styles.themeLabel}>
                <span className={styles.themeDot} />
                {group.theme}
                <span className={styles.themeCount}>{group.tickers.length}</span>
              </div>
            ) : (
              <div className={styles.themeLabel}>
                <span className={styles.themeLabelMuted}>{t('asset.untagged')}</span>
              </div>
            )}
            <div className={styles.cardGrid}>
              {group.tickers.map((ticker) => (
                <AssetCard
                  key={ticker}
                  ticker={ticker}
                  profile={profiles[ticker]}
                  isHeld={held.has(ticker)}
                  isEditing={editing === ticker}
                  isClassifying={classifying.has(ticker) || (classifyingAll && classifyAllProgress === ticker)}
                  onEdit={() => setEditing(editing === ticker ? null : ticker)}
                  onClassify={() => classify(ticker)}
                  onField={updateField}
                  t={t}
                />
              ))}
            </div>
          </div>
        ))
      ) : (
        <div className={styles.cardGrid}>
          {tickers.map((ticker) => (
            <AssetCard
              key={ticker}
              ticker={ticker}
              profile={profiles[ticker]}
              isHeld={held.has(ticker)}
              isEditing={editing === ticker}
              isClassifying={classifying.has(ticker) || (classifyingAll && classifyAllProgress === ticker)}
              onEdit={() => setEditing(editing === ticker ? null : ticker)}
              onClassify={() => classify(ticker)}
              onField={updateField}
              t={t}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PageHeader({ t }: { t: T }) {
  return (
    <div className={styles.pageHeader}>
      <div>
        <h1 className={styles.pageTitle}>{t('asset.title')}</h1>
        <p className={styles.pageSubtitle}>{t('asset.subtitle')}</p>
      </div>
    </div>
  );
}

// ─── Asset Card ───────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<StatusKind, { dot: string; label: string; badge: string }> = {
  valid:   { dot: styles.dotValid,    label: '',             badge: styles.badgeValid },
  drifting:{ dot: styles.dotDrifting, label: '',             badge: styles.badgeDrifting },
  broken:  { dot: styles.dotBroken,   label: '',             badge: styles.badgeBroken },
  unknown: { dot: '',                 label: '',             badge: styles.badgeUnknown },
};

function AssetCard({
  ticker, profile, isHeld, isEditing, isClassifying, onEdit, onClassify, onField, t,
}: {
  ticker: string; profile?: AssetProfile; isHeld: boolean;
  isEditing: boolean; isClassifying: boolean;
  onEdit: () => void; onClassify: () => void;
  onField: (ticker: string, field: keyof AssetProfile, value: string) => void;
  t: T;
}) {
  const kind = statusKind(profile?.thesis_status);
  const st = STATUS_STYLES[kind];
  const statusLabel = kind === 'valid' ? t('asset.status.valid')
    : kind === 'drifting' ? t('asset.status.drifting')
    : kind === 'broken' ? t('asset.status.broken')
    : profile?.thesis_status || null;

  const hasProfile = !!(profile?.role || profile?.theme || profile?.risk || profile?.thesis);

  return (
    <div className={`${styles.card} ${isEditing ? styles.cardEditing : ''}`}>
      {/* Card header */}
      <div className={styles.cardHeader}>
        <div className={styles.cardHeaderLeft}>
          <span className={styles.cardTicker}>{ticker}</span>
          <span className={`${styles.holdBadge} ${isHeld ? styles.holdBadgeHeld : styles.holdBadgeWatch}`}>
            {isHeld ? t('asset.held') : t('asset.watching')}
          </span>
        </div>
        {statusLabel && (
          <span className={`${styles.statusBadge} ${st.badge}`}>
            {st.dot && <span className={`${styles.statusDot} ${st.dot}`} />}
            {statusLabel}
          </span>
        )}
      </div>

      {isEditing ? (
        /* ── Edit mode ── */
        <div className={styles.editBody}>
          <div className={styles.editGrid}>
            <EditField label={t('asset.role')} value={profile?.role || ''} onChange={(v) => onField(ticker, 'role', v)} placeholder="e.g. Core Growth" />
            <EditField label={t('asset.theme')} value={profile?.theme || ''} onChange={(v) => onField(ticker, 'theme', v)} placeholder="e.g. AI / Semis" />
            <EditField label={t('asset.risk')} value={profile?.risk || ''} onChange={(v) => onField(ticker, 'risk', v)} placeholder="e.g. High" />
            <EditField label={t('asset.reviewFrequency')} value={profile?.review_frequency || ''} onChange={(v) => onField(ticker, 'review_frequency', v)} placeholder="e.g. Weekly" />
            <EditField label={t('asset.thesisStatus')} value={profile?.thesis_status || ''} onChange={(v) => onField(ticker, 'thesis_status', v)} placeholder="Valid / Drifting / Broken" />
          </div>
          <div className={styles.editFieldFull}>
            <label className={styles.editLabel}>{t('asset.thesis')}</label>
            <textarea className={styles.textarea} rows={3}
              value={profile?.thesis || ''}
              placeholder={t('asset.thesisPlaceholder')}
              onChange={(e) => onField(ticker, 'thesis', e.target.value)} />
          </div>
        </div>
      ) : (
        /* ── View mode ── */
        <div className={styles.viewBody}>
          {/* Chips row */}
          {hasProfile ? (
            <div className={styles.chipRow}>
              {profile?.role && <span className={styles.metaChip}><span className={styles.chipKey}>{t('asset.role')}</span>{profile.role}</span>}
              {profile?.theme && <span className={styles.metaChip}><span className={styles.chipKey}>{t('asset.theme')}</span>{profile.theme}</span>}
              {profile?.risk && <span className={styles.metaChip}><span className={styles.chipKey}>{t('asset.risk')}</span>{profile.risk}</span>}
              {profile?.review_frequency && <span className={styles.metaChip}><span className={styles.chipKey}>{t('asset.reviewFrequency')}</span>{profile.review_frequency}</span>}
            </div>
          ) : (
            <div className={styles.untaggedNote}>{t('asset.untaggedNote')}</div>
          )}
          {/* Thesis */}
          {profile?.thesis && (
            <blockquote className={styles.thesisBlock}>{profile.thesis}</blockquote>
          )}
        </div>
      )}

      {/* Card actions */}
      <div className={styles.cardActions}>
        <button className={styles.classifyBtn} onClick={onClassify} disabled={isClassifying}>
          {isClassifying
            ? <><span className={styles.spinner} /> {t('asset.classifying')}</>
            : t('asset.classify')}
        </button>
        <button className={`${styles.editBtn} ${isEditing ? styles.editBtnActive : ''}`} onClick={onEdit}>
          {isEditing ? t('asset.done') : t('asset.edit')}
        </button>
      </div>
    </div>
  );
}

function EditField({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div className={styles.editField}>
      <label className={styles.editLabel}>{label}</label>
      <input className={styles.editInput} value={value} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
