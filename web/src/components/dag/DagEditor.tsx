import React, { useCallback, useEffect, useState, useRef, useMemo, type DragEvent } from 'react';
import {
  ReactFlow,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  BackgroundVariant,
  useReactFlow,
  useNodesInitialized,
  type Connection,
  type Node,
  type Edge,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import type { NodeInfo } from '../../api/client';
import { fetchQuote as apiFetchQuote, emailReport, fetchReportEmailStatus } from '../../api/client';
import { useI18n } from '../../i18n/context';
import { AgentNode, type AgentNodeData } from './AgentNode';
import { StartNode, EndNode } from './StartEndNode';
import { NodePalette } from './NodePalette';
import { NodeConfigPanel } from './NodeConfigPanel';
import { LoadDialog } from './LoadDialog';
import { Header } from '../layout/Header';
import type { StrategyResponse } from '../../api/client';
import { ResultChart } from './ResultChart';
import { FlowEdge } from './FlowEdge';
import type { FlowEdgeData } from './FlowEdge';
import { appendJournal, uid, type JournalEntry } from '../../lib/workspace';
import styles from './DagEditor.module.css';

const nodeTypes = {
  agent: AgentNode,
  start: StartNode,
  end: EndNode,
};

const edgeTypes = {
  flow: FlowEdge,
};

const BASE_NODES: Node[] = [
  { id: 'START', type: 'start', position: { x: 400, y: 50 }, deletable: false, data: {} },
  { id: 'END', type: 'end', position: { x: 400, y: 900 }, deletable: false, data: {} },
];

function buildDefaultPipeline(registry: Record<string, NodeInfo>): { nodes: Node[]; edges: Edge[] } {
  const makeAgent = (id: string, nodeType: string, x: number, y: number): Node => {
    const info = registry[nodeType];
    return {
      id,
      type: 'agent',
      position: { x, y },
      data: {
        label: info?.name || nodeType,
        nodeType,
        category: info?.category || 'analysts',
        description: info?.description || '',
        config: info ? Object.fromEntries(Object.entries(info.config_schema).map(([k, v]) => [k, v.default])) : {},
      } satisfies AgentNodeData,
    };
  };

  const nodes: Node[] = [
    { id: 'START', type: 'start', position: { x: 350, y: 0 }, deletable: false, data: {} },
    makeAgent('market_analyst_1', 'market_analyst', 50, 120),
    makeAgent('sentiment_analyst_1', 'sentiment_analyst', 250, 120),
    makeAgent('news_analyst_1', 'news_analyst', 450, 120),
    makeAgent('fundamentals_analyst_1', 'fundamentals_analyst', 650, 120),
    makeAgent('macro_analyst_1', 'macro_analyst', 850, 120),
    makeAgent('market_research_1', 'market_research_analyst', 1050, 120),
    makeAgent('bull_researcher_1', 'bull_researcher', 200, 280),
    makeAgent('bear_researcher_1', 'bear_researcher', 500, 280),
    makeAgent('research_manager_1', 'research_manager', 350, 400),
    makeAgent('trader_1', 'trader', 350, 510),
    makeAgent('aggressive_risk_1', 'aggressive_risk', 100, 630),
    makeAgent('conservative_risk_1', 'conservative_risk', 350, 630),
    makeAgent('neutral_risk_1', 'neutral_risk', 600, 630),
    makeAgent('portfolio_manager_1', 'portfolio_manager', 350, 770),
    { id: 'END', type: 'end', position: { x: 350, y: 900 }, deletable: false, data: {} },
  ];

  const e = (from: string, to: string, i: number): Edge => ({
    id: `e-default-${i}`,
    type: 'flow',
    source: from,
    target: to,
    animated: false,
  });

  const edges: Edge[] = [
    e('START', 'market_analyst_1', 0),
    e('START', 'sentiment_analyst_1', 1),
    e('START', 'news_analyst_1', 2),
    e('START', 'fundamentals_analyst_1', 3),
    e('START', 'macro_analyst_1', 4),
    e('START', 'market_research_1', 25),
    e('market_research_1', 'bull_researcher_1', 26),
    e('market_research_1', 'bear_researcher_1', 27),
    e('market_analyst_1', 'bull_researcher_1', 5),
    e('sentiment_analyst_1', 'bull_researcher_1', 6),
    e('news_analyst_1', 'bull_researcher_1', 7),
    e('fundamentals_analyst_1', 'bull_researcher_1', 8),
    e('macro_analyst_1', 'bull_researcher_1', 9),
    e('market_analyst_1', 'bear_researcher_1', 10),
    e('sentiment_analyst_1', 'bear_researcher_1', 11),
    e('news_analyst_1', 'bear_researcher_1', 12),
    e('fundamentals_analyst_1', 'bear_researcher_1', 13),
    e('macro_analyst_1', 'bear_researcher_1', 14),
    e('bull_researcher_1', 'research_manager_1', 15),
    e('bear_researcher_1', 'research_manager_1', 16),
    e('research_manager_1', 'trader_1', 17),
    e('trader_1', 'aggressive_risk_1', 18),
    e('trader_1', 'conservative_risk_1', 19),
    e('trader_1', 'neutral_risk_1', 20),
    e('aggressive_risk_1', 'portfolio_manager_1', 21),
    e('conservative_risk_1', 'portfolio_manager_1', 22),
    e('neutral_risk_1', 'portfolio_manager_1', 23),
    e('portfolio_manager_1', 'END', 24),
  ];

  return { nodes, edges };
}

interface DagEditorProps {
  nodeRegistry: Record<string, NodeInfo>;
  onSave: (data: { name: string; description: string; nodes: { id: string; type: string; config: Record<string, unknown> }[]; edges: { from: string; to: string }[] }) => Promise<void>;
  initialTicker?: string | null;
  model?: string;
  onTickerConsumed?: () => void;
}

let nodeIdCounter = 0;
function getNodeId() {
  return `node_${++nodeIdCounter}_${Date.now()}`;
}

// Ordered result sections for logical flow
const RESULT_ORDER = [
  'market_report',
  'sentiment_report',
  'news_report',
  'fundamentals_report',
  'macro_report',
  'bull_arguments',
  'bear_arguments',
  'research_verdict',
  'trader_plan',
  'risk_debate',
  'risk_verdict',
  'final_decision',
];

// Human-friendly section labels mapped to translation keys
const SECTION_LABEL_KEYS: Record<string, string> = {
  market_report: 'node.market_analyst',
  sentiment_report: 'node.sentiment_analyst',
  news_report: 'node.news_analyst',
  fundamentals_report: 'node.fundamentals_analyst',
  macro_report: 'node.macro_analyst',
  bull_arguments: 'node.bull_researcher',
  bear_arguments: 'node.bear_researcher',
  research_verdict: 'node.research_manager',
  trader_plan: 'node.trader',
  risk_debate: 'result.riskDebate',
  risk_verdict: 'result.riskVerdict',
  final_decision: 'result.finalDecision',
};
void SECTION_LABEL_KEYS;

// Progress steps shown while running
const PROGRESS_STEPS: { key: string; labelKey: string }[] = [
  { key: 'market_report', labelKey: 'node.market_analyst' },
  { key: 'sentiment_report', labelKey: 'node.sentiment_analyst' },
  { key: 'news_report', labelKey: 'node.news_analyst' },
  { key: 'fundamentals_report', labelKey: 'node.fundamentals_analyst' },
  { key: 'macro_report', labelKey: 'node.macro_analyst' },
  { key: 'bull_arguments', labelKey: 'node.bull_researcher' },
  { key: 'bear_arguments', labelKey: 'node.bear_researcher' },
  { key: 'research_verdict', labelKey: 'node.research_manager' },
  { key: 'trader_plan', labelKey: 'node.trader' },
  { key: 'risk_debate', labelKey: 'result.riskDebate' },
  { key: 'risk_verdict', labelKey: 'result.riskVerdict' },
  { key: 'final_decision', labelKey: 'result.finalDecision' },
];

// Maps a result key to the nodeType it belongs to — used for per-node status coloring
const RESULT_KEY_TO_NODE_TYPE: Record<string, string> = {
  market_report:       'market_analyst',
  sentiment_report:    'sentiment_analyst',
  news_report:         'news_analyst',
  fundamentals_report: 'fundamentals_analyst',
  macro_report:        'macro_analyst',
  market_research_report: 'market_research_analyst',
  bull_arguments:      'bull_researcher',
  bear_arguments:      'bear_researcher',
  research_verdict:    'research_manager',
  trader_plan:         'trader',
  risk_debate:         'neutral_risk',   // any risk node; all 3 contribute
  risk_verdict:        'conservative_risk',
  final_decision:      'portfolio_manager',
};

// Extract a short text summary from a result value for the hover popover
function extractOutputText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return JSON.stringify(value ?? '', null, 2);
  const v = value as Record<string, unknown>;
  const parts: string[] = [];
  if (v.signal)   parts.push(`Signal: ${v.signal}` + (v.confidence != null ? ` (${((v.confidence as number)*100).toFixed(0)}%)` : ''));
  if (v.action)   parts.push(`Action: ${v.action}`  + (v.confidence != null ? ` (${((v.confidence as number)*100).toFixed(0)}%)` : ''));
  if (v.summary)  parts.push(String(v.summary));
  if (v.reasoning) parts.push(String(v.reasoning).slice(0, 400));
  if (v.verdict)  parts.push(String(v.verdict));
  if (Array.isArray(v.key_evidence) && v.key_evidence.length) {
    parts.push('**Evidence:**\n' + (v.key_evidence as string[]).slice(0, 3).map(e => `- ${e}`).join('\n'));
  }
  if (Array.isArray(v.key_risks) && v.key_risks.length) {
    parts.push('**Risks:**\n' + (v.key_risks as string[]).slice(0, 3).map(r => `- ${r}`).join('\n'));
  }
  return parts.join('\n\n') || JSON.stringify(v, null, 2).slice(0, 500);
}

// Agent display metadata for Discussion tab
interface AgentMeta {
  labelKey: string;
  category: 'analyst' | 'debater' | 'manager';
  icon: string;
}

const AGENT_META: Record<string, AgentMeta> = {
  market_report:       { labelKey: 'node.market_analyst',       category: 'analyst',  icon: 'M' },
  sentiment_report:    { labelKey: 'node.sentiment_analyst',    category: 'analyst',  icon: 'S' },
  news_report:         { labelKey: 'node.news_analyst',         category: 'analyst',  icon: 'N' },
  fundamentals_report: { labelKey: 'node.fundamentals_analyst', category: 'analyst',  icon: 'F' },
  macro_report:        { labelKey: 'node.macro_analyst',        category: 'analyst',  icon: 'X' },
  bull_arguments:      { labelKey: 'node.bull_researcher',      category: 'debater',  icon: 'B' },
  bear_arguments:      { labelKey: 'node.bear_researcher',      category: 'debater',  icon: 'S' },
  research_verdict:    { labelKey: 'node.research_manager',     category: 'manager',  icon: 'R' },
  trader_plan:         { labelKey: 'node.trader',               category: 'manager',  icon: 'T' },
  risk_debate:         { labelKey: 'result.riskDebate',         category: 'debater',  icon: 'D' },
  risk_verdict:        { labelKey: 'result.riskVerdict',        category: 'manager',  icon: 'V' },
  final_decision:      { labelKey: 'result.finalDecision',      category: 'manager',  icon: 'P' },
};

type ResultTabId = 'overview' | 'discussion' | 'summary' | 'history';
type ViewMode = 'canvas' | 'results';

// ─── History types ─────────────────────────────────────────────────────────────
interface HistoryEntry {
  id: string;
  ticker: string;
  timestamp: number;
  result: Record<string, unknown>;
}

const HISTORY_KEY = 'qc-analysis-history';
const HISTORY_MAX = 30;

function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}

function saveHistory(entries: HistoryEntry[]): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, HISTORY_MAX)));
  } catch {
    // quota exceeded — silently ignore
  }
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

// ─── MiniMarkdown ──────────────────────────────────────────────────────────────
// Inline markdown renderer — no dangerouslySetInnerHTML, no external deps.
// Handles: ### headings, **bold**, *italic*, - / * bullet lists, 1. numbered lists, line breaks.
function MiniMarkdown({ text, className }: { text: string; className?: string }) {
  if (!text) return null;

  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let listItems: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let keyIdx = 0;

  function flushList() {
    if (listItems.length === 0) return;
    if (listType === 'ul') {
      elements.push(
        <ul key={`ul-${keyIdx++}`} className={styles.mdUl}>
          {listItems.map((item, i) => (
            <li key={i} className={styles.mdLi}><InlineMarkdown text={item} /></li>
          ))}
        </ul>
      );
    } else {
      elements.push(
        <ol key={`ol-${keyIdx++}`} className={styles.mdOl}>
          {listItems.map((item, i) => (
            <li key={i} className={styles.mdLi}><InlineMarkdown text={item} /></li>
          ))}
        </ol>
      );
    }
    listItems = [];
    listType = null;
  }

  for (const line of lines) {
    // Heading: ### / ## / #
    const headingMatch = line.match(/^(#{1,3})\s+(.*)/);
    if (headingMatch) {
      flushList();
      const level = headingMatch[1].length;
      const headingClass = level === 1 ? styles.mdH1 : level === 2 ? styles.mdH2 : styles.mdH3;
      elements.push(
        <p key={keyIdx++} className={headingClass}><InlineMarkdown text={headingMatch[2]} /></p>
      );
      continue;
    }

    // Bullet list: - item or * item
    const bulletMatch = line.match(/^[-*]\s+(.*)/);
    if (bulletMatch) {
      if (listType !== 'ul') { flushList(); listType = 'ul'; }
      listItems.push(bulletMatch[1]);
      continue;
    }

    // Numbered list: 1. item
    const numberedMatch = line.match(/^\d+\.\s+(.*)/);
    if (numberedMatch) {
      if (listType !== 'ol') { flushList(); listType = 'ol'; }
      listItems.push(numberedMatch[1]);
      continue;
    }

    flushList();

    // Empty line → spacer
    if (line.trim() === '') {
      elements.push(<span key={keyIdx++} className={styles.mdSpacer} />);
      continue;
    }

    // Normal paragraph
    elements.push(
      <p key={keyIdx++} className={styles.mdP}><InlineMarkdown text={line} /></p>
    );
  }

  flushList();

  return <span className={className}>{elements}</span>;
}

// Renders inline markdown: **bold**, *italic*, remaining plain text
function InlineMarkdown({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  // Split on **bold** and *italic* tokens
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) {
      parts.push(<span key={i++}>{text.slice(last, match.index)}</span>);
    }
    const token = match[0];
    if (token.startsWith('**')) {
      parts.push(<strong key={i++} className={styles.mdBold}>{token.slice(2, -2)}</strong>);
    } else {
      parts.push(<em key={i++} className={styles.mdItalic}>{token.slice(1, -1)}</em>);
    }
    last = match.index + token.length;
  }
  if (last < text.length) {
    parts.push(<span key={i++}>{text.slice(last)}</span>);
  }

  return <>{parts}</>;
}

function sanitizeError(raw: string, quotaMsg: string): string {
  if (raw.includes('RESOURCE_EXHAUSTED') || raw.includes('429')) {
    return quotaMsg;
  }
  const firstSentence = raw.split(/[.\n]/)[0].trim();
  return firstSentence.length > 0 && firstSentence.length < 200 ? firstSentence : raw.slice(0, 160);
}

// ─── Sub-components for each result tab ───────────────────────────────────────

interface AnalystReport {
  analyst_type?: string;
  summary?: string;
  signal?: string;
  confidence?: number;
  key_evidence?: string[];
  key_risks?: string[];
}

interface FinalDecisionData {
  action?: string;
  confidence?: number;
  reasoning?: string;
  entry_price?: number;
  target_price?: number;
  stop_loss?: number;
  time_horizon?: string;
}

function signalColor(signal: string | undefined): string {
  if (!signal) return 'var(--text-muted)';
  const s = signal.toLowerCase();
  if (s === 'bullish' || s === 'buy') return 'var(--green)';
  if (s === 'bearish' || s === 'sell') return 'var(--red)';
  return 'var(--orange)';
}

// ─── Collapsible analyst chip (used in Overview) ────────────────────────────
function AnalystChip({
  resultKey,
  report,
  t,
}: {
  resultKey: string;
  report: AnalystReport;
  t: (k: string) => string;
}) {
  const [open, setOpen] = React.useState(false);
  const meta = AGENT_META[resultKey];
  const sc = signalColor(report.signal);

  return (
    <div
      className={`${styles.analystChip} ${open ? styles.analystChipOpen : ''}`}
      style={{ borderTopColor: sc }}
    >
      <button
        className={styles.analystChipHeader}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className={styles.analystAvatar} style={{ background: 'var(--node-analyst)', color: '#fff' }}>
          {meta?.icon ?? '?'}
        </span>
        <span className={styles.analystChipName}>{t(meta?.labelKey ?? resultKey)}</span>
        <span className={styles.signalBadge} style={{ color: sc, borderColor: sc }}>
          {report.signal?.toUpperCase() ?? '—'}
        </span>
        <span className={styles.analystChipConf}>{((report.confidence ?? 0) * 100).toFixed(0)}%</span>
        <span className={`${styles.analystChipChevron} ${open ? styles.analystChipChevronOpen : ''}`}>›</span>
      </button>
      {open && (
        <div className={styles.analystChipBody}>
          {report.summary && (
            <p className={styles.analystChipSummary}>{report.summary}</p>
          )}
          {report.key_evidence && report.key_evidence.length > 0 && (
            <div className={styles.analystChipList}>
              <span className={styles.analystChipListLabel}>{t('result.evidence')}</span>
              <ul className={styles.analystChipUl}>
                {report.key_evidence.map((e, i) => (
                  <li key={i}><MiniMarkdown text={e} /></li>
                ))}
              </ul>
            </div>
          )}
          {report.key_risks && report.key_risks.length > 0 && (
            <div className={styles.analystChipList}>
              <span className={styles.analystChipListLabel}>{t('result.risks')}</span>
              <ul className={styles.analystChipUl}>
                {report.key_risks.map((r, i) => (
                  <li key={i}><MiniMarkdown text={r} /></li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Tab: Overview ────────────────────────────────────────────────────────────
function OverviewTab({
  result,
  ticker,
  t,
  onSaveToJournal,
  onEmailReport,
  emailState,
  emailErr,
  emailSmtpOk,
}: {
  result: Record<string, unknown>;
  ticker: string;
  t: (k: string) => string;
  onSaveToJournal?: () => void;
  onEmailReport?: (email: string) => void;
  emailState?: 'idle' | 'sending' | 'sent' | 'error';
  emailErr?: string;
  emailSmtpOk?: boolean | null;
}) {
  const decision = result['final_decision'] as FinalDecisionData | undefined;
  const analystKeys = ['market_report', 'sentiment_report', 'news_report', 'fundamentals_report', 'macro_report'];
  const analystReports = analystKeys
    .filter((k) => result[k] && typeof result[k] === 'object' && 'signal' in (result[k] as object))
    .map((k) => ({ key: k, report: result[k] as AnalystReport }));

  const signals = analystReports.map((r) => r.report.signal?.toLowerCase() ?? 'neutral');
  const bullish = signals.filter((s) => s === 'bullish').length;
  const bearish = signals.filter((s) => s === 'bearish').length;
  const neutral = signals.filter((s) => s !== 'bullish' && s !== 'bearish').length;
  const total = signals.length;

  const actionColor = decision?.action
    ? decision.action === 'BUY' ? 'var(--green)' : decision.action === 'SELL' ? 'var(--red)' : 'var(--orange)'
    : 'var(--text-muted)';

  return (
    <div className={styles.tabContent}>
      {/* ── Hero decision strip ── */}
      {decision && (
        <div className={styles.overviewHero} style={{ borderColor: actionColor }}>
          <div className={styles.overviewHeroStrip} style={{ background: actionColor }}>
            <span className={styles.overviewAction}>{decision.action ?? '—'}</span>
            <span className={styles.overviewConf}>{((decision.confidence ?? 0) * 100).toFixed(0)}%</span>
            {decision.time_horizon && (
              <span className={styles.overviewHorizon}>{decision.time_horizon}</span>
            )}
            {(decision.entry_price != null || decision.target_price != null || decision.stop_loss != null) && (
              <span className={styles.overviewPriceInline}>
                {decision.entry_price != null && (
                  <span className={styles.overviewPriceTag} style={{ color: '#fff', background: 'rgba(0,0,0,0.28)' }}>
                    E {decision.entry_price.toFixed(2)}
                  </span>
                )}
                {decision.target_price != null && (
                  <span className={styles.overviewPriceTag} style={{ color: '#fff', background: 'rgba(0,0,0,0.22)' }}>
                    T {decision.target_price.toFixed(2)}
                  </span>
                )}
                {decision.stop_loss != null && (
                  <span className={styles.overviewPriceTag} style={{ color: '#fff', background: 'rgba(0,0,0,0.22)' }}>
                    S {decision.stop_loss.toFixed(2)}
                  </span>
                )}
              </span>
            )}
            {ticker && <span className={styles.overviewTicker}>{ticker}</span>}
          </div>
          {decision.reasoning && (
            <p className={styles.overviewReasoningOneLiner}>
              {decision.reasoning.split(/[.。\n]/)[0].trim()}
            </p>
          )}
        </div>
      )}

      {/* ── Embedded chart ── */}
      {ticker && (
        <div className={styles.overviewChartWrap}>
          <ResultChart
            ticker={ticker}
            finalDecision={decision ?? null}
          />
        </div>
      )}

      {/* ── Consensus bar ── */}
      {total > 0 && (
        <div className={styles.overviewConsensus}>
          <div className={styles.overviewConsensusHeader}>
            <span className={styles.overviewSectionLabel}>{t('result.consensus')}</span>
            <div className={styles.overviewTally}>
              {bullish > 0 && <span className={styles.tallyBull}>{bullish} {t('result.bullish')}</span>}
              {neutral > 0 && <span className={styles.tallyNeutral}>{neutral} {t('result.neutral')}</span>}
              {bearish > 0 && <span className={styles.tallyBear}>{bearish} {t('result.bearish')}</span>}
              <span className={styles.tallyTotal}>/ {total}</span>
            </div>
          </div>
          <div className={styles.overviewConsensusBar}>
            {bullish > 0 && <div className={styles.consensusBull} style={{ flex: bullish }} />}
            {neutral > 0 && <div className={styles.consensusNeutral} style={{ flex: neutral }} />}
            {bearish > 0 && <div className={styles.consensusBear} style={{ flex: bearish }} />}
          </div>
        </div>
      )}

      {/* ── Analyst chips (collapsed by default, expand for detail) ── */}
      {analystReports.length > 0 && (
        <div className={styles.overviewGrid}>
          <div className={styles.overviewSectionLabel} style={{ marginBottom: 8 }}>{t('result.analysts')}</div>
          <div className={styles.analystChipGrid}>
            {analystReports.map(({ key, report }) => (
              <AnalystChip key={key} resultKey={key} report={report} t={t} />
            ))}
          </div>
        </div>
      )}

      {/* ── Actions: Save to Journal + Email report ── */}
      <div className={styles.overviewActions}>
        {onSaveToJournal && (
          <button className={styles.overviewSaveJournalBtn} onClick={onSaveToJournal}>
            {t('dag.saveToJournal')}
          </button>
        )}
        {onEmailReport && emailSmtpOk !== false && (
          <EmailReportControl
            onSend={onEmailReport}
            state={emailState ?? 'idle'}
            err={emailErr ?? ''}
            t={t}
          />
        )}
        {onEmailReport && emailSmtpOk === false && (
          <span className={styles.emailHint}>{t('dag.emailNoSmtp')}</span>
        )}
      </div>
    </div>
  );
}

// ─── Email report control: searchable email input + send ─────────────────────
function EmailReportControl({
  onSend, state, err, t,
}: {
  onSend: (email: string) => void;
  state: 'idle' | 'sending' | 'sent' | 'error';
  err: string;
  t: (k: string) => string;
}) {
  const [email, setEmail] = useState<string>(() => localStorage.getItem('qc-digest-email') || '');
  let recents: string[] = [];
  try { recents = JSON.parse(localStorage.getItem('qc-email-history') || '[]'); } catch { /* ignore */ }

  return (
    <div className={styles.emailControl}>
      <input
        className={styles.emailInput}
        type="email"
        list="qc-email-recents"
        placeholder={t('dag.emailPlaceholder')}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={state === 'sending'}
      />
      <datalist id="qc-email-recents">
        {recents.map((r) => <option key={r} value={r} />)}
      </datalist>
      <button
        className={styles.overviewSaveJournalBtn}
        onClick={() => onSend(email.trim())}
        disabled={state === 'sending' || !email.trim() || state === 'sent'}
      >
        {state === 'sending' ? t('dag.emailSending')
          : state === 'sent' ? t('dag.emailSent')
          : t('dag.emailReport')}
      </button>
      {state === 'error' && <span className={styles.emailHint} style={{ color: 'var(--red)' }}>{err}</span>}
    </div>
  );
}

// ─── Discussion: collapsible message ─────────────────────────────────────────
const LONG_MSG_THRESHOLD = 500; // chars — collapse body if text exceeds this

function DiscussionMessage({
  resultKey,
  value,
  t,
  defaultOpen = false,
}: {
  resultKey: string;
  value: unknown;
  t: (k: string) => string;
  defaultOpen?: boolean;
}) {
  const meta = AGENT_META[resultKey];
  const category = meta?.category ?? 'analyst';
  const borderColorVar =
    category === 'analyst' ? 'var(--node-analyst)' :
    category === 'debater' ? 'var(--node-debater)' :
    'var(--node-manager)';
  const avatarBg = borderColorVar;
  const agentName = meta ? t(meta.labelKey) : resultKey.replace(/_/g, ' ');

  // Extra green/red left border for bull/bear
  const isBull = resultKey === 'bull_arguments';
  const isBear = resultKey === 'bear_arguments';
  const accentBorder = isBull ? 'var(--green)' : isBear ? 'var(--red)' : borderColorVar;

  let signal: string | undefined;
  let confidence: number | undefined;
  if (value && typeof value === 'object' && 'signal' in (value as object)) {
    signal = (value as AnalystReport).signal;
    confidence = (value as AnalystReport).confidence;
  }
  if (value && typeof value === 'object' && 'action' in (value as object)) {
    signal = (value as FinalDecisionData).action;
    confidence = (value as FinalDecisionData).confidence;
  }
  const sc = signalColor(signal);

  // Estimate text length for collapse decision
  const textLen = (() => {
    if (typeof value === 'string') return value.length;
    if (value && typeof value === 'object') {
      const v = value as Record<string, unknown>;
      return ((v.summary as string) ?? (v.reasoning as string) ?? '').length;
    }
    return 0;
  })();
  const isLong = textLen > LONG_MSG_THRESHOLD;
  const [bodyOpen, setBodyOpen] = React.useState(defaultOpen || !isLong);

  return (
    <div className={styles.messageRow}>
      <div className={styles.messageAvatar} style={{ background: avatarBg }}>
        {meta?.icon ?? '?'}
      </div>
      <div className={styles.messageBubble} style={{ borderLeftColor: accentBorder }}>
        {/* Compact header — always visible */}
        <button
          className={styles.messageHeader}
          onClick={() => setBodyOpen((v) => !v)}
          aria-expanded={bodyOpen}
          style={{ width: '100%', background: 'none', textAlign: 'left', cursor: 'pointer' }}
        >
          <span className={styles.messageName}>{agentName}</span>
          {signal && (
            <span className={styles.messageBadge} style={{ color: sc, borderColor: sc }}>
              {signal.toUpperCase()}
            </span>
          )}
          {confidence != null && (
            <span className={styles.messageConf}>{((confidence) * 100).toFixed(0)}%</span>
          )}
          <span className={`${styles.msgChevron} ${bodyOpen ? styles.msgChevronOpen : ''}`}>›</span>
        </button>

        {/* Collapsible body */}
        {bodyOpen && (
          <div className={styles.messageBody}>
            <MessageBody resultKey={resultKey} value={value} t={t} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tab: Discussion ──────────────────────────────────────────────────────────
function DiscussionTab({
  result,
  t,
}: {
  result: Record<string, unknown>;
  t: (k: string) => string;
}) {
  const available = RESULT_ORDER.filter((k) => result[k] !== undefined);
  const hasBullBear = result['bull_arguments'] !== undefined || result['bear_arguments'] !== undefined;

  const PhaseHeader = ({ label }: { label: string }) => (
    <div className={styles.phaseHeader}>
      <span className={styles.phaseHeaderLine} />
      <span className={styles.phaseHeaderLabel}>{label}</span>
      <span className={styles.phaseHeaderLine} />
    </div>
  );

  return (
    <div className={styles.tabContent}>
      <div className={styles.discussionFeed}>
        {/* Phase 1: Analysts — first one open, rest collapsed */}
        {(['market_report', 'sentiment_report', 'news_report', 'fundamentals_report', 'macro_report'] as const)
          .filter((k) => available.includes(k))
          .map((key, idx) => (
            <DiscussionMessage key={key} resultKey={key} value={result[key]} t={t} defaultOpen={idx === 0} />
          ))}

        {/* Phase 2: Bull vs Bear */}
        {hasBullBear && <PhaseHeader label={t('result.phaseDebate')} />}
        {hasBullBear && (
          <div className={styles.debateColumns}>
            <div className={`${styles.debateCol} ${styles.debateColBull}`}>
              {result['bull_arguments'] !== undefined && (
                <DiscussionMessage resultKey="bull_arguments" value={result['bull_arguments']} t={t} defaultOpen />
              )}
            </div>
            <div className={styles.debateColDivider} />
            <div className={`${styles.debateCol} ${styles.debateColBear}`}>
              {result['bear_arguments'] !== undefined && (
                <DiscussionMessage resultKey="bear_arguments" value={result['bear_arguments']} t={t} defaultOpen />
              )}
            </div>
          </div>
        )}

        {/* Phase 3: Research + Trader */}
        {(['research_verdict', 'trader_plan'] as const).filter((k) => available.includes(k)).length > 0 && (
          <PhaseHeader label={t('result.phaseResearch')} />
        )}
        {(['research_verdict', 'trader_plan'] as const)
          .filter((k) => available.includes(k))
          .map((key) => (
            <DiscussionMessage key={key} resultKey={key} value={result[key]} t={t} defaultOpen />
          ))}

        {/* Phase 4: Risk debate */}
        {result['risk_debate'] !== undefined && (
          <>
            <PhaseHeader label={t('result.phaseRisk')} />
            <DiscussionMessage resultKey="risk_debate" value={result['risk_debate']} t={t} defaultOpen />
          </>
        )}

        {/* Phase 5: Decision */}
        {(['risk_verdict', 'final_decision'] as const).filter((k) => available.includes(k)).length > 0 && (
          <PhaseHeader label={t('result.phaseDecision')} />
        )}
        {(['risk_verdict', 'final_decision'] as const)
          .filter((k) => available.includes(k))
          .map((key) => (
            <DiscussionMessage key={key} resultKey={key} value={result[key]} t={t} defaultOpen />
          ))}
      </div>
    </div>
  );
}

function MessageBody({ resultKey, value, t }: { resultKey: string; value: unknown; t: (k: string) => string }) {
  if (typeof value === 'string') {
    return <MiniMarkdown text={value} className={styles.messageText} />;
  }

  // AnalystReport
  if (value && typeof value === 'object' && 'signal' in (value as object)) {
    const report = value as AnalystReport;
    return (
      <div>
        {report.summary && <MiniMarkdown text={report.summary} className={styles.messageText} />}
        {report.key_evidence && report.key_evidence.length > 0 && (
          <div className={styles.messageList}>
            <span className={styles.messageListLabel}>{t('result.evidence')}</span>
            <ul>
              {report.key_evidence.map((e, i) => <li key={i}><MiniMarkdown text={e} /></li>)}
            </ul>
          </div>
        )}
        {report.key_risks && report.key_risks.length > 0 && (
          <div className={styles.messageList}>
            <span className={styles.messageListLabel}>{t('result.risks')}</span>
            <ul>
              {report.key_risks.map((r, i) => <li key={i}><MiniMarkdown text={r} /></li>)}
            </ul>
          </div>
        )}
      </div>
    );
  }

  // FinalDecision
  if (resultKey === 'final_decision' && value && typeof value === 'object' && 'action' in (value as object)) {
    const decision = value as FinalDecisionData;
    const ac = signalColor(decision.action);
    return (
      <div>
        {decision.reasoning && <MiniMarkdown text={decision.reasoning} className={styles.messageText} />}
        {(decision.entry_price != null || decision.target_price != null || decision.stop_loss != null) && (
          <div className={styles.messagePriceRow}>
            {decision.entry_price != null && (
              <span className={styles.messagePillEntry}>
                {t('result.entry')} <strong>${decision.entry_price.toFixed(2)}</strong>
              </span>
            )}
            {decision.target_price != null && (
              <span className={styles.messagePillTarget}>
                {t('result.target')} <strong>${decision.target_price.toFixed(2)}</strong>
              </span>
            )}
            {decision.stop_loss != null && (
              <span className={styles.messagePillStop}>
                {t('result.stop')} <strong>${decision.stop_loss.toFixed(2)}</strong>
              </span>
            )}
          </div>
        )}
        {decision.time_horizon && (
          <span className={styles.messageHorizon} style={{ color: ac }}>{decision.time_horizon}</span>
        )}
      </div>
    );
  }

  // Generic decision with action
  if (value && typeof value === 'object' && 'action' in (value as object)) {
    const decision = value as FinalDecisionData;
    return (
      <div>
        {decision.reasoning && <MiniMarkdown text={decision.reasoning} className={styles.messageText} />}
        {(decision.entry_price != null || decision.target_price != null || decision.stop_loss != null) && (
          <div className={styles.messagePriceRow}>
            {decision.entry_price != null && (
              <span className={styles.messagePillEntry}>
                {t('result.entry')} <strong>${decision.entry_price.toFixed(2)}</strong>
              </span>
            )}
            {decision.target_price != null && (
              <span className={styles.messagePillTarget}>
                {t('result.target')} <strong>${decision.target_price.toFixed(2)}</strong>
              </span>
            )}
            {decision.stop_loss != null && (
              <span className={styles.messagePillStop}>
                {t('result.stop')} <strong>${decision.stop_loss.toFixed(2)}</strong>
              </span>
            )}
          </div>
        )}
      </div>
    );
  }

  // Array (debates, arguments)
  if (Array.isArray(value)) {
    return (
      <div>
        {value.map((item, i) => (
          <div key={i} className={styles.messageArrayItem}>
            {item.role && <span className={styles.messageArrayRole}>{item.role}</span>}
            <MiniMarkdown text={item.content || JSON.stringify(item)} className={styles.messageText} />
          </div>
        ))}
      </div>
    );
  }

  return <pre className={styles.messageRaw}>{JSON.stringify(value, null, 2)}</pre>;
}

// ─── Tab: Summary ─────────────────────────────────────────────────────────────
function SummaryTab({
  result,
  ticker,
  t,
}: {
  result: Record<string, unknown>;
  ticker: string;
  t: (k: string) => string;
}) {
  const [showFull, setShowFull] = React.useState(false);

  const decision = result['final_decision'] as FinalDecisionData | undefined;
  const actionColor = decision?.action
    ? decision.action === 'BUY' ? 'var(--green)' : decision.action === 'SELL' ? 'var(--red)' : 'var(--orange)'
    : 'var(--text-muted)';

  // One-liner: first sentence of reasoning
  const oneLiner = decision?.reasoning
    ? decision.reasoning.split(/[.。\n]/)[0].trim()
    : '';

  // All analyst reports for the compact row
  const analystKeys = ['market_report', 'sentiment_report', 'news_report', 'fundamentals_report', 'macro_report'];
  const analystReports = analystKeys
    .filter((k) => result[k] && typeof result[k] === 'object' && 'signal' in (result[k] as object))
    .map((k) => ({ key: k, report: result[k] as AnalystReport }));

  return (
    <div className={styles.tabContent}>
      {/* ── Verdict hero ── */}
      {decision && (
        <div className={styles.summaryHero}>
          <div className={styles.summaryHeroLeft}>
            <span className={styles.summaryActionPill} style={{ background: actionColor }}>
              {decision.action ?? '—'}
            </span>
            <span className={styles.summaryConf}>{((decision.confidence ?? 0) * 100).toFixed(0)}%</span>
            {decision.time_horizon && (
              <span className={styles.summaryHorizon}>{decision.time_horizon}</span>
            )}
          </div>
          {(decision.target_price != null || decision.stop_loss != null) && (
            <div className={styles.summaryStatRow}>
              {decision.target_price != null && (
                <div className={styles.summaryStat}>
                  <span className={styles.summaryStatLabel}>{t('result.target')}</span>
                  <span className={styles.summaryStatVal} style={{ color: 'var(--green)' }}>
                    ${decision.target_price.toFixed(2)}
                  </span>
                </div>
              )}
              {decision.stop_loss != null && (
                <div className={styles.summaryStat}>
                  <span className={styles.summaryStatLabel}>{t('result.stop')}</span>
                  <span className={styles.summaryStatVal} style={{ color: 'var(--red)' }}>
                    ${decision.stop_loss.toFixed(2)}
                  </span>
                </div>
              )}
            </div>
          )}
          {oneLiner && (
            <p className={styles.summaryOneLiner}>{oneLiner}.</p>
          )}
        </div>
      )}

      {/* ── Embedded chart ── */}
      {ticker && (
        <div className={styles.overviewChartWrap}>
          <ResultChart ticker={ticker} finalDecision={decision ?? null} />
        </div>
      )}

      {/* ── Analyst signal strip ── */}
      {analystReports.length > 0 && (
        <div className={styles.summaryAnalystStrip}>
          <span className={styles.summaryStripLabel}>{t('result.analysts')}</span>
          <div className={styles.summaryAnalystRow}>
            {analystReports.map(({ key, report }) => {
              const meta = AGENT_META[key];
              const sc = signalColor(report.signal);
              return (
                <div key={key} className={styles.summaryAnalystCell}>
                  <span className={styles.summaryAnalystDot} style={{ background: sc }} />
                  <span className={styles.summaryAnalystName}>{t(meta?.labelKey ?? key)}</span>
                  <span className={styles.summaryAnalystConf} style={{ color: sc }}>
                    {report.signal?.slice(0, 4).toUpperCase()} {((report.confidence ?? 0) * 100).toFixed(0)}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Key sections (research verdict, trader plan, risk verdict) — expandable ── */}
      <div className={styles.summaryLayout}>
        {[
          { key: 'research_verdict', labelKey: 'node.research_manager' },
          { key: 'trader_plan', labelKey: 'node.trader' },
          { key: 'risk_verdict', labelKey: 'result.riskVerdict' },
        ].map(({ key, labelKey }) => {
          if (!result[key]) return null;
          const value = result[key];
          let signal: string | undefined;
          let confidence: number | undefined;
          let mainText: string | undefined;
          if (value && typeof value === 'object' && 'signal' in (value as object)) {
            const r = value as AnalystReport;
            signal = r.signal; confidence = r.confidence; mainText = r.summary;
          } else if (typeof value === 'string') {
            mainText = value;
          } else if (value && typeof value === 'object' && 'action' in (value as object)) {
            const d = value as FinalDecisionData;
            signal = d.action; confidence = d.confidence; mainText = d.reasoning;
          }
          const sc = signalColor(signal);
          // Short preview: first 2 sentences
          const preview = mainText
            ? mainText.split(/[.。]/).slice(0, 2).join('.').trim() + '.'
            : '';
          return (
            <CollapsibleSection
              key={key}
              label={t(labelKey)}
              signal={signal}
              confidence={confidence}
              sc={sc}
              preview={preview}
              fullContent={mainText ?? ''}
            />
          );
        })}
      </div>

      {/* ── Show full analysis toggle ── */}
      <div className={styles.summaryShowFull}>
        <button
          className={styles.summaryShowFullBtn}
          onClick={() => setShowFull((v) => !v)}
        >
          {showFull ? t('result.hideFull') : t('result.showFull')}
          <span className={`${styles.summaryShowFullChevron} ${showFull ? styles.summaryShowFullChevronOpen : ''}`}>
            ›
          </span>
        </button>
      </div>

      {showFull && decision && (
        <div className={styles.summaryFullBlock}>
          <MiniMarkdown text={decision.reasoning ?? ''} className={styles.summaryText} />
        </div>
      )}
    </div>
  );
}

function CollapsibleSection({
  label,
  signal,
  confidence,
  sc,
  preview,
  fullContent,
}: {
  label: string;
  signal?: string;
  confidence?: number;
  sc: string;
  preview: string;
  fullContent: string;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className={styles.summarySection}>
      <button className={styles.summarySectionHeader} onClick={() => setOpen((v) => !v)}>
        <span className={styles.summarySectionLabel}>{label}</span>
        {signal && (
          <span className={styles.signalBadge} style={{ color: sc, borderColor: sc }}>
            {signal.toUpperCase()}
          </span>
        )}
        {confidence != null && (
          <span className={styles.summaryConfSmall}>{((confidence) * 100).toFixed(0)}%</span>
        )}
        <span className={`${styles.summaryChevron} ${open ? styles.summaryChevronOpen : ''}`}>›</span>
      </button>
      {!open && preview && (
        <p className={styles.summaryPreview}>{preview}</p>
      )}
      {open && fullContent && (
        <MiniMarkdown text={fullContent} className={styles.summaryText} />
      )}
    </div>
  );
}

// ─── Tab: History ─────────────────────────────────────────────────────────────

function absoluteTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

// One expanded entry showing the full agent transcript inline
function HistoryEntryTranscript({
  entry,
  t,
}: {
  entry: HistoryEntry;
  t: (k: string) => string;
}) {
  const available = RESULT_ORDER.filter((k) => entry.result[k] !== undefined);
  const hasBullBear =
    entry.result['bull_arguments'] !== undefined || entry.result['bear_arguments'] !== undefined;

  if (available.length === 0) {
    return (
      <div className={styles.historyTranscriptEmpty}>
        {t('dag.historyEmpty')}
      </div>
    );
  }

  return (
    <div className={styles.historyTranscript}>
      {/* Analyst phase */}
      {(['market_report', 'sentiment_report', 'news_report', 'fundamentals_report', 'macro_report'] as const)
        .filter((k) => available.includes(k))
        .map((key) => (
          <DiscussionMessage key={key} resultKey={key} value={entry.result[key]} t={t} />
        ))}

      {/* Bull vs Bear */}
      {hasBullBear && (
        <div className={styles.debateDivider}>
          <span className={styles.debateDividerLine} />
          <span className={styles.debateDividerLabel}>{t('result.bullVsBear')}</span>
          <span className={styles.debateDividerLine} />
        </div>
      )}
      {hasBullBear && (
        <div className={styles.debateColumns}>
          <div className={styles.debateCol}>
            {entry.result['bull_arguments'] !== undefined && (
              <DiscussionMessage resultKey="bull_arguments" value={entry.result['bull_arguments']} t={t} />
            )}
          </div>
          <div className={styles.debateColDivider} />
          <div className={styles.debateCol}>
            {entry.result['bear_arguments'] !== undefined && (
              <DiscussionMessage resultKey="bear_arguments" value={entry.result['bear_arguments']} t={t} />
            )}
          </div>
        </div>
      )}

      {/* Research → Trader → Risk → Decision */}
      {(['research_verdict', 'trader_plan'] as const)
        .filter((k) => available.includes(k))
        .map((key) => (
          <DiscussionMessage key={key} resultKey={key} value={entry.result[key]} t={t} />
        ))}
      {entry.result['risk_debate'] !== undefined && (
        <>
          <div className={styles.debateDivider}>
            <span className={styles.debateDividerLine} />
            <span className={styles.debateDividerLabel}>{t('result.riskDebate')}</span>
            <span className={styles.debateDividerLine} />
          </div>
          <DiscussionMessage resultKey="risk_debate" value={entry.result['risk_debate']} t={t} />
        </>
      )}
      {(['risk_verdict', 'final_decision'] as const)
        .filter((k) => available.includes(k))
        .map((key) => (
          <DiscussionMessage key={key} resultKey={key} value={entry.result[key]} t={t} />
        ))}
    </div>
  );
}

// A single run card inside a ticker group — header + accordion body
function HistoryRunCard({
  entry,
  t,
  onLoad,
  onDelete,
}: {
  entry: HistoryEntry;
  t: (k: string) => string;
  onLoad: (entry: HistoryEntry) => void;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const decision = entry.result['final_decision'] as FinalDecisionData | undefined;
  const action = decision?.action;
  const actionColor =
    action === 'BUY' ? 'var(--green)' : action === 'SELL' ? 'var(--red)' : 'var(--orange)';
  const actionBg =
    action === 'BUY'
      ? 'rgba(38,166,154,0.10)'
      : action === 'SELL'
      ? 'rgba(239,83,80,0.10)'
      : 'rgba(255,152,0,0.10)';

  // "Why recommended" — first sentence of final_decision reasoning
  const whySnippet = decision?.reasoning
    ? decision.reasoning.split(/[.。\n]/)[0].trim()
    : '';

  return (
    <div className={`${styles.historyCard} ${expanded ? styles.historyCardExpanded : ''}`}>
      {/* Card header row */}
      <div className={styles.historyCardHeader}>
        <button
          className={styles.historyCardToggle}
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label={expanded ? t('dag.historyCollapse') : t('dag.historyExpand')}
        >
          <span className={`${styles.historyCardChevron} ${expanded ? styles.historyCardChevronOpen : ''}`}>
            ›
          </span>
          <span className={styles.historyCardTime}>
            {absoluteTime(entry.timestamp)}
          </span>
          {action && (
            <span
              className={styles.historyCardBadge}
              style={{ color: actionColor, background: actionBg, borderColor: actionColor }}
            >
              {action}
            </span>
          )}
          {decision?.confidence != null && (
            <span className={styles.historyCardConf}>
              {((decision.confidence) * 100).toFixed(0)}%
            </span>
          )}
        </button>

        {/* Secondary actions */}
        <div className={styles.historyCardActions}>
          <button
            className={styles.historyCardLoad}
            onClick={() => onLoad(entry)}
            title={t('dag.historyLoad')}
          >
            {t('dag.historyLoad')}
          </button>
          <button
            className={styles.historyCardDelete}
            onClick={() => onDelete(entry.id)}
            title={t('dag.deleteHistory')}
            aria-label={t('dag.deleteHistory')}
          >
            ×
          </button>
        </div>
      </div>

      {/* Why-recommended snippet — always visible, collapsed too */}
      {whySnippet && (
        <div className={styles.historyWhyRow}>
          <span className={styles.historyWhyLabel}>{t('dag.whyRecommended')}</span>
          <span className={styles.historyWhyText}>{whySnippet}.</span>
        </div>
      )}

      {/* Accordion body — full transcript */}
      {expanded && (
        <div className={styles.historyCardBody}>
          <HistoryEntryTranscript entry={entry} t={t} />
        </div>
      )}
    </div>
  );
}

function HistoryTab({
  history,
  t,
  onLoad,
  onDelete,
}: {
  history: HistoryEntry[];
  t: (k: string) => string;
  onLoad: (entry: HistoryEntry) => void;
  onDelete: (id: string) => void;
}) {
  // Group by ticker, preserving newest-first order within each group
  const groups = React.useMemo(() => {
    const map = new Map<string, HistoryEntry[]>();
    for (const entry of history) {
      const bucket = map.get(entry.ticker) ?? [];
      bucket.push(entry);
      map.set(entry.ticker, bucket);
    }
    // Sort tickers by most-recent run
    return [...map.entries()].sort(
      (a, b) => b[1][0].timestamp - a[1][0].timestamp
    );
  }, [history]);

  // Track which ticker groups are collapsed (all open by default)
  const [collapsedGroups, setCollapsedGroups] = React.useState<Set<string>>(new Set());
  const toggleGroup = (ticker: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(ticker)) next.delete(ticker);
      else next.add(ticker);
      return next;
    });
  };

  if (history.length === 0) {
    return (
      <div className={styles.tabContent}>
        <div className={styles.historyEmpty}>
          <span className={styles.historyEmptyIcon}>◷</span>
          <p className={styles.historyEmptyText}>{t('dag.historyEmpty')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.tabContent}>
      <div className={styles.historyArchive}>
        {groups.map(([ticker, entries]) => {
          const isCollapsed = collapsedGroups.has(ticker);
          const latest = entries[0].result['final_decision'] as FinalDecisionData | undefined;
          const latestAction = latest?.action;
          const latestColor =
            latestAction === 'BUY' ? 'var(--green)' :
            latestAction === 'SELL' ? 'var(--red)' : 'var(--orange)';
          const count = entries.length;
          const countLabel = count === 1
            ? t('dag.historyGroupCount').replace('{n}', String(count))
            : t('dag.historyGroupCountPlural').replace('{n}', String(count));

          return (
            <div key={ticker} className={styles.historyGroup}>
              {/* Ticker group header */}
              <button
                className={styles.historyGroupHeader}
                onClick={() => toggleGroup(ticker)}
                aria-expanded={!isCollapsed}
              >
                <span className={`${styles.historyGroupChevron} ${isCollapsed ? '' : styles.historyGroupChevronOpen}`}>
                  ›
                </span>
                <span className={styles.historyGroupTicker}>{ticker}</span>
                {latestAction && (
                  <span className={styles.historyGroupBadge} style={{ color: latestColor }}>
                    {latestAction}
                  </span>
                )}
                <span className={styles.historyGroupCount}>{countLabel}</span>
                <span className={styles.historyGroupLatest}>
                  {relativeTime(entries[0].timestamp)}
                </span>
              </button>

              {/* Run cards */}
              {!isCollapsed && (
                <div className={styles.historyGroupRuns}>
                  {entries.map((entry) => (
                    <HistoryRunCard
                      key={entry.id}
                      entry={entry}
                      t={t}
                      onLoad={onLoad}
                      onDelete={onDelete}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Auto-fit the canvas once ReactFlow has MEASURED all nodes. Rendered inside
// <ReactFlow> so it has flow context. The plain `fitView` prop / a programmatic
// fitView on init both run before node dimensions exist (esp. after a tab switch),
// leaving the seeded pipeline scrolled off-screen; useNodesInitialized fires at
// exactly the right moment. Fits once (ref guard) so it never yanks the user's
// pan/zoom while they edit.
function FitOnInit() {
  const initialized = useNodesInitialized();
  const { fitView } = useReactFlow();
  const done = useRef(false);
  useEffect(() => {
    if (initialized && !done.current) {
      done.current = true;
      fitView({ padding: 0.2, duration: 200 });
    }
  }, [initialized, fitView]);
  return null;
}

// ─── Main DagEditor component ─────────────────────────────────────────────────
export function DagEditor({ nodeRegistry, onSave, initialTicker, model, onTickerConsumed }: DagEditorProps) {
  const { t, locale } = useI18n();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);
  const defaultPipeline = buildDefaultPipeline(nodeRegistry);
  const [nodes, setNodes, onNodesChange] = useNodesState(defaultPipeline.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(defaultPipeline.edges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [strategyName, setStrategyName] = useState('');
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<Record<string, unknown> | null>(null);
  const [analysisError, setAnalysisError] = useState('');
  const [currentTicker, setCurrentTicker] = useState<string>('');
  // Ticker shown in the top-right Header input (synced when navigating in).
  const [headerTicker, setHeaderTicker] = useState<string>('AAPL');
  // Risk style for ATR-based stop/target/position sizing (TrustTrade/TradingGroup).
  const [riskStyle, setRiskStyle] = useState<'conservative' | 'balanced' | 'aggressive'>('balanced');

  // View mode: canvas or results
  const [viewMode, setViewMode] = useState<ViewMode>('canvas');
  // Active sub-tab within results view
  const [resultTab, setResultTab] = useState<ResultTabId>('overview');
  // Show "analysis complete" banner on canvas view
  const [showCompleteBanner, setShowCompleteBanner] = useState(false);
  const [showLoadDialog, setShowLoadDialog] = useState(false);

  // ── Analysis history ──
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory());

  // Auto-run when navigated from Portfolio/Discovery with a ticker
  useEffect(() => {
    if (initialTicker && !running) {
      setHeaderTicker(initialTicker.toUpperCase());
      handleRun(initialTicker);
      onTickerConsumed?.();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTicker]);

  // Save completed analysis to history when final_decision arrives and run finishes
  const prevRunning = useRef(false);
  useEffect(() => {
    const wasRunning = prevRunning.current;
    prevRunning.current = running;
    // Transition: running → stopped, with a final_decision present
    if (wasRunning && !running && analysisResult && analysisResult['final_decision'] && currentTicker) {
      const entry: HistoryEntry = {
        id: `${currentTicker}-${Date.now()}`,
        ticker: currentTicker,
        timestamp: Date.now(),
        result: analysisResult,
      };
      setHistory((prev) => {
        const updated = [entry, ...prev.filter((e) => e.id !== entry.id)].slice(0, HISTORY_MAX);
        saveHistory(updated);
        return updated;
      });
    }
  }, [running, analysisResult, currentTicker]);

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => addEdge({
        ...connection,
        type: 'flow',
        animated: false, // FlowEdge manages its own animation
        style: { stroke: 'var(--text-muted)' },
      }, eds));
    },
    [setEdges],
  );

  const onDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();
      const nodeType = event.dataTransfer.getData('application/quantclash-node');
      if (!nodeType || !nodeRegistry[nodeType] || !rfInstance || !reactFlowWrapper.current) return;

      const bounds = reactFlowWrapper.current.getBoundingClientRect();
      const position = rfInstance.screenToFlowPosition({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      });

      const info = nodeRegistry[nodeType];
      const newNode: Node = {
        id: getNodeId(),
        type: 'agent',
        position,
        data: {
          label: info.name,
          nodeType,
          category: info.category,
          description: info.description,
          config: Object.fromEntries(
            Object.entries(info.config_schema).map(([k, v]) => [k, v.default])
          ),
        } satisfies AgentNodeData,
      };

      setNodes((nds) => [...nds, newNode]);
    },
    [rfInstance, nodeRegistry, setNodes],
  );

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.type === 'agent') {
      setSelectedNodeId(node.id);
    } else {
      setSelectedNodeId(null);
    }
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  const handleConfigUpdate = useCallback(
    (nodeId: string, config: Record<string, unknown>) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, config } } : n,
        ),
      );
    },
    [setNodes],
  );

  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== nodeId));
      setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
      setSelectedNodeId(null);
    },
    [setNodes, setEdges],
  );

  // Helper: update node data for all nodes matching a nodeType
  const setNodeStatusByType = useCallback(
    (nodeType: string | string[], status: import('./AgentNode').NodeStatus, outputText?: string) => {
      const types = Array.isArray(nodeType) ? nodeType : [nodeType];
      setNodes((nds) =>
        nds.map((n) => {
          if (n.type !== 'agent') return n;
          const d = n.data as AgentNodeData;
          if (!types.includes(d.nodeType)) return n;
          return {
            ...n,
            data: {
              ...d,
              nodeStatus: status,
              ...(outputText !== undefined ? { nodeOutput: outputText } : {}),
            },
          };
        })
      );
    },
    [setNodes]
  );

  const clearAllNodeStatus = useCallback(() => {
    setNodes((nds) =>
      nds.map((n) => {
        if (n.type !== 'agent') return n;
        const d = n.data as AgentNodeData;
        return { ...n, data: { ...d, nodeStatus: 'idle' as const, nodeOutput: undefined } };
      })
    );
  }, [setNodes]);

  const handleRun = async (ticker: string) => {
    setRunning(true);
    setAnalysisError('');
    setAnalysisResult({});
    setCurrentTicker(ticker.toUpperCase());
    setShowCompleteBanner(false);
    clearAllNodeStatus();
    // Stay on canvas while running so user can watch the DAG animate
    setViewMode('canvas');

    // Track which result keys have arrived to compute "next running" node
    const arrivedKeys = new Set<string>();

    // Helper to mark next-in-sequence node as running
    const markNextRunning = (justArrivedKey: string) => {
      arrivedKeys.add(justArrivedKey);
      // Find the first PROGRESS_STEPS key not yet arrived
      const nextStep = PROGRESS_STEPS.find((s) => !arrivedKeys.has(s.key));
      if (nextStep) {
        const nextNodeType = RESULT_KEY_TO_NODE_TYPE[nextStep.key];
        if (nextNodeType) setNodeStatusByType(nextNodeType, 'running');
      }
    };

    try {
      const agentNodes = nodes
        .filter((n) => n.type === 'agent')
        .map((n) => ({
          id: n.id,
          type: (n.data as AgentNodeData).nodeType,
          config: (n.data as AgentNodeData).config || {},
        }));
      const dagEdges = edges.map((e) => ({ from: e.source, to: e.target }));

      const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const response = await fetch(`${apiBase}/analyze/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker,
          dag_config: { nodes: agentNodes, edges: dagEdges },
          language: locale,
          model: model || undefined,
          risk_style: riskStyle,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status}`);
      }

      // Mark first expected nodes as running immediately
      const firstNodeType = RESULT_KEY_TO_NODE_TYPE[PROGRESS_STEPS[0]?.key ?? ''];
      if (firstNodeType) setNodeStatusByType(firstNodeType, 'running');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;
          try {
            const event = JSON.parse(jsonStr);
            if (event.error) {
              setAnalysisError(event.error);
            } else if (event.done) {
              // stream complete — mark all arrived nodes done
            } else if (event.key && event.value !== undefined) {
              setAnalysisResult((prev) => ({
                ...prev,
                [event.key]: event.value,
              }));
              // Mark the node that produced this result as done
              const nodeType = RESULT_KEY_TO_NODE_TYPE[event.key as string];
              if (nodeType) {
                // For risk debate: mark all three risk nodes done
                if (event.key === 'risk_debate') {
                  setNodeStatusByType(
                    ['aggressive_risk', 'conservative_risk', 'neutral_risk'],
                    'done',
                    extractOutputText(event.value)
                  );
                } else {
                  setNodeStatusByType(nodeType, 'done', extractOutputText(event.value));
                }
              }
              // Mark next expected node as running
              markNextRunning(event.key as string);
            }
          } catch {
            // skip malformed JSON
          }
        }
      }
    } catch (e: unknown) {
      setAnalysisError(e instanceof Error ? e.message : 'Analysis failed');
    } finally {
      setRunning(false);
      // Show complete banner on canvas; auto-switch to results
      setShowCompleteBanner(true);
      // Clear any remaining 'running' nodes (stream ended)
      setNodes((nds) =>
        nds.map((n) => {
          if (n.type !== 'agent') return n;
          const d = n.data as AgentNodeData;
          if (d.nodeStatus === 'running') {
            return { ...n, data: { ...d, nodeStatus: 'idle' as const } };
          }
          return n;
        })
      );
    }
  };

  const handleSave = async () => {
    const name = strategyName || prompt('Strategy name:');
    if (!name) return;
    setStrategyName(name);
    setSaving(true);
    try {
      const agentNodes = nodes
        .filter((n) => n.type === 'agent')
        .map((n) => ({
          id: n.id,
          type: (n.data as AgentNodeData).nodeType,
          config: (n.data as AgentNodeData).config || {},
        }));

      const dagEdges = edges.map((e) => ({
        from: e.source,
        to: e.target,
      }));

      await onSave({ name, description: '', nodes: agentNodes, edges: dagEdges });
    } finally {
      setSaving(false);
    }
  };

  const handleNew = () => {
    const fresh = buildDefaultPipeline(nodeRegistry);
    setNodes(fresh.nodes);
    setEdges(fresh.edges);
    setSelectedNodeId(null);
    setStrategyName('');
    setAnalysisResult(null);
    setAnalysisError('');
    setViewMode('canvas');
    setShowCompleteBanner(false);
    clearAllNodeStatus();
  };

  const handleLoadStrategy = (strategy: StrategyResponse) => {
    setShowLoadDialog(false);
    setStrategyName(strategy.name);

    const loadedNodes: Node[] = [
      ...BASE_NODES,
      ...strategy.dag_config.nodes.map((n, i) => {
        const info = nodeRegistry[n.type];
        return {
          id: n.id,
          type: 'agent' as const,
          position: { x: 200 + (i % 3) * 220, y: 150 + Math.floor(i / 3) * 150 },
          data: {
            label: info?.name || n.type,
            nodeType: n.type,
            category: info?.category || 'analysts',
            description: info?.description || '',
            config: n.config || {},
          } satisfies AgentNodeData,
        };
      }),
    ];

    const loadedEdges: Edge[] = strategy.dag_config.edges.map((e, i) => ({
      id: `e-${i}`,
      type: 'flow',
      source: e.from,
      target: e.to,
      animated: false,
    }));

    setNodes(loadedNodes);
    setEdges(loadedEdges);
    setSelectedNodeId(null);
  };

  const selectedNode = selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) : null;
  const hasResults = analysisResult && Object.keys(analysisResult).length > 0;
  const hasHistory = history.length > 0;

  // ── Save DAG analysis to decision journal ──────────────────────────────────
  const [dagJournalSaved, setDagJournalSaved] = useState(false);

  const handleSaveDagToJournal = React.useCallback(async () => {
    if (!analysisResult || !currentTicker) return;
    setDagJournalSaved(true); // optimistic — disable button immediately
    try {
      const decision = analysisResult['final_decision'] as { action?: string; reasoning?: string; confidence?: number } | undefined;
      const conclusion = decision?.reasoning
        ? decision.reasoning.split(/[.。\n]/)[0].trim() + '.'
        : decision?.action ?? 'DAG analysis';

      // Fetch current price for return-since-entry tracking
      let entryPrice: number | undefined;
      try {
        const q = await apiFetchQuote(currentTicker);
        entryPrice = q.price;
      } catch { /* optional */ }

      // Build a ReviewResult-shaped object from the DAG result so JournalPage
      // can render it without crashing. Field access in ReviewDrawer is guarded.
      const reviewShim = {
        ticker: currentTicker,
        review_type: 'dag_analysis',
        conclusion,
        why_triggered: '',
        bull_case: '',
        bear_case: '',
        risk_review: '',
        what_would_change_our_mind: '',
        next_review_trigger: '',
        // Attach the full result so history can display it later
        _dagResult: analysisResult,
      };

      const entry: JournalEntry = {
        id: uid(),
        ts: Date.now(),
        ticker: currentTicker,
        review_type: 'dag_analysis',
        conclusion,
        entry_price: entryPrice,
        review: reviewShim as Parameters<typeof appendJournal>[0]['review'],
      };
      appendJournal(entry);
    } catch {
      setDagJournalSaved(false); // allow retry on error
    }
  }, [analysisResult, currentTicker]);

  // ── Email this analysis report ──────────────────────────────────────────────
  const [emailState, setEmailState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [emailErr, setEmailErr] = useState<string>('');
  const [emailSmtpOk, setEmailSmtpOk] = useState<boolean | null>(null);

  React.useEffect(() => {
    fetchReportEmailStatus().then((s) => setEmailSmtpOk(s.smtp_configured)).catch(() => setEmailSmtpOk(false));
  }, []);

  // Reset the "已寄出 / sent" state whenever a new analysis starts, so a stale
  // sent-state from a previous ticker/run doesn't make a not-yet-emailed ticker
  // look already-sent. (Bug: AVGO showed 已寄出 carried over from a prior send.)
  React.useEffect(() => {
    if (running) { setEmailState('idle'); setEmailErr(''); }
  }, [running]);

  const handleEmailReport = React.useCallback(async (email: string) => {
    // Don't allow sending before the DAG has finished — the report would be
    // built from an incomplete analysisResult.
    if (!analysisResult || !currentTicker || !email || running) return;
    localStorage.setItem('qc-digest-email', email);
    // remember recent emails for autocomplete
    try {
      const recents: string[] = JSON.parse(localStorage.getItem('qc-email-history') || '[]');
      if (!recents.includes(email)) {
        localStorage.setItem('qc-email-history', JSON.stringify([email, ...recents].slice(0, 8)));
      }
    } catch { /* ignore */ }
    setEmailState('sending'); setEmailErr('');
    try {
      const res = await emailReport({
        ticker: currentTicker,
        trade_date: new Date().toISOString().slice(0, 10),
        result: analysisResult,
        email,
      });
      if (res.ok) setEmailState('sent');
      else { setEmailState('error'); setEmailErr(res.error || 'send failed'); }
    } catch (e) {
      setEmailState('error'); setEmailErr(e instanceof Error ? e.message : String(e));
    }
  }, [analysisResult, currentTicker, running]);

  // Derive a stable lookup map from current node state so edges can read
  // their source node's label/status/output without prop-drilling through RF.
  const nodeOutputById = useMemo<FlowEdgeData['nodeOutputById']>(() => {
    const map: FlowEdgeData['nodeOutputById'] = {};
    for (const n of nodes) {
      if (n.type !== 'agent') continue;
      const d = n.data as AgentNodeData;
      map[n.id] = {
        label:  d.label,
        status: d.nodeStatus ?? 'idle',
        output: d.nodeOutput,
      };
    }
    return map;
  }, [nodes]);

  // Inject nodeOutputById into every edge's data so FlowEdge can read it.
  // We do this as a derived memo over edges — RF's useEdgesState tracks identity
  // so this won't cause infinite loops.
  const enrichedEdges = useMemo<Edge[]>(
    () =>
      edges.map((e) => ({
        ...e,
        type: 'flow',
        data: { nodeOutputById } as unknown as Record<string, unknown>,
      })),
    // Deliberately depend on nodeOutputById (object reference changes when
    // node status changes) AND edges structure (topology changes).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [edges, nodeOutputById]
  );

  // Progress tracking
  const completedSteps = PROGRESS_STEPS.filter(
    (s) => analysisResult && analysisResult[s.key] !== undefined
  ).length;
  const progressPct = PROGRESS_STEPS.length > 0
    ? Math.round((completedSteps / PROGRESS_STEPS.length) * 100)
    : 0;

  const resultTabs: { id: ResultTabId; labelKey: string }[] = [
    { id: 'overview',    labelKey: 'dag.tabOverview' },
    { id: 'discussion',  labelKey: 'dag.tabDiscussion' },
    { id: 'summary',     labelKey: 'dag.tabSummary' },
    { id: 'history',     labelKey: 'dag.tabHistory' },
  ];

  return (
    <div className={styles.container}>
      <Header
        strategyName={strategyName}
        onSave={handleSave}
        onLoad={() => setShowLoadDialog(true)}
        onNew={handleNew}
        onRun={handleRun}
        saving={saving}
        running={running}
        ticker={headerTicker}
        onTickerChange={setHeaderTicker}
        riskStyle={riskStyle}
        onRiskStyleChange={setRiskStyle}
      />

      {/* ── Main view toggle bar ── */}
      <div className={styles.viewToggleBar}>
        <button
          className={`${styles.viewToggleBtn} ${viewMode === 'canvas' ? styles.viewToggleBtnActive : ''}`}
          onClick={() => setViewMode('canvas')}
          aria-pressed={viewMode === 'canvas'}
        >
          {/* dag.viewCanvas */}
          {t('dag.viewCanvas')}
        </button>
        <button
          className={`${styles.viewToggleBtn} ${viewMode === 'results' ? styles.viewToggleBtnActive : ''} ${!hasResults && !analysisError && !hasHistory ? styles.viewToggleBtnDisabled : ''}`}
          onClick={() => {
            if (hasResults || analysisError || hasHistory) {
              setViewMode('results');
              setShowCompleteBanner(false);
              // Auto-select History tab when there's no current analysis
              if (!hasResults && !analysisError && hasHistory) {
                setResultTab('history');
              }
            }
          }}
          aria-pressed={viewMode === 'results'}
          disabled={!hasResults && !analysisError && !hasHistory}
        >
          {/* dag.viewResults */}
          {t('dag.viewResults')}
          {hasResults && (
            <span className={styles.viewResultsDot} />
          )}
          {!hasResults && !analysisError && hasHistory && (
            <span className={styles.viewHistoryDot} />
          )}
        </button>

        {/* Running progress pill */}
        {running && (
          <div className={styles.runningPill} role="status" aria-label="Analysis running">
            <span className={styles.runningPulse} />
            <span className={styles.runningLabel}>{t('dag.running')}</span>
            <span className={styles.runningPct}>{progressPct}%</span>
          </div>
        )}

        {/* Ticker chip */}
        {currentTicker && (
          <span className={styles.tickerChip}>{currentTicker}</span>
        )}
      </div>

      {/* ── Running progress bar (thin strip under toggle bar) ── */}
      {running && (
        <div className={styles.streamProgressTrack} role="progressbar" aria-valuenow={progressPct}>
          <div className={styles.streamProgressFill} style={{ width: `${progressPct}%` }} />
        </div>
      )}

      {/* ── Canvas view ── */}
      <div className={`${styles.body} ${viewMode !== 'canvas' ? styles.bodyHidden : ''}`}>
        <NodePalette nodes={nodeRegistry} />
        <div className={styles.canvas} ref={reactFlowWrapper}>
          <ReactFlow
            nodes={nodes}
            edges={enrichedEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onInit={setRfInstance}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            deleteKeyCode={['Backspace', 'Delete']}
            proOptions={{ hideAttribution: true }}
            defaultEdgeOptions={{ type: 'flow', animated: false }}
            style={{ background: 'var(--bg-primary)' }}
          >
            <FitOnInit />
            <Controls
              showInteractive={false}
              style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
              }}
            />
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--text-muted)" />
          </ReactFlow>

          {/* Running progress overlay on canvas */}
          {running && (
            <div className={styles.canvasProgressOverlay}>
              <div className={styles.canvasProgressList}>
                {PROGRESS_STEPS.map((step) => {
                  const isDone = !!(analysisResult && analysisResult[step.key] !== undefined);
                  const isNext = !isDone && PROGRESS_STEPS.find((s) => !(analysisResult && analysisResult[s.key] !== undefined))?.key === step.key;
                  return (
                    <div
                      key={step.key}
                      className={`${styles.canvasProgressItem} ${isDone ? styles.canvasProgressDone : ''} ${isNext ? styles.canvasProgressActive : ''}`}
                    >
                      <span className={styles.canvasProgressDot}>
                        {isDone ? (
                          <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden="true">
                            <path d="M1 4L3 6L7 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        ) : isNext ? (
                          <span className={styles.progressPulse} />
                        ) : (
                          <span className={styles.progressDotEmpty} />
                        )}
                      </span>
                      <span className={styles.canvasProgressLabel}>
                        {t(step.labelKey) !== step.labelKey
                          ? t(step.labelKey)
                          : step.labelKey.split('.').pop()?.replace(/_/g, ' ')}
                      </span>
                      {isDone && <span className={styles.canvasProgressCheck}>✓</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Analysis complete banner */}
          {showCompleteBanner && !running && hasResults && (
            <button
              className={styles.completeBanner}
              onClick={() => {
                setViewMode('results');
                setShowCompleteBanner(false);
              }}
            >
              <span className={styles.completeBannerDot} />
              {/* dag.analysisComplete */}
              {t('dag.analysisComplete')}
              <span className={styles.completeBannerArrow}>→</span>
            </button>
          )}
        </div>

        {selectedNode && selectedNode.type === 'agent' && (
          <NodeConfigPanel
            nodeId={selectedNode.id}
            data={selectedNode.data as AgentNodeData}
            schema={nodeRegistry[(selectedNode.data as AgentNodeData).nodeType]}
            onUpdate={handleConfigUpdate}
            onClose={() => setSelectedNodeId(null)}
            onDelete={handleDeleteNode}
          />
        )}
      </div>

      {/* ── Results view ── */}
      {viewMode === 'results' && (
        <div className={styles.resultsView}>
          {/* Sub-tab bar */}
          <div className={styles.resultTabBar}>
            {resultTabs.map(({ id, labelKey }) => (
              <button
                key={id}
                className={`${styles.resultTabBtn} ${resultTab === id ? styles.resultTabBtnActive : ''}`}
                onClick={() => setResultTab(id)}
                aria-selected={resultTab === id}
              >
                {t(labelKey)}
              </button>
            ))}
            <div className={styles.resultTabBarSpacer} />
            {/* Error indicator */}
            {analysisError && (
              <span className={styles.resultTabError} title={sanitizeError(analysisError, t('result.quotaError'))}>
                {sanitizeError(analysisError, t('result.quotaError'))}
              </span>
            )}
          </div>

          {/* Tab content */}
          <div className={styles.resultTabContent}>
            {resultTab === 'overview' && hasResults && (
              <OverviewTab
                result={analysisResult!}
                ticker={currentTicker}
                t={t}
                onSaveToJournal={dagJournalSaved ? undefined : handleSaveDagToJournal}
                onEmailReport={handleEmailReport}
                emailState={emailState}
                emailErr={emailErr}
                emailSmtpOk={emailSmtpOk}
              />
            )}
            {resultTab === 'discussion' && hasResults && (
              <DiscussionTab result={analysisResult!} t={t} />
            )}
            {resultTab === 'summary' && hasResults && (
              <SummaryTab result={analysisResult!} ticker={currentTicker} t={t} />
            )}
            {resultTab === 'history' && (
              <HistoryTab
                history={history}
                t={t}
                onLoad={(entry) => {
                  setAnalysisResult(entry.result);
                  setCurrentTicker(entry.ticker);
                  setResultTab('overview');
                }}
                onDelete={(id) => {
                  setHistory((prev) => {
                    const updated = prev.filter((e) => e.id !== id);
                    saveHistory(updated);
                    return updated;
                  });
                }}
              />
            )}
            {/* No current results but not history tab → friendly hint */}
            {!hasResults && !analysisError && resultTab !== 'history' && (
              <div className={styles.resultNoCurrentHint}>
                <span className={styles.resultNoCurrentIcon}>◷</span>
                <p>{t('dag.noCurrentSeeHistory')}</p>
                <button
                  className={styles.resultNoCurrentBtn}
                  onClick={() => setResultTab('history')}
                >
                  {t('dag.tabHistory')} →
                </button>
              </div>
            )}
            {!hasResults && analysisError && resultTab !== 'history' && (
              <div className={styles.resultErrorFull}>
                {sanitizeError(analysisError, t('result.quotaError'))}
              </div>
            )}
          </div>
        </div>
      )}

      {showLoadDialog && (
        <LoadDialog
          onSelect={handleLoadStrategy}
          onClose={() => setShowLoadDialog(false)}
        />
      )}
    </div>
  );
}
