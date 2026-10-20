import React from 'react';
import { BentoCard } from '../ui/BentoCard';
import { NumberTicker } from '../ui/NumberTicker';
import { Wind } from 'lucide-react';

/**
 * Ícone Vetorial Minimalista de Hélice / Fan Propeller
 */
function PropellerSvg({ size = 28, color = '#00F0FF', isSpinning = true, duration = '1.2s' }) {
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
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          animation: isSpinning ? `fanSpin ${duration} linear infinite` : 'none',
          transformOrigin: '12px 12px',
        }}
      >
        <circle cx="12" cy="12" r="3" fill={color} />
        <path d="M12 9 C12 4, 16 3, 16 3 C16 3, 16 7, 12 9" fill={color} fillOpacity="0.25" />
        <path d="M15 12 C20 12, 21 16, 21 16 C21 16, 17 16, 15 12" fill={color} fillOpacity="0.25" />
        <path d="M12 15 C12 20, 8 21, 8 21 C8 21, 8 17, 12 15" fill={color} fillOpacity="0.25" />
        <path d="M9 12 C4 12, 3 8, 3 8 C3 8, 7 8, 9 12" fill={color} fillOpacity="0.25" />
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

  // Física Visual: Cálculo inverso da duração da rotação (Regra 3.3 da especificação)
  // 800 RPM -> ~1.8s, 2500+ RPM -> ~0.35s
  let durationSeconds = 1.4;
  if (rpm <= 0) {
    durationSeconds = 0;
  } else if (rpm <= 800) {
    durationSeconds = 1.8;
  } else if (rpm >= 2500) {
    durationSeconds = 0.35;
  } else {
    // Interpolação linear entre 800 e 2500
    const ratio = (rpm - 800) / (2500 - 800);
    durationSeconds = Number((1.8 - ratio * (1.8 - 0.35)).toFixed(2));
  }

  const fanColor = rpm >= 2000 ? '#FF2A54' : rpm >= 1400 ? '#FF8A00' : '#00F0FF';
  const mode = rpm >= 2000 ? 'ALTO DESEMPENHO' : rpm >= 1200 ? 'EQUILIBRADO' : 'SILENCIOSO';

  return (
    <BentoCard className={className} style={{ padding: '14px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
        {/* Lado Esquerdo: Ícone da Hélice e Título */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <PropellerSvg
            size={30}
            color={fanColor}
            isSpinning={isSpinning}
            duration={`${durationSeconds}s`}
          />
          <div>
            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#E2E8F0', letterSpacing: '0.5px' }}>
              VENTOINHAS (COOLING)
            </div>
            <div style={{ fontSize: '0.66rem', color: '#6B7280', letterSpacing: '0.4px' }}>
              {mode} • PWM {pwmPercent}%
            </div>
          </div>
        </div>

        {/* Lado Direito: RPM em Destaque */}
        <div style={{ textAlign: 'right' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
            <span style={{ fontSize: '1.25rem', fontWeight: 700, color: '#F3F4F6' }} className="tabular-nums">
              <NumberTicker value={rpm} />
            </span>
            <span style={{ fontSize: '0.7rem', color: '#6B7280', fontFamily: 'var(--font-mono)' }}>
              RPM
            </span>
          </div>
          <div style={{ fontSize: '0.62rem', color: fanColor, fontWeight: 600 }}>
            {durationSeconds > 0 ? `${durationSeconds}s / volta` : 'Parado'}
          </div>
        </div>
      </div>
    </BentoCard>
  );
}
