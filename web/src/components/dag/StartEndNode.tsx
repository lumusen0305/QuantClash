import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import styles from './StartEndNode.module.css';

export const StartNode = memo(function StartNode(_props: NodeProps) {
  return (
    <div className={`${styles.node} ${styles.start}`}>
      <div className={styles.label}>START</div>
      <Handle type="source" position={Position.Bottom} className={styles.handle} />
    </div>
  );
});

export const EndNode = memo(function EndNode(_props: NodeProps) {
  return (
    <div className={`${styles.node} ${styles.end}`}>
      <Handle type="target" position={Position.Top} className={styles.handle} />
      <div className={styles.label}>END</div>
    </div>
  );
});
