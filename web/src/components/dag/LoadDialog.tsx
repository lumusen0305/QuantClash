import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { fetchMyStrategies, type StrategyResponse } from '../../api/client';
import { useI18n } from '../../i18n/context';
import styles from './LoadDialog.module.css';

interface LoadDialogProps {
  onSelect: (strategy: StrategyResponse) => void;
  onClose: () => void;
}

export function LoadDialog({ onSelect, onClose }: LoadDialogProps) {
  const { t } = useI18n();
  const [strategies, setStrategies] = useState<StrategyResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchMyStrategies()
      .then(setStrategies)
      .catch(() => setError(t('dag.loadFailed')))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <span>{t('dag.loadTitle')}</span>
          <button className={styles.closeBtn} aria-label={t('common.close')} onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className={styles.body}>
          {loading && <div className={styles.empty}>{t('common.loading')}</div>}
          {error && <div className={styles.empty}>{error}</div>}
          {!loading && !error && strategies.length === 0 && (
            <div className={styles.empty}>{t('dag.noStrategies')}</div>
          )}
          {strategies.map((s) => (
            <button key={s.id} className={styles.item} onClick={() => onSelect(s)}>
              <div className={styles.itemName}>{s.name}</div>
              <div className={styles.itemMeta}>
                {s.dag_config.nodes?.length || 0} {t('dag.nodesCount')} &middot; {new Date(s.created_at).toLocaleDateString()}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
