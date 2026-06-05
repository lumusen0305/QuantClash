import type { DragEvent } from 'react';
import type { NodeInfo } from '../../api/client';
import { BarChart3, MessageSquare, Briefcase } from 'lucide-react';
import { useI18n } from '../../i18n/context';
import styles from './NodePalette.module.css';

interface NodePaletteProps {
  nodes: Record<string, NodeInfo>;
}

const CATEGORY_META: Record<string, { i18nKey: string; icon: typeof BarChart3; color: string }> = {
  analysts: { i18nKey: 'dag.analysts', icon: BarChart3, color: 'var(--node-analyst)' },
  debaters: { i18nKey: 'dag.debaters', icon: MessageSquare, color: 'var(--node-debater)' },
  managers: { i18nKey: 'dag.managers', icon: Briefcase, color: 'var(--node-manager)' },
};

export function NodePalette({ nodes }: NodePaletteProps) {
  const { t } = useI18n();
  const grouped: Record<string, Array<[string, NodeInfo]>> = {};
  for (const [type, info] of Object.entries(nodes)) {
    const cat = info.category;
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push([type, info]);
  }

  const onDragStart = (e: DragEvent, nodeType: string) => {
    e.dataTransfer.setData('application/quantclash-node', nodeType);
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <aside className={styles.palette}>
      <div className={styles.title}>{t('dag.agentNodes')}</div>
      {Object.entries(CATEGORY_META).map(([cat, meta]) => {
        const items = grouped[cat];
        if (!items) return null;
        const Icon = meta.icon;
        return (
          <div key={cat} className={styles.category}>
            <div className={styles.categoryHeader} style={{ color: meta.color }}>
              <Icon size={14} />
              <span>{t(meta.i18nKey)}</span>
            </div>
            {items.map(([type, info]) => (
              <div
                key={type}
                className={styles.nodeItem}
                draggable
                onDragStart={(e) => onDragStart(e, type)}
                style={{ borderLeftColor: meta.color }}
              >
                <div className={styles.nodeName}>{info.name}</div>
                <div className={styles.nodeDesc}>{info.description}</div>
              </div>
            ))}
          </div>
        );
      })}
    </aside>
  );
}
