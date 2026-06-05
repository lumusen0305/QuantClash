import { Suspense, lazy, useEffect, useState, useCallback, useRef } from 'react';
import { Sun, Moon, Globe, HelpCircle, MoreHorizontal } from 'lucide-react';
import { ModelSelector, useModel } from './components/settings/ModelSelector';
import { DagEditor } from './components/dag/DagEditor';
import { BacktestPage } from './pages/BacktestPage';
import { PortfolioPage } from './pages/PortfolioPage';
import { DiscoveryPage } from './pages/DiscoveryPage';
import { CommunityPage } from './pages/CommunityPage';
import { WorkspacePage } from './pages/WorkspacePage';
import { AssetGraphPage } from './pages/AssetGraphPage';
import { JournalPage } from './pages/JournalPage';
import { UsagePage } from './pages/UsagePage';
import Onboarding from './components/onboarding/Onboarding';
import { seedDefaultWatchlistIfFirstRun } from './lib/workspace';
import { fetchNodes, createStrategy, type NodeInfo, type StrategyResponse } from './api/client';
import { useI18n } from './i18n/context';
import { useTheme } from './theme/context';
import styles from './App.module.css';

const ChartPage = lazy(() => import('./pages/ChartPage').then((m) => ({ default: m.ChartPage })));

type Page =
  | 'workspace'
  | 'chart'
  | 'editor'
  | 'backtest'
  | 'portfolio'
  | 'assets'
  | 'journal'
  | 'discover'
  | 'community'
  | 'usage';

// Primary tabs always visible in the nav bar
const PRIMARY_PAGES: Page[] = ['workspace', 'discover', 'portfolio', 'chart'];

// Pages that live in the "⋯ More" dropdown
const MORE_PAGES: Page[] = ['assets', 'journal', 'community', 'editor', 'backtest'];

// Usage/diagnostics live under a "Settings" subheading in the dropdown
const SETTINGS_PAGES: Page[] = ['usage'];

interface NodeDef {
  category: string;
  config_schema: Record<string, { type: string; default: string | number; options?: string[] }>;
  input_keys: string[];
  output_keys: string[];
}

const NODE_DEFS: Record<string, NodeDef> = {
  market_analyst: { category: 'analysts', config_schema: { lookback_period: { type: 'string', default: '6mo', options: ['1mo', '3mo', '6mo', '1y'] }, custom_prompt: { type: 'text', default: '' } }, input_keys: [], output_keys: ['market_report'] },
  sentiment_analyst: { category: 'analysts', config_schema: { sources: { type: 'string', default: 'all', options: ['reddit', 'twitter', 'all'] }, custom_prompt: { type: 'text', default: '' } }, input_keys: [], output_keys: ['sentiment_report'] },
  news_analyst: { category: 'analysts', config_schema: { lookback_days: { type: 'number', default: 7 }, custom_prompt: { type: 'text', default: '' } }, input_keys: [], output_keys: ['news_report'] },
  fundamentals_analyst: { category: 'analysts', config_schema: { focus: { type: 'string', default: 'all', options: ['value', 'growth', 'all'] }, custom_prompt: { type: 'text', default: '' } }, input_keys: [], output_keys: ['fundamentals_report'] },
  macro_analyst: { category: 'analysts', config_schema: { custom_prompt: { type: 'text', default: '' } }, input_keys: [], output_keys: ['macro_report'] },
  market_research_analyst: { category: 'analysts', config_schema: { custom_prompt: { type: 'text', default: '' } }, input_keys: [], output_keys: ['market_research_report'] },
  bull_researcher: { category: 'debaters', config_schema: { custom_prompt: { type: 'text', default: '' } }, input_keys: ['market_report', 'sentiment_report', 'news_report', 'fundamentals_report', 'macro_report'], output_keys: ['bull_arguments'] },
  bear_researcher: { category: 'debaters', config_schema: { custom_prompt: { type: 'text', default: '' } }, input_keys: ['market_report', 'sentiment_report', 'news_report', 'fundamentals_report', 'macro_report'], output_keys: ['bear_arguments'] },
  research_manager: { category: 'managers', config_schema: { custom_prompt: { type: 'text', default: '' } }, input_keys: ['bull_arguments', 'bear_arguments'], output_keys: ['research_verdict'] },
  trader: { category: 'managers', config_schema: { custom_prompt: { type: 'text', default: '' } }, input_keys: ['research_verdict'], output_keys: ['trader_plan'] },
  aggressive_risk: { category: 'debaters', config_schema: { custom_prompt: { type: 'text', default: '' } }, input_keys: ['trader_plan'], output_keys: ['risk_debate'] },
  conservative_risk: { category: 'debaters', config_schema: { custom_prompt: { type: 'text', default: '' } }, input_keys: ['trader_plan'], output_keys: ['risk_debate'] },
  neutral_risk: { category: 'debaters', config_schema: { custom_prompt: { type: 'text', default: '' } }, input_keys: ['trader_plan'], output_keys: ['risk_debate'] },
  portfolio_manager: { category: 'managers', config_schema: { style: { type: 'string', default: 'balanced', options: ['conservative', 'balanced', 'aggressive'] }, custom_prompt: { type: 'text', default: '' } }, input_keys: ['research_verdict', 'risk_verdict'], output_keys: ['final_decision'] },
};

function buildLocalizedNodes(t: (key: string) => string): Record<string, NodeInfo> {
  const result: Record<string, NodeInfo> = {};
  for (const [key, def] of Object.entries(NODE_DEFS)) {
    result[key] = {
      name: t(`node.${key}`),
      description: t(`node.${key}.desc`),
      category: def.category,
      config_schema: def.config_schema,
      input_keys: def.input_keys,
      output_keys: def.output_keys,
    };
  }
  return result;
}

export default function App() {
  const [page, setPage] = useState<Page>('workspace');
  const [editorTicker, setEditorTicker] = useState<string | null>(null);
  const { model } = useModel();
  const { t, locale, setLocale } = useI18n();
  const { theme, toggleTheme } = useTheme();
  const localizedNodes = buildLocalizedNodes(t);
  const [nodeRegistry, setNodeRegistry] = useState<Record<string, NodeInfo>>(localizedNodes);

  // More-menu open state + click-outside close
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const navigate = useCallback((p: string) => {
    setPage(p as Page);
    setMoreOpen(false);
  }, []);

  const handleAnalyzeTicker = useCallback((ticker: string) => {
    setEditorTicker(ticker);
    setPage('editor');
  }, []);

  const [chartTicker, setChartTicker] = useState<string | null>(null);
  const handleViewChart = useCallback((ticker: string) => {
    setChartTicker(ticker);
    setPage('chart');
  }, []);

  const [showOnboarding, setShowOnboarding] = useState(() => {
    seedDefaultWatchlistIfFirstRun(locale);
    try {
      return localStorage.getItem('qc-onboarded') !== 'true';
    } catch {
      return false;
    }
  });

  const markOnboarded = useCallback(() => {
    try { localStorage.setItem('qc-onboarded', 'true'); } catch { /* ignore */ }
  }, []);

  const closeOnboarding = useCallback(() => {
    markOnboarded();
    setShowOnboarding(false);
  }, [markOnboarded]);

  const completeOnboarding = useCallback(() => {
    markOnboarded();
    setShowOnboarding(false);
    setPage('workspace');
  }, [markOnboarded]);

  useEffect(() => {
    setNodeRegistry(buildLocalizedNodes(t));
  }, [locale, t]);

  useEffect(() => {
    fetchNodes()
      .then((data) => {
        const merged: Record<string, NodeInfo> = {};
        for (const [key, info] of Object.entries(data.nodes)) {
          merged[key] = {
            ...info,
            name: t(`node.${key}`) !== `node.${key}` ? t(`node.${key}`) : info.name,
            description: t(`node.${key}.desc`) !== `node.${key}.desc` ? t(`node.${key}.desc`) : info.description,
          };
        }
        setNodeRegistry(merged);
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);

  const handleSave = async (data: { name: string; description: string; nodes: { id: string; type: string; config: Record<string, unknown> }[]; edges: { from: string; to: string }[] }) => {
    await createStrategy({
      name: data.name,
      description: data.description,
      dag_config: { nodes: data.nodes, edges: data.edges },
    });
  };

  const handleOpenStrategy = (_strategy: StrategyResponse) => {
    setPage('editor');
  };

  // Active page is in the "More" or "Settings" group
  const pageInMore = (MORE_PAGES as Page[]).includes(page) || (SETTINGS_PAGES as Page[]).includes(page);

  const pageLabel = (p: Page): string => {
    const keyMap: Record<Page, string> = {
      workspace: 'nav.workspace',
      chart: 'nav.chart',
      editor: 'nav.editor',
      backtest: 'nav.backtest',
      portfolio: 'nav.portfolio',
      assets: 'nav.assets',
      journal: 'nav.journal',
      discover: 'nav.discover',
      community: 'nav.community',
      usage: 'nav.usage',
    };
    return t(keyMap[p]);
  };

  return (
    <div className={styles.app}>
      <nav className={styles.nav}>
        <span className={styles.logo}>QuantClash</span>

        <div className={styles.navTabs}>
          {/* ── Primary tabs ── */}
          {PRIMARY_PAGES.map((p) => (
            <button
              key={p}
              className={`${styles.navBtn} ${page === p ? styles.active : ''}`}
              onClick={() => navigate(p)}
            >
              {pageLabel(p)}
            </button>
          ))}

          {/* ── ⋯ More dropdown ── */}
          <div className={styles.moreWrap} ref={moreRef}>
            <button
              className={`${styles.navBtn} ${styles.moreBtn} ${pageInMore ? styles.active : ''}`}
              onClick={() => setMoreOpen((v) => !v)}
              aria-haspopup="true"
              aria-expanded={moreOpen}
            >
              <MoreHorizontal size={14} />
              <span>{t('nav.more')}</span>
            </button>

            {moreOpen && (
              <div className={styles.moreMenu} role="menu">
                {MORE_PAGES.map((p) => (
                  <button
                    key={p}
                    className={`${styles.moreMenuItem} ${page === p ? styles.moreMenuItemActive : ''}`}
                    onClick={() => navigate(p)}
                    role="menuitem"
                  >
                    {pageLabel(p)}
                  </button>
                ))}

                <div className={styles.moreMenuDivider} />
                <div className={styles.moreMenuSubhead}>{t('nav.settings')}</div>
                {SETTINGS_PAGES.map((p) => (
                  <button
                    key={p}
                    className={`${styles.moreMenuItem} ${page === p ? styles.moreMenuItemActive : ''}`}
                    onClick={() => navigate(p)}
                    role="menuitem"
                  >
                    {pageLabel(p)}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className={styles.navSpacer} />

        <div className={styles.navActions}>
          <ModelSelector />
          <button
            className={styles.iconBtn}
            onClick={() => setShowOnboarding(true)}
            aria-label={t('onb.help')}
            title={t('onb.help')}
          >
            <HelpCircle size={15} />
          </button>
          <button
            className={styles.iconBtn}
            onClick={() => setLocale(locale === 'en' ? 'zh-TW' : 'en')}
            title={locale === 'en' ? '切換到中文' : 'Switch to English'}
          >
            <Globe size={15} />
            <span className={styles.iconLabel}>{locale === 'en' ? 'EN' : '中'}</span>
          </button>
          <button
            className={styles.iconBtn}
            onClick={toggleTheme}
            title={theme === 'dark' ? t('theme.light') : t('theme.dark')}
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </div>
      </nav>

      <div className={styles.content}>
        {page === 'workspace' && <WorkspacePage onNavigate={navigate} />}
        {page === 'assets' && <AssetGraphPage />}
        {page === 'journal' && <JournalPage onNavigate={navigate} />}
        {page === 'usage' && <UsagePage />}
        <div style={{ display: page === 'chart' ? 'contents' : 'none' }}>
          <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)' }}>{t('chart.loading')}</div>}>
            <ChartPage initialTicker={chartTicker} onTickerConsumed={() => setChartTicker(null)} onAnalyze={handleAnalyzeTicker} />
          </Suspense>
        </div>
        <div style={{ display: page === 'editor' ? 'contents' : 'none' }}>
          <DagEditor nodeRegistry={nodeRegistry} onSave={handleSave} initialTicker={editorTicker} model={model} onTickerConsumed={() => setEditorTicker(null)} />
        </div>
        <div style={{ display: page === 'backtest' ? 'contents' : 'none' }}>
          <BacktestPage />
        </div>
        <div style={{ display: page === 'portfolio' ? 'contents' : 'none' }}>
          <PortfolioPage onAnalyze={handleAnalyzeTicker} />
        </div>
        <div style={{ display: page === 'discover' ? 'contents' : 'none' }}>
          <DiscoveryPage onSelectTicker={handleViewChart} />
        </div>
        <div style={{ display: page === 'community' ? 'contents' : 'none' }}>
          <CommunityPage onOpenStrategy={handleOpenStrategy} />
        </div>
      </div>

      {showOnboarding && (
        <Onboarding onClose={closeOnboarding} onComplete={completeOnboarding} />
      )}
    </div>
  );
}
