import { X } from 'lucide-react';
import type { NodeInfo } from '../../api/client';
import type { AgentNodeData } from './AgentNode';
import styles from './NodeConfigPanel.module.css';

interface NodeConfigPanelProps {
  nodeId: string;
  data: AgentNodeData;
  schema: NodeInfo | undefined;
  onUpdate: (nodeId: string, config: Record<string, unknown>) => void;
  onClose: () => void;
  onDelete: (nodeId: string) => void;
}

export function NodeConfigPanel({ nodeId, data, schema, onUpdate, onClose, onDelete }: NodeConfigPanelProps) {
  const config = data.config || {};
  const configSchema = schema?.config_schema || {};

  const handleChange = (key: string, value: unknown) => {
    onUpdate(nodeId, { ...config, [key]: value });
  };

  return (
    <aside className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>{data.label}</span>
        <button className={styles.closeBtn} onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      <div className={styles.section}>
        <label className={styles.label}>Type</label>
        <div className={styles.value}>{data.nodeType}</div>
      </div>

      <div className={styles.section}>
        <label className={styles.label}>Description</label>
        <div className={styles.desc}>{data.description}</div>
      </div>

      {schema?.input_keys && schema.input_keys.length > 0 && (
        <div className={styles.section}>
          <label className={styles.label}>Inputs</label>
          <div className={styles.keys}>
            {schema.input_keys.map((k) => (
              <span key={k} className={styles.key}>{k}</span>
            ))}
          </div>
        </div>
      )}

      {schema?.output_keys && schema.output_keys.length > 0 && (
        <div className={styles.section}>
          <label className={styles.label}>Outputs</label>
          <div className={styles.keys}>
            {schema.output_keys.map((k) => (
              <span key={k} className={styles.key}>{k}</span>
            ))}
          </div>
        </div>
      )}

      <div className={styles.divider} />

      {Object.entries(configSchema).map(([key, field]) => (
        <div key={key} className={styles.section}>
          <label className={styles.label}>{key.replace(/_/g, ' ')}</label>
          {field.type === 'text' ? (
            <textarea
              className={styles.textarea}
              value={(config[key] as string) ?? field.default ?? ''}
              onChange={(e) => handleChange(key, e.target.value)}
              placeholder={`Custom ${key}...`}
              rows={4}
            />
          ) : field.options ? (
            <select
              value={(config[key] as string) ?? field.default}
              onChange={(e) => handleChange(key, e.target.value)}
            >
              {field.options.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          ) : (
            <input
              type={field.type === 'number' ? 'number' : 'text'}
              value={(config[key] as string) ?? field.default ?? ''}
              onChange={(e) => handleChange(key, field.type === 'number' ? Number(e.target.value) : e.target.value)}
            />
          )}
        </div>
      ))}

      <div className={styles.divider} />

      <button className={styles.deleteBtn} onClick={() => onDelete(nodeId)}>
        Delete Node
      </button>
    </aside>
  );
}
