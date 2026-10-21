import React from 'react';
import { BentoCard } from '../ui/BentoCard';
import { NumberTicker } from '../ui/NumberTicker';
import { Wind } from 'lucide-react';

/**
 * Ícone Vetorial Técnico de Rotor / Propeller Mecânico
 */
function PropellerSvg({ size = 26, color = 'var(--text-secondary)', isSpinning = true, duration = '1.2s' }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          animation: isSpinning ? `fanSpin ${duration} linear infinite` : 'none',
          transformOrigin: '12px 12px',
        }}
      >
        <circle cx="12" cy="12" r="2.5" fill={color} />
        <path d="M12 9.5 C12 5, 15.5 4, 15.5 4 C15.5 4, 15.5 7.5, 12 9.5" fill={color} fillOpacity="0.15" />
        <path d="M14.5 12 C19 12, 20 15.5, 20 15.5 C20 15.5, 16.5 15.5, 14.5 12" fill={color} fillOpacity="0.15" />
        <path d="M12 14.5 C12 19, 8.5 20, 8.5 20 C8.5 20, 8.5 16.5, 12 14.5" fill={color} fillOpacity="0.15" />
        <path d="M9.5 12 C5 12, 4 8.5, 4 8.5 C4 8.5, 7.5 8.5, 9.5 12" fill={color} fillOpacity="0.15" />
      </svg>
    </div>
  );
}

export function FanSpeedCard({
  rpm = 1250,
  pwmPercent = 52,
  className = '',
}) {
  const isSpinning = rpm > 0;

  let durationSeconds = 1.4;
  if (rpm <= 0) {
    durationSeconds = 0;
  } else if (rpm <= 800) {
    durationSeconds = 1.8;
  } else if (rpm >= 2500) {
    durationSeconds = 0.35;
  } else {
    const ratio = (rpm - 800) / (2500 - 800);
    durationSeconds = Number((1.8 - ratio * (1.8 - 0.35)).toFixed(2));
  }

  const fanColor = rpm >= 2000 
    ? 'var(--color-critical)' 
    : rpm >= 1400 
    ? 'var(--color-elevated)' 
    : 'var(--color-nominal)';

  const mode = rpm >= 2000 ? 'Alto Desempenho' : rpm >= 1200 ? 'Equilibrado' : 'Silencioso';

  return (
    <BentoCard className={className} style={{ padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
        {/* Rotor Mecânico e Título */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: 'var(--border-radius-sm)',
              background: 'var(--bg-inset)',
              border: '1px solid var(--border-hairline)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <PropellerSvg
              size={24}
              color={fanColor}
              isSpinning={isSpinning}
              duration={`${durationSeconds}s`}
            />
          </div>
          <div>
            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              Arrefecimento
            </div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
              {mode}, ciclo PWM {pwmPercent}%
            </div>
          </div>
        </div>

        {/* Leitura de Rotação */}
        <div style={{ textAlign: 'right' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', justifyContent: 'flex-end' }}>
            <span style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }} className="tabular-nums">
              <NumberTicker value={rpm} />
            </span>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              RPM
            </span>
          </div>
          <div style={{ fontSize: '0.64rem', color: fanColor, fontWeight: 500, fontFamily: 'var(--font-mono)' }}>
            {durationSeconds > 0 ? `${durationSeconds}s / ciclo` : 'Inativo'}
          </div>
        </div>
      </div>
    </BentoCard>
  );
}
