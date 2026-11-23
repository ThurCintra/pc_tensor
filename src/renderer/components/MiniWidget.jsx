import { ArrowsOut } from '@phosphor-icons/react';
import { isNum, tempLevel } from '../lib/format';

function Metric({ label, value, unit, level }) {
  return (
    <div className="mini-metric">
      <span>{label}</span>
      <b className={level === 'critical' || level === 'caution' ? level : undefined}>
        {isNum(value) ? `${Math.round(value)}${unit}` : '—'}
      </b>
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
        className="btn subtle icon"
        onClick={onExpand}
        title="Abrir janela completa"
        aria-label="Abrir janela completa"
      >
        <ArrowsOut size={14} />
      </button>
    </div>
  );
}
