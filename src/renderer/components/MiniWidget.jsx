import { Maximize2 } from 'lucide-react';
import { isNum, tempLevel } from '../lib/format';

const LEVEL_COLOR = { critical: 'var(--critical)', caution: 'var(--caution)' };

function Metric({ label, value, unit, level }) {
  return (
    <div className="mini-metric">
      <span>{label}</span>
      <b style={{ color: LEVEL_COLOR[level] }}>{isNum(value) ? `${Math.round(value)}${unit}` : '—'}</b>
    </div>
  );
}

/** Barra compacta sempre visível (janela pequena e arrastável). */
export function MiniWidget({ metrics, onExpand }) {
  const t = metrics?.temperatures || {};
  const limits = metrics?.alerts?.thresholds || { cpuTempC: 85, gpuTempC: 85 };
  return (
    <div className="mini">
      <Metric label="CPU" value={t.cpuMain} unit="°" level={tempLevel(t.cpuMain, limits.cpuTempC)} />
      <Metric label="GPU" value={t.gpu} unit="°" level={tempLevel(t.gpu, limits.gpuTempC)} />
      <Metric label="RAM" value={metrics?.memory?.percentUsed} unit="%" />
      <button
        className="btn subtle"
        onClick={onExpand}
        title="Abrir janela completa"
        aria-label="Abrir janela completa"
        style={{ marginLeft: 'auto' }}
      >
        <Maximize2 size={14} />
      </button>
    </div>
  );
}
