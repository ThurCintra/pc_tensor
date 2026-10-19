import React from 'react';
import { BentoCard } from '../ui/BentoCard';
import { Wifi, Activity, ArrowDownUp } from 'lucide-react';

const STATUS_COLOR_MAP = {
  EXCELLENT: '#10B981',
  GOOD: '#00F0FF',
  FAIR: '#FF8A00',
  POOR: '#FF2A54',
  DISCONNECTED: '#6B7280',
  MEASURING: '#38BDF8',
};

const STATUS_LABEL_MAP = {
  EXCELLENT: 'Excelente',
  GOOD: 'Boa',
  FAIR: 'Oscilando',
  POOR: 'Instável',
  DISCONNECTED: 'Desconectado',
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
  const statusColor = STATUS_COLOR_MAP[statusKey] || '#10B981';
  const statusLabel = STATUS_LABEL_MAP[statusKey] || statusKey;

  return (
    <BentoCard className={className} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '8px',
              background: 'rgba(0, 240, 255, 0.08)',
              border: '1px solid rgba(0, 240, 255, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Wifi size={15} color="#00F0FF" />
          </div>
          <div>
            <div style={{ fontSize: '0.68rem', color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.6px', fontWeight: 600 }}>
              ESTABILIDADE & REDE
            </div>
            <div style={{ fontSize: '0.86rem', fontWeight: 700, color: '#F3F4F6' }}>
              Latência & Jitter
            </div>
          </div>
        </div>

        {/* Status Pill */}
        <span
          style={{
            fontSize: '0.7rem',
            fontWeight: 700,
            color: statusColor,
            background: 'rgba(17, 24, 39, 0.8)',
            border: `1px solid ${statusColor}44`,
            padding: '2px 8px',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: statusColor, boxShadow: `0 0 6px ${statusColor}` }} />
          {statusLabel}
        </span>
      </div>

      {/* Grid de 3 Métricas Principais */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: '8px',
          marginTop: '2px',
        }}
      >
        {/* Ping / Latência */}
        <div style={{ background: 'rgba(11, 15, 25, 0.65)', border: '1px solid #1F2937', borderRadius: '8px', padding: '8px 10px' }}>
          <div style={{ fontSize: '0.65rem', color: '#6B7280', textTransform: 'uppercase', marginBottom: '2px' }}>
            Latência (Ping)
          </div>
          <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#00F0FF', fontFamily: 'var(--font-mono)' }}>
            {latency}
          </div>
        </div>

        {/* Jitter */}
        <div style={{ background: 'rgba(11, 15, 25, 0.65)', border: '1px solid #1F2937', borderRadius: '8px', padding: '8px 10px' }}>
          <div style={{ fontSize: '0.65rem', color: '#6B7280', textTransform: 'uppercase', marginBottom: '2px' }}>
            Jitter (Var.)
          </div>
          <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#38BDF8', fontFamily: 'var(--font-mono)' }}>
            {jitter}
          </div>
        </div>

        {/* Perda de Pacotes */}
        <div style={{ background: 'rgba(11, 15, 25, 0.65)', border: '1px solid #1F2937', borderRadius: '8px', padding: '8px 10px' }}>
          <div style={{ fontSize: '0.65rem', color: '#6B7280', textTransform: 'uppercase', marginBottom: '2px' }}>
            Perda de Pcts
          </div>
          <div
            style={{
              fontSize: '1.05rem',
              fontWeight: 700,
              color: network?.packetLossPercent > 0 ? '#FF2A54' : '#10B981',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {packetLoss}
          </div>
        </div>
      </div>

      {/* Destino de Verificação */}
      <div style={{ fontSize: '0.68rem', color: '#6B7280', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Alvo de Sonda: <span style={{ color: '#9CA3AF', fontFamily: 'var(--font-mono)' }}>{network?.target || network?.host || '1.1.1.1 (Cloudflare)'}</span></span>
        <span>TCP Probe 443</span>
      </div>
    </BentoCard>
  );
}
