import { useState, useCallback } from 'react';
import { addToWatchlist } from '../lib/workspace';
import styles from './QuickAddWatchlist.module.css';

interface Props {
  t: (key: string) => string;
  onAdded?: (ticker: string) => void;
}

export function QuickAddWatchlist({ t, onAdded }: Props) {
  const [val, setVal] = useState('');
  const [flash, setFlash] = useState(false);

  const submit = useCallback(() => {
    const tk = val.trim().toUpperCase();
    if (!tk) return;
    addToWatchlist(tk);
    onAdded?.(tk);
    setVal('');
    setFlash(true);
    setTimeout(() => setFlash(false), 1800);
  }, [val, onAdded]);

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') submit();
  };

  return (
    <div className={styles.wrap}>
      <p className={styles.title}>{t('watchlist.quickAddTitle')}</p>
      <div className={styles.row}>
        <input
          className={styles.input}
          type="text"
          placeholder={t('watchlist.quickAddPlaceholder')}
          value={val}
          onChange={(e) => setVal(e.target.value.toUpperCase())}
          onKeyDown={onKey}
          maxLength={10}
          aria-label={t('watchlist.quickAdd')}
        />
        <button
          className={`${styles.btn} ${flash ? styles.btnFlash : ''}`}
          onClick={submit}
          disabled={!val.trim()}
        >
          {flash ? t('watchlist.added') : t('watchlist.quickAdd')}
        </button>
      </div>
      <p className={styles.hint}>{t('watchlist.quickAddHint')}</p>
    </div>
  );
}
