import React from 'react';
import { Maximize2 } from 'lucide-react';
import { NumberTicker } from '../ui/NumberTicker';

export function MiniWidget({
  cpuTemp = null,
  gpuTemp = null,
  ramPercent = 0,
  cpuLimit = 85,
  gpuLimit = 85,
  onExpand,
}) {
  const hasCpu = typeof cpuTemp === 'number';
  const hasGpu = typeof gpuTemp === 'number';
  const cpuCritical = hasCpu && cpuTemp >= cpuLimit;
  const gpuCritical = hasGpu && gpuTemp >= gpuLimit;
  const isCritical = cpuCritical || gpuCritical;
  const isWarning = !isCritical && ((hasCpu && cpuTemp >= cpuLimit - 14) || (hasGpu && gpuTemp >= gpuLimit - 14));

  const statusColor = !hasCpu && !hasGpu
    ? 'var(--text-muted)'
    : isCritical
    ? 'var(--color-critical)'
    : isWarning
    ? 'var(--color-elevated)'
    : 'var(--color-nominal)';

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '6px 10px',
        background: 'var(--bg-base)',
      }}
    >
      <div
        className="mini-widget-bar"
        style={{
          border: '1px solid var(--border-subtle)',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.5)',
        }}
      >
        {/* Ponto Indicador de Estado */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: statusColor,
            }}
          />
          <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.04em' }}>
            SENTINEL
          </span>
        </div>

        {/* Métricas Principais em Linha Única */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '0.82rem',
            color: 'var(--text-primary)',
          }}
          className="tabular-nums"
        >
          <div>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.68rem', marginRight: '4px' }}>CPU</span>
            <strong style={{ color: cpuCritical ? 'var(--color-critical)' : 'var(--text-primary)' }}>
              {hasCpu ? <><NumberTicker value={Math.round(cpuTemp)} />°</> : '--'}
            </strong>
          </div>

          <span style={{ color: 'var(--border-hairline)' }}>|</span>

          <div>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.68rem', marginRight: '4px' }}>GPU</span>
            <strong style={{ color: gpuCritical ? 'var(--color-critical)' : 'var(--text-primary)' }}>
              {hasGpu ? <><NumberTicker value={Math.round(gpuTemp)} />°</> : '--'}
            </strong>
          </div>

          <span style={{ color: 'var(--border-hairline)' }}>|</span>

          <div>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.68rem', marginRight: '4px' }}>RAM</span>
            <strong style={{ color: 'var(--text-primary)' }}>{Math.round(ramPercent)}%</strong>
          </div>
        </div>

        {/* Botão de Expandir de volta para o Dashboard */}
        <button
          onClick={onExpand}
          className="mini-widget-action"
          title="Expandir para o console completo"
          style={{
            background: 'var(--bg-inset)',
            border: '1px solid var(--border-hairline)',
            borderRadius: 'var(--border-radius-sm)',
            color: 'var(--text-secondary)',
            padding: '4px 6px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '0.7rem',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--text-primary)';
            e.currentTarget.style.borderColor = 'var(--border-active)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--text-secondary)';
            e.currentTarget.style.borderColor = 'var(--border-hairline)';
          }}
        >
          <Maximize2 size={12} />
        </button>
      </div>
    </div>
  );
}
