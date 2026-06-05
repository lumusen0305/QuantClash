import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Cpu, ChevronDown } from 'lucide-react';
import { fetchModels } from '../../api/client';
import { useI18n } from '../../i18n/context';
import styles from './ModelSelector.module.css';

// ─── Context ──────────────────────────────────────────────────────────────────

interface ModelContextValue {
  model: string;
  setModel: (id: string) => void;
}

export const ModelContext = createContext<ModelContextValue>({
  model: '',
  setModel: () => {},
});

export function useModel() {
  return useContext(ModelContext);
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ModelInfo {
  id: string;
  name: string;
  status: 'available' | 'cooldown' | 'offline' | string;
  tier?: string;
}

const STORAGE_KEY = 'qc-model';

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ModelProvider({ children }: { children: ReactNode }) {
  const [model, setModelState] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY) ?? '';
  });

  const setModel = useCallback((id: string) => {
    setModelState(id);
    localStorage.setItem(STORAGE_KEY, id);
  }, []);

  return (
    <ModelContext.Provider value={{ model, setModel }}>
      {children}
    </ModelContext.Provider>
  );
}

// ─── Status dot ───────────────────────────────────────────────────────────────

function StatusDot({ status }: { status: string }) {
  const cls =
    status === 'available'
      ? styles.dotAvailable
      : status === 'cooldown'
        ? styles.dotCooldown
        : styles.dotOffline;
  return <span className={`${styles.dot} ${cls}`} />;
}

// ─── Selector component ───────────────────────────────────────────────────────

export function ModelSelector() {
  const { t } = useI18n();
  const { model, setModel } = useModel();

  const [models, setModels] = useState<ModelInfo[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const wrapRef = useRef<HTMLDivElement>(null);

  // ── Fetch models ──────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    fetchModels()
      .then((data) => {
        if (cancelled) return;
        setModels(data);

        // Default to first available model if nothing saved
        const saved = localStorage.getItem(STORAGE_KEY);
        if (!saved || !data.find((m) => m.id === saved)) {
          const first = data.find((m) => m.status === 'available') ?? data[0];
          if (first) setModel(first.id);
        }
      })
      .catch(() => {
        // API unavailable — silently degrade
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [setModel]);

  // ── Close on outside click ────────────────────────────────────────────────

  useEffect(() => {
    if (!open) return;

    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // ── Derived display name ──────────────────────────────────────────────────

  const current = models.find((m) => m.id === model);
  const displayName = current
    ? current.name
    : loading
      ? '…'
      : t('model.select');

  const currentStatus = current?.status ?? 'available';

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        className={`${styles.trigger} ${open ? styles.triggerOpen : ''}`}
        onClick={() => setOpen((v) => !v)}
        title={t('model.title')}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <Cpu size={12} className={styles.triggerIcon} />
        {current && <StatusDot status={currentStatus} />}
        <span className={styles.triggerLabel}>{displayName}</span>
        <ChevronDown
          size={11}
          className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`}
        />
      </button>

      {open && (
        <div className={styles.dropdown} role="listbox" aria-label={t('model.title')}>
          <div className={styles.dropdownHeader}>{t('model.title')}</div>

          {models.length === 0 && !loading && (
            <div className={styles.dropdownEmpty}>{t('model.select')}</div>
          )}

          {models.map((m) => (
            <button
              key={m.id}
              role="option"
              aria-selected={m.id === model}
              className={`${styles.dropdownItem} ${m.id === model ? styles.dropdownItemActive : ''} ${m.status === 'offline' ? styles.dropdownItemDisabled : ''}`}
              onClick={() => {
                if (m.status !== 'offline') {
                  setModel(m.id);
                  setOpen(false);
                }
              }}
              disabled={m.status === 'offline'}
            >
              <StatusDot status={m.status} />
              <span className={styles.itemName}>{m.name}</span>
              {m.tier === 'pro' && <span className={styles.proBadge}>PRO</span>}
              <span className={styles.itemStatus}>
                {m.status === 'available'
                  ? t('model.available')
                  : m.status === 'cooldown'
                    ? t('model.cooldown')
                    : t('model.offline')}
              </span>
              {m.id === model && (
                <span className={styles.itemCheck} aria-hidden>✓</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
