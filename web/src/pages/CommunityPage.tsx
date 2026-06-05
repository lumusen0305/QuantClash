import { useEffect, useState } from 'react';
import { GitFork, Clock } from 'lucide-react';
import { fetchPublicStrategies, forkStrategy, type StrategyResponse } from '../api/client';
import { useI18n } from '../i18n/context';
import styles from './CommunityPage.module.css';

interface CommunityPageProps {
  onOpenStrategy: (strategy: StrategyResponse) => void;
}

export function CommunityPage({ onOpenStrategy }: CommunityPageProps) {
  const { t } = useI18n();
  const [strategies, setStrategies] = useState<StrategyResponse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPublicStrategies()
      .then(setStrategies)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleFork = async (e: React.MouseEvent, strategy: StrategyResponse) => {
    e.stopPropagation();
    try {
      const forked = await forkStrategy(strategy.id);
      onOpenStrategy(forked);
    } catch {
      alert(t('community.forkFail'));
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>{t('community.title')}</h1>
        <p className={styles.subtitle}>{t('community.subtitle')}</p>
      </div>

      {loading && <div className={styles.empty}>{t('community.loading')}</div>}

      {!loading && strategies.length === 0 && (
        <div className={styles.empty}>{t('community.empty')}</div>
      )}

      <div className={styles.grid}>
        {strategies.map((s) => (
          <button
            key={s.id}
            className={styles.card}
            onClick={() => onOpenStrategy(s)}
          >
            <div className={styles.cardHeader}>
              <span className={styles.cardName}>{s.name}</span>
              <span className={styles.cardMeta}>
                {s.dag_config.nodes?.length || 0} {t('community.nodes')}
              </span>
            </div>
            {s.description && (
              <p className={styles.cardDesc}>{s.description}</p>
            )}
            <div className={styles.cardFooter}>
              <span className={styles.cardStat}>
                <GitFork size={12} />
                {s.fork_count}
              </span>
              <span className={styles.cardStat}>
                <Clock size={12} />
                {new Date(s.created_at).toLocaleDateString()}
              </span>
              <button
                className={styles.forkBtn}
                onClick={(e) => handleFork(e, s)}
              >
                <GitFork size={12} />
                {t('community.fork')}
              </button>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
