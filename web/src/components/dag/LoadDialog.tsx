import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { fetchMyStrategies, type StrategyResponse } from '../../api/client';
import styles from './LoadDialog.module.css';

interface LoadDialogProps {
  onSelect: (strategy: StrategyResponse) => void;
  onClose: () => void;
}

export function LoadDialog({ onSelect, onClose }: LoadDialogProps) {
  const [strategies, setStrategies] = useState<StrategyResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchMyStrategies()
      .then(setStrategies)
      .catch(() => setError('Failed to load strategies. Is the backend running?'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <span>Load Strategy</span>
          <button className={styles.closeBtn} onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className={styles.body}>
          {loading && <div className={styles.empty}>Loading...</div>}
          {error && <div className={styles.empty}>{error}</div>}
          {!loading && !error && strategies.length === 0 && (
            <div className={styles.empty}>No saved strategies yet.</div>
          )}
          {strategies.map((s) => (
            <button key={s.id} className={styles.item} onClick={() => onSelect(s)}>
              <div className={styles.itemName}>{s.name}</div>
              <div className={styles.itemMeta}>
                {s.dag_config.nodes?.length || 0} nodes &middot; {new Date(s.created_at).toLocaleDateString()}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
