import React from 'react';
import { Maximize2 } from 'lucide-react';
import { NumberTicker } from '../ui/NumberTicker';

export function MiniWidget({
  cpuTemp = 42,
  gpuTemp = 45,
  ramPercent = 48,
  onExpand,
}) {
  const maxTemp = Math.max(cpuTemp, gpuTemp);
  const statusColor = maxTemp >= 76 ? '#FF2A54' : maxTemp >= 56 ? '#FF8A00' : '#00F0FF';

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '6px 10px',
        background: '#0B0F19',
      }}
    >
      <div
        className="mini-widget-bar"
        style={{
          borderColor: statusColor,
          boxShadow: `0 0 16px ${statusColor}33`,
        }}
      >
        {/* Ponto Luminoso de Estado */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: statusColor,
              boxShadow: `0 0 10px ${statusColor}`,
            }}
          />
          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#9CA3AF', letterSpacing: '0.5px' }}>
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
            color: '#F3F4F6',
          }}
          className="tabular-nums"
        >
          <div>
            <span style={{ color: '#6B7280', fontSize: '0.68rem', marginRight: '3px' }}>CPU</span>
            <strong style={{ color: cpuTemp >= 76 ? '#FF2A54' : '#F3F4F6' }}>
              <NumberTicker value={Math.round(cpuTemp)} />°
            </strong>
          </div>

          <span style={{ color: 'rgba(255, 255, 255, 0.15)' }}>|</span>

          <div>
            <span style={{ color: '#6B7280', fontSize: '0.68rem', marginRight: '3px' }}>GPU</span>
            <strong style={{ color: gpuTemp >= 76 ? '#FF2A54' : '#F3F4F6' }}>
              <NumberTicker value={Math.round(gpuTemp)} />°
            </strong>
          </div>

          <span style={{ color: 'rgba(255, 255, 255, 0.15)' }}>|</span>

          <div>
            <span style={{ color: '#6B7280', fontSize: '0.68rem', marginRight: '3px' }}>RAM</span>
            <strong style={{ color: '#10B981' }}>{Math.round(ramPercent)}%</strong>
          </div>
        </div>

        {/* Botão de Expandir de volta para o Dashboard */}
        <button
          onClick={onExpand}
          className="mini-widget-action"
          title="Expandir para Dashboard Completo"
          style={{
            background: 'rgba(255, 255, 255, 0.08)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '6px',
            color: '#9CA3AF',
            padding: '4px 6px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '0.7rem',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = '#00F0FF';
            e.currentTarget.style.borderColor = '#00F0FF';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = '#9CA3AF';
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.12)';
          }}
        >
          <Maximize2 size={13} />
        </button>
      </div>
    </div>
  );
}
