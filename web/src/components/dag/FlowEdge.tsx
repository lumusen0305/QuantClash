/**
 * FlowEdge — custom React Flow edge with:
 *   1. Animated flowing dot while source node is running/done
 *   2. Hover to reveal upstream (source) node analysis in a popover
 *
 * Architecture: source node's label/status/output are passed via edge `data`
 * (a `nodeOutputById` lookup populated in DagEditor from memoised nodes state).
 */
import { memo, useState, useId } from 'react';
import {
  getBezierPath,
  BaseEdge,
  EdgeLabelRenderer,
  type EdgeProps,
} from '@xyflow/react';
import { createPortal } from 'react-dom';
import nodeStyles from './AgentNode.module.css';

// ─── Types passed via edge.data ───────────────────────────────────────────────

export interface NodeInfo {
  label: string;
  status: 'idle' | 'running' | 'done' | 'error';
  output?: string;
}

export interface FlowEdgeData {
  /** Lookup from node-id → runtime info; provided by DagEditor */
  nodeOutputById: Record<string, NodeInfo>;
}

// ─── Inline markdown for the popover ─────────────────────────────────────────

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

function EdgePopoverMarkdown({ text }: { text: string }) {
  const lines = text.split('\n').slice(0, 40);
  const out: React.ReactNode[] = [];
  let key = 0;
  for (const line of lines) {
    const hm = line.match(/^#{1,3}\s+(.*)/);
    if (hm) {
      out.push(
        <strong key={key++} style={{ display: 'block', marginTop: 6, fontSize: 11, color: 'var(--text-primary)' }}>
          {hm[1]}
        </strong>
      );
      continue;
    }
    const bm = line.match(/^[-*]\s+(.*)/);
    if (bm) {
      out.push(
        <div key={key++} style={{ paddingLeft: 10, fontSize: 11 }}>
          • {inlineMd(bm[1])}
        </div>
      );
      continue;
    }
    if (!line.trim()) {
      out.push(<span key={key++} style={{ display: 'block', height: 4 }} />);
      continue;
    }
    out.push(
      <div key={key++} style={{ fontSize: 11, lineHeight: 1.5 }}>
        {inlineMd(line)}
      </div>
    );
  }
  return <>{out}</>;
}

// ─── Main edge component ──────────────────────────────────────────────────────

export const FlowEdge = memo(function FlowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  source,
  data,
  markerEnd,
}: EdgeProps) {
  const animId = useId().replace(/:/g, '');
  const [hovered, setHovered] = useState(false);

  // Read source node info from the lookup map in edge data
  const edgeData = data as FlowEdgeData | undefined;
  const sourceInfo: NodeInfo | undefined = edgeData?.nodeOutputById?.[source];
  const sourceStatus = sourceInfo?.status ?? 'idle';
  const sourceLabel  = sourceInfo?.label ?? source;
  const sourceOutput = sourceInfo?.output;

  const isActive  = sourceStatus === 'running';
  const isDone    = sourceStatus === 'done';
  const hasSignal = isActive || isDone;

  // Pick edge stroke colour by source status
  const strokeColor =
    isActive ? 'var(--orange)' :
    isDone   ? 'var(--green)'  :
    'var(--text-muted)';

  const strokeWidth = hasSignal ? 1.5 : 1;
  const strokeOpacity = hasSignal ? 0.9 : 0.5;

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
  });

  // Unique SVG element IDs (useId gives stable React-scoped ids)
  const pathId   = `ep-${animId}`;
  const dotId    = `dot-${animId}`;

  return (
    <>
      {/* ── Base visible edge path ── */}
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: strokeColor,
          strokeWidth,
          strokeOpacity,
          transition: 'stroke 0.4s ease, stroke-opacity 0.4s ease',
        }}
      />

      {/* ── Invisible wider hit-area for easy hovering ── */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        style={{ pointerEvents: 'stroke', cursor: 'default' }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      />

      {/* ── Animated flowing dot along edge while running / done ── */}
      {hasSignal && (
        <svg overflow="visible" style={{ position: 'absolute', pointerEvents: 'none' }}>
          <defs>
            <path id={pathId} d={edgePath} />
          </defs>
          <circle r={3.5} fill={isActive ? 'var(--orange)' : 'var(--green)'} id={dotId}>
            <animateMotion
              dur={isActive ? '1.6s' : '3.2s'}
              repeatCount="indefinite"
              calcMode="linear"
            >
              <mpath href={`#${pathId}`} />
            </animateMotion>
            {isActive && (
              <animate
                attributeName="opacity"
                values="1;0.4;1"
                dur="1.6s"
                repeatCount="indefinite"
                calcMode="linear"
              />
            )}
          </circle>
        </svg>
      )}

      {/* ── Edge-label popover (EdgeLabelRenderer escapes SVG into DOM) ── */}
      <EdgeLabelRenderer>
        {/* Invisible hover capture zone at the label midpoint */}
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            width: 32,
            height: 32,
            borderRadius: '50%',
            pointerEvents: 'all',
            zIndex: 10,
          }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        />
      </EdgeLabelRenderer>

      {/* ── Portaled popover — same style as AgentNode popovers ── */}
      {hovered && hasSignal && createPortal(
        <EdgePopover
          label={sourceLabel}
          status={sourceStatus}
          output={sourceOutput}
          anchorX={labelX}
          anchorY={labelY}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        />,
        document.body
      )}
    </>
  );
});

// ─── Popover component ────────────────────────────────────────────────────────

function EdgePopover({
  label,
  status,
  output,
  anchorX,
  anchorY,
  onMouseEnter,
  onMouseLeave,
}: {
  label: string;
  status: 'idle' | 'running' | 'done' | 'error';
  output?: string;
  anchorX: number;
  anchorY: number;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const POP_W = 260;
  const POP_H = 300;
  const GAP   = 14;

  // anchorX/Y are React Flow *viewport* coords (already px from ReactFlow container).
  // We need screen coords. Since EdgeLabelRenderer renders inside the RF viewport
  // div which is full-screen (or full-container), we can use the RF container's
  // bounding rect. However, the simplest stable approach: position relative to
  // the viewport origin — RF's EdgeLabelRenderer uses transform on its own wrapper
  // so anchorX/Y are already in the element's local coordinate space which happens
  // to match the viewport when `transform: translate(...)` is the only transform.
  // For safety clamp to screen bounds.
  let left = anchorX + GAP;
  let top  = anchorY - POP_H / 2;
  if (left + POP_W > window.innerWidth - 8) left = anchorX - POP_W - GAP;
  if (left < 8) left = 8;
  if (top + POP_H > window.innerHeight - 8) top = window.innerHeight - POP_H - 8;
  if (top < 8) top = 8;

  const isRunning = status === 'running';

  return (
    <div
      className={nodeStyles.popover}
      style={{ top, left }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className={nodeStyles.popoverHeader}>
        <span className={nodeStyles.popoverName}>{label}</span>
        <span className={`${nodeStyles.popoverBadge} ${isRunning ? nodeStyles.popoverBadgeRunning : nodeStyles.popoverBadgeDone}`}>
          {isRunning ? '⚡ Analyzing…' : '✓ Done'}
        </span>
      </div>
      <div className={nodeStyles.popoverBody}>
        {output
          ? <EdgePopoverMarkdown text={output} />
          : <span className={nodeStyles.popoverEmpty}>
              {isRunning ? '分析中… / Analyzing…' : 'No output yet'}
            </span>
        }
      </div>
    </div>
  );
}
