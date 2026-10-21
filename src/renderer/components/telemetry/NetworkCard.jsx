import React from 'react';
import { BentoCard } from '../ui/BentoCard';
import { Wifi, Activity, ArrowDownUp } from 'lucide-react';

const STATUS_COLOR_MAP = {
  EXCELLENT: 'var(--color-nominal)',
  GOOD: 'var(--color-accent)',
  FAIR: 'var(--color-elevated)',
  POOR: 'var(--color-critical)',
  DISCONNECTED: 'var(--text-muted)',
  MEASURING: 'var(--text-secondary)',
};

const STATUS_LABEL_MAP = {
  EXCELLENT: 'Excelente',
  GOOD: 'Estável',
  FAIR: 'Oscilando',
  POOR: 'Instável',
  DISCONNECTED: 'Sem Conexão',
  MEASURING: 'Medindo...',
};

export function NetworkCard({ network = null, className = '' }) {
  const latency = network?.latencyMs !== null && typeof network?.latencyMs === 'number'
    ? `${network.latencyMs.toFixed(0)} ms`
    : '--';
  const jitter = network?.jitterMs !== null && typeof network?.jitterMs === 'number'
    ? `${network.jitterMs.toFixed(1)} ms`
    : '--';
  const packetLoss = typeof network?.packetLossPercent === 'number'
    ? `${network.packetLossPercent.toFixed(0)}%`
    : '0%';

  const statusKey = network?.status || 'MEASURING';
  const statusColor = STATUS_COLOR_MAP[statusKey] || 'var(--color-nominal)';
  const statusLabel = STATUS_LABEL_MAP[statusKey] || statusKey;

  return (
    <BentoCard className={className} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '26px',
              height: '26px',
              borderRadius: 'var(--border-radius-sm)',
              background: 'var(--bg-inset)',
              border: '1px solid var(--border-hairline)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-accent)',
            }}
          >
            <Wifi size={14} />
          </div>
          <div>
            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              Latência & Rede
            </div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
              Sonda contínua de conexão
            </div>
          </div>
        </div>

        {/* Status Pill */}
        <span
          style={{
            fontSize: '0.72rem',
            fontWeight: 500,
            color: statusColor,
            background: 'var(--bg-inset)',
            border: '1px solid var(--border-hairline)',
            padding: '2px 8px',
            borderRadius: 'var(--border-radius-sm)',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
          }}
        >
          <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: statusColor }} />
          {statusLabel}
        </span>
      </div>

      {/* Grid de 3 Métricas Principais */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))',
          gap: '6px',
          marginTop: '2px',
        }}
      >
        {/* Ping / Latência */}
        <div style={{ background: 'var(--bg-inset)', border: '1px solid var(--border-hairline)', borderRadius: 'var(--border-radius-sm)', padding: '6px 8px' }}>
          <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', marginBottom: '2px' }}>
            Latência
          </div>
          <div style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
            {latency}
          </div>
        </div>

        {/* Jitter */}
        <div style={{ background: 'var(--bg-inset)', border: '1px solid var(--border-hairline)', borderRadius: 'var(--border-radius-sm)', padding: '6px 8px' }}>
          <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', marginBottom: '2px' }}>
            Jitter
          </div>
          <div style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
            {jitter}
          </div>
        </div>

        {/* Perda de Pacotes */}
        <div style={{ background: 'var(--bg-inset)', border: '1px solid var(--border-hairline)', borderRadius: 'var(--border-radius-sm)', padding: '6px 8px' }}>
          <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', marginBottom: '2px' }}>
            Perda Pct
          </div>
          <div
            style={{
              fontSize: '1.05rem',
              fontWeight: 600,
              color: network?.packetLossPercent > 0 ? 'var(--color-critical)' : 'var(--color-nominal)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {packetLoss}
          </div>
        </div>
      </div>

      {/* Alvo da Sonda */}
      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Alvo: <span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{network?.target || network?.host || '1.1.1.1 (Cloudflare)'}</span></span>
        <span>TCP 443</span>
      </div>
    </BentoCard>
  );
}
