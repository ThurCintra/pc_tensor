import React, { useState } from 'react';
import { BentoCard } from '../ui/BentoCard';
import { NumberTicker } from '../ui/NumberTicker';
import { Flame, Cpu, Activity, ArrowUpRight } from 'lucide-react';

export function ThermalHeroGauge({
  cpuTemp = 42,
  gpuTemp = 45,
  cpuMax = 46,
  gpuMax = 48,
  cpuModel = 'AMD / Intel Processor',
  gpuModel = 'GPU Telemetry',
  isEstimated = false,
  isCpuEstimated = undefined,
  isGpuEstimated = undefined,
  className = '',
}) {
  const [selectedTarget, setSelectedTarget] = useState('CPU'); // 'CPU' | 'GPU'

  const currentTemp = selectedTarget === 'CPU' ? cpuTemp : gpuTemp;
  const currentMax = selectedTarget === 'CPU' ? cpuMax : gpuMax;
  const currentModel = selectedTarget === 'CPU' ? cpuModel : gpuModel;
  const currentIsEstimated = selectedTarget === 'CPU'
    ? (typeof isCpuEstimated === 'boolean' ? isCpuEstimated : isEstimated)
    : (typeof isGpuEstimated === 'boolean' ? isGpuEstimated : isEstimated);

  // Estado Térmico Semântico
  const status = currentTemp >= 76 ? 'critical' : currentTemp >= 56 ? 'warning' : 'stable';

  // Cores dinâmicas
  const colors = {
    stable: {
      primary: '#00F0FF',
      secondary: '#10B981',
      glow: 'rgba(0, 240, 255, 0.35)',
      gradientId: 'hero-grad-stable',
    },
    warning: {
      primary: '#FF8A00',
      secondary: '#FFB703',
      glow: 'rgba(255, 138, 0, 0.45)',
      gradientId: 'hero-grad-warning',
    },
    critical: {
      primary: '#FF2A54',
      secondary: '#FF0055',
      glow: 'rgba(255, 42, 84, 0.65)',
      gradientId: 'hero-grad-critical',
    },
  }[status];

  // Geometria Donut Radial
  const size = 220;
  const strokeWidth = 14;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  // Mapeia 25°C - 95°C
  const normalized = Math.max(0, Math.min(1, (currentTemp - 25) / 70));
  const dashoffset = circumference * (1 - normalized);

  return (
    <BentoCard
      isCritical={status === 'critical'}
      status={status}
      className={className || 'bento-col-4'}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        minHeight: '340px',
      }}
    >
      {/* Topo do Cartão: Toggle Rápido CPU / GPU */}
      <div
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '8px',
          flexWrap: 'wrap',
          gap: '6px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Flame size={16} color={colors.primary} />
          <span style={{ fontSize: '0.8rem', fontWeight: 600, letterSpacing: '0.5px', color: '#9CA3AF' }}>
            CORAÇÃO TÉRMICO
          </span>
        </div>

        {/* Pill Selector CPU / GPU */}
        <div
          style={{
            display: 'inline-flex',
            background: 'rgba(255, 255, 255, 0.05)',
            borderRadius: '9999px',
            padding: '2px',
            border: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <button
            onClick={() => setSelectedTarget('CPU')}
            style={{
              background: selectedTarget === 'CPU' ? 'rgba(0, 240, 255, 0.18)' : 'transparent',
              color: selectedTarget === 'CPU' ? '#00F0FF' : '#6B7280',
              border: selectedTarget === 'CPU' ? '1px solid rgba(0, 240, 255, 0.35)' : '1px solid transparent',
              borderRadius: '9999px',
              padding: '3px 10px',
              fontSize: '0.72rem',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            CPU
          </button>
          <button
            onClick={() => setSelectedTarget('GPU')}
            style={{
              background: selectedTarget === 'GPU' ? 'rgba(0, 240, 255, 0.18)' : 'transparent',
              color: selectedTarget === 'GPU' ? '#00F0FF' : '#6B7280',
              border: selectedTarget === 'GPU' ? '1px solid rgba(0, 240, 255, 0.35)' : '1px solid transparent',
              borderRadius: '9999px',
              padding: '3px 10px',
              fontSize: '0.72rem',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            GPU
          </button>
        </div>
      </div>

      {/* Donut SVG Centralizado */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: `${size}px`,
          aspectRatio: '1 / 1',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: 'auto 0',
        }}
      >
        <svg
          viewBox={`0 0 ${size} ${size}`}
          style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}
        >
          <defs>
            <linearGradient id="hero-grad-stable" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#00F0FF" />
              <stop offset="100%" stopColor="#10B981" />
            </linearGradient>
            <linearGradient id="hero-grad-warning" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FF8A00" />
              <stop offset="100%" stopColor="#FFB703" />
            </linearGradient>
            <linearGradient id="hero-grad-critical" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FF2A54" />
              <stop offset="100%" stopColor="#FF0055" />
            </linearGradient>
            <filter id="hero-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor={colors.glow} />
            </filter>
          </defs>

          {/* Trilha de fundo */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="rgba(255, 255, 255, 0.06)"
            strokeWidth={strokeWidth}
          />

          {/* Arco Dinâmico de Progresso */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={`url(#${colors.gradientId})`}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={dashoffset}
            strokeLinecap="round"
            filter="url(#hero-glow)"
            style={{
              transition: 'stroke-dashoffset 0.6s cubic-bezier(0.16, 1, 0.3, 1), stroke 0.4s ease',
            }}
          />
        </svg>

        {/* Mostrador Central Gigante */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            pointerEvents: 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', lineHeight: 1 }}>
            <span
              style={{
                fontSize: '3.6rem',
                fontWeight: 700,
                color: '#F3F4F6',
                letterSpacing: '-1.5px',
              }}
            >
              <NumberTicker value={Math.round(currentTemp)} />
            </span>
            <span
              style={{
                fontSize: '1.4rem',
                fontWeight: 600,
                color: colors.primary,
                marginLeft: '2px',
                fontFamily: 'var(--font-mono)',
              }}
            >
              °C
            </span>
          </div>

          <div
            style={{
              marginTop: '4px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span
              style={{
                fontSize: '0.68rem',
                fontWeight: 600,
                color: '#6B7280',
                letterSpacing: '0.5px',
              }}
            >
              MÁX: <strong style={{ color: '#9CA3AF' }}>{Math.round(currentMax)}°C</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Rodapé do Cartão Hero */}
      <div
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderTop: '1px solid var(--border-subtle)',
          paddingTop: '10px',
          marginTop: '6px',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', maxWidth: '65%' }}>
          <span
            style={{
              fontSize: '0.74rem',
              color: '#9CA3AF',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              fontWeight: 500,
            }}
          >
            {currentModel}
          </span>
          <span style={{ fontSize: '0.65rem', color: '#6B7280' }}>
            {currentIsEstimated ? 'Modelo Térmico Dinâmico' : (status === 'critical' ? 'Sob Carga Crítica' : status === 'warning' ? 'Carga Elevada' : 'Arrefecimento Ideal')}
          </span>
        </div>

        <span
          title={currentIsEstimated ? 'Temperatura estimada dinamicamente com base na carga e inércia térmica' : 'Sensor físico de hardware coletado em tempo real'}
          style={{
            fontSize: '0.62rem',
            padding: '2px 7px',
            borderRadius: '6px',
            background: currentIsEstimated ? 'rgba(0, 240, 255, 0.1)' : 'rgba(16, 185, 129, 0.1)',
            color: currentIsEstimated ? '#00F0FF' : '#10B981',
            border: currentIsEstimated ? '1px solid rgba(0, 240, 255, 0.25)' : '1px solid rgba(16, 185, 129, 0.25)',
            fontWeight: 700,
            letterSpacing: '0.5px',
          }}
        >
          {currentIsEstimated ? 'ESTIMADO' : 'SENSOR REAL'}
        </span>
      </div>
    </BentoCard>
  );
}
