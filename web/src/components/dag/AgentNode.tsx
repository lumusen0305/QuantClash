import { memo, useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import styles from './AgentNode.module.css';

const CATEGORY_COLORS: Record<string, string> = {
  analysts: 'var(--node-analyst)',
  debaters: 'var(--node-debater)',
  managers: 'var(--node-manager)',
};

export type NodeStatus = 'idle' | 'running' | 'done' | 'error';

export interface AgentNodeData {
  label: string;
  nodeType: string;
  category: string;
  description: string;
  config: Record<string, unknown>;
  // Runtime — injected during analysis
  nodeStatus?: NodeStatus;
  nodeOutput?: string;
  [key: string]: unknown;
}

export const AgentNode = memo(function AgentNode({ data, selected }: NodeProps) {
  const d = data as AgentNodeData;
  const color = CATEGORY_COLORS[d.category] || 'var(--accent)';
  const status = d.nodeStatus ?? 'idle';

  const [hovered, setHovered] = useState(false);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);
  const nodeRef = useRef<HTMLDivElement>(null);
  const hasOutput = !!d.nodeOutput;

  // Compute popover position in viewport coords. The popover is portaled to
  // <body> so `position: fixed` is relative to the viewport (a node sits inside
  // React Flow's transformed canvas, which would otherwise break fixed coords).
  useEffect(() => {
    if (!hovered || !nodeRef.current) { setPopoverPos(null); return; }
    const POP_W = 280;
    const POP_H = 300;
    const GAP = 10;
    const place = () => {
      if (!nodeRef.current) return;
      const rect = nodeRef.current.getBoundingClientRect();
      // Prefer right of node; flip left if it would overflow the viewport
      let left = rect.right + GAP;
      if (left + POP_W > window.innerWidth - 8) left = rect.left - POP_W - GAP;
      if (left < 8) left = 8;
      // Align top with node, clamp so it stays fully on screen
      let top = rect.top;
      if (top + POP_H > window.innerHeight - 8) top = window.innerHeight - POP_H - 8;
      if (top < 8) top = 8;
      setPopoverPos({ top, left });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [hovered]);

  // Border color by status
  let statusBorderColor = color;
  let statusGlow = '';
  if (status === 'running') {
    statusBorderColor = 'var(--orange)';
    statusGlow = styles.nodeRunning;
  } else if (status === 'done') {
    statusBorderColor = 'var(--green)';
    statusGlow = styles.nodeDone;
  } else if (status === 'error') {
    statusBorderColor = 'var(--red)';
  }

  return (
    <div
      ref={nodeRef}
      className={`${styles.node} ${selected ? styles.selected : ''} ${statusGlow}`}
      style={{ borderTopColor: statusBorderColor }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Handle type="target" position={Position.Top} className={styles.handle} />

      {/* Status indicator dot */}
      {status !== 'idle' && (
        <span
          className={`${styles.statusDot} ${
            status === 'running' ? styles.statusDotRunning :
            status === 'done'    ? styles.statusDotDone    : styles.statusDotError
          }`}
          aria-label={status}
        />
      )}

      <div className={styles.header} style={{ color: statusBorderColor }}>
        {d.category?.charAt(0).toUpperCase() + d.category?.slice(1)}
      </div>
      <div className={styles.label}>{d.label}</div>
      <div className={styles.desc}>{d.description}</div>

      {/* Done checkmark badge */}
      {status === 'done' && (
        <div className={styles.doneBadge} aria-label="done">✓</div>
      )}

      <Handle type="source" position={Position.Bottom} className={styles.handle} />

      {/* Hover popover — portaled to <body> so position:fixed is viewport-relative
          (a node lives inside React Flow's transformed canvas, which would
          otherwise become the containing block and offset the popover). */}
      {hovered && popoverPos && (status === 'running' || status === 'done') && createPortal(
        <div
          className={styles.popover}
          style={{ top: popoverPos.top, left: popoverPos.left }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          <div className={styles.popoverHeader}>
            <span className={styles.popoverName}>{d.label}</span>
            <span
              className={`${styles.popoverBadge} ${
                status === 'running' ? styles.popoverBadgeRunning : styles.popoverBadgeDone
              }`}
            >
              {status === 'running' ? '⚡ Analyzing…' : '✓ Done'}
            </span>
          </div>
          <div className={styles.popoverBody}>
            {hasOutput
              ? <PopoverMarkdown text={d.nodeOutput!} />
              : <span className={styles.popoverEmpty}>
                  {status === 'running' ? '分析中… / Analyzing…' : 'No output'}
                </span>
            }
          </div>
        </div>,
        document.body
      )}
    </div>
  );
});

// Lightweight markdown for popover — bold/italic/headings/bullets only
function PopoverMarkdown({ text }: { text: string }) {
  const lines = text.split('\n').slice(0, 40); // cap lines for perf
  const out: React.ReactNode[] = [];
  let key = 0;
  for (const line of lines) {
    const hm = line.match(/^#{1,3}\s+(.*)/);
    if (hm) { out.push(<strong key={key++} style={{ display: 'block', marginTop: 6, fontSize: 11 }}>{hm[1]}</strong>); continue; }
    const bm = line.match(/^[-*]\s+(.*)/);
    if (bm) { out.push(<div key={key++} style={{ paddingLeft: 10, fontSize: 11 }}>• {inlineMd(bm[1])}</div>); continue; }
    if (!line.trim()) { out.push(<span key={key++} style={{ display: 'block', height: 4 }} />); continue; }
    out.push(<div key={key++} style={{ fontSize: 11, lineHeight: 1.5 }}>{inlineMd(line)}</div>);
  }
  return <>{out}</>;
}

function inlineMd(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0; let i = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push(<span key={i++}>{text.slice(last, m.index)}</span>);
    const tok = m[0];
    if (tok.startsWith('**')) parts.push(<strong key={i++}>{tok.slice(2, -2)}</strong>);
    else parts.push(<em key={i++}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) parts.push(<span key={i++}>{text.slice(last)}</span>);
  return <>{parts}</>;
}
