import { useState } from 'react';
import { Save, FolderOpen, Plus, Play } from 'lucide-react';
import { useI18n } from '../../i18n/context';
import styles from './Header.module.css';

interface HeaderProps {
  strategyName: string;
  onSave: () => void;
  onLoad: () => void;
  onNew: () => void;
  onRun?: (ticker: string) => void;
  saving?: boolean;
  running?: boolean;
  /** Controlled ticker value (e.g. synced when navigating from Portfolio/Chart). */
  ticker?: string;
  onTickerChange?: (ticker: string) => void;
  /** Risk style for ATR-based stop/target/position sizing. */
  riskStyle?: 'conservative' | 'balanced' | 'aggressive';
  onRiskStyleChange?: (s: 'conservative' | 'balanced' | 'aggressive') => void;
}

export function Header({ strategyName, onSave, onLoad, onNew, onRun, saving, running, ticker: tickerProp, onTickerChange, riskStyle, onRiskStyleChange }: HeaderProps) {
  const { t } = useI18n();
  const [tickerInner, setTickerInner] = useState('AAPL');
  // Controlled when a value is supplied by the parent, otherwise local state.
  const ticker = tickerProp !== undefined ? tickerProp : tickerInner;
  const setTicker = (v: string) => {
    if (onTickerChange) onTickerChange(v);
    else setTickerInner(v);
  };

  const handleRun = () => {
    if (onRun && ticker.trim()) {
      onRun(ticker.trim().toUpperCase());
    }
  };

  return (
    <header className={styles.header}>
      <div className={styles.left}>
        <span className={styles.strategyName}>{strategyName || t('dag.untitled')}</span>
      </div>
      <div className={styles.right}>
        <div className={styles.runGroup}>
          {onRiskStyleChange && (
            <select
              className={styles.tickerInput}
              value={riskStyle ?? 'balanced'}
              onChange={(e) => onRiskStyleChange(e.target.value as 'conservative' | 'balanced' | 'aggressive')}
              title={t('dag.riskStyle')}
              style={{ width: 'auto', cursor: 'pointer' }}
            >
              <option value="conservative">{t('dag.riskConservative')}</option>
              <option value="balanced">{t('dag.riskBalanced')}</option>
              <option value="aggressive">{t('dag.riskAggressive')}</option>
            </select>
          )}
          <input
            className={styles.tickerInput}
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            placeholder={t('dag.ticker')}
            onKeyDown={(e) => e.key === 'Enter' && handleRun()}
          />
          <button
            className={`${styles.btn} ${styles.btnRun}`}
            onClick={handleRun}
            disabled={running || !ticker.trim()}
            title={t('tip.runAnalysis')}
          >
            <Play size={14} />
            <span>{running ? t('dag.running') : t('dag.run')}</span>
          </button>
        </div>
        <span className={styles.divider} />
        <button className={styles.btn} onClick={onNew} title={t('tip.newStrategy')}>
          <Plus size={16} />
          <span>{t('dag.new')}</span>
        </button>
        <button className={styles.btn} onClick={onLoad} title={t('dag.load')}>
          <FolderOpen size={16} />
          <span>{t('dag.load')}</span>
        </button>
        <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={onSave} disabled={saving} title={t('dag.save')}>
          <Save size={16} />
          <span>{saving ? t('dag.saving') : t('dag.save')}</span>
        </button>
      </div>
    </header>
  );
}
