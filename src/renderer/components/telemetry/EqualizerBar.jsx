import React from 'react';
import { BentoCard } from '../ui/BentoCard';
import { NumberTicker } from '../ui/NumberTicker';
import { Cpu, HardDrive } from 'lucide-react';

/**
 * SegmentedBar Component
 * Renderiza blocos discretos calibrados de precisão mecânica, sem neon glow.
 */
export function SegmentedBar({ value = 0, totalSegments = 28 }) {
  const activeCount = Math.round((Math.max(0, Math.min(100, value)) / 100) * totalSegments);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '2px',
        width: '100%',
        height: '6px',
        padding: '2px 0',
      }}
    >
      {Array.from({ length: totalSegments }).map((_, index) => {
        const isActive = index < activeCount;
        const segmentPercentage = (index / totalSegments) * 100;

        // Escala sóbria de instrumentação:
        // Nominal (<65%): Mint, Elevado (65%-85%): Amber, Crítico (>85%): Vermilion
        let activeColor = 'var(--color-nominal)';
        if (segmentPercentage >= 85) {
          activeColor = 'var(--color-critical)';
        } else if (segmentPercentage >= 65) {
          activeColor = 'var(--color-elevated)';
        }

        return (
          <div
            key={index}
            style={{
              flex: 1,
              height: '100%',
              borderRadius: '1px',
              backgroundColor: isActive ? activeColor : 'var(--bg-chip)',
              transition: 'background-color 0.12s ease',
            }}
          />
        );
      })}
    </div>
  );
}

export function EqualizerCard({
  cpuLoad = 35,
  cpuModel = '',
  cores = [],
  memory = { totalGB: 16, usedGB: 8, percentUsed: 50 },
  className = '',
}) {
  return (
    <BentoCard className={className} style={{ gap: '14px' }}>
      {/* Seção Carga do Processador */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                width: '24px',
                height: '24px',
                borderRadius: 'var(--border-radius-sm)',
                background: 'var(--bg-inset)',
                border: '1px solid var(--border-hairline)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-secondary)',
              }}
            >
              <Cpu size={14} />
            </div>
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              Carga do Processador
            </span>
          </div>
          <span style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)' }} className="tabular-nums">
            <NumberTicker value={Math.round(cpuLoad)} />%
          </span>
        </div>

        {cpuModel && (
          <div
            style={{
              fontSize: '0.7rem',
              color: 'var(--text-muted)',
              marginBottom: '8px',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              fontWeight: 400,
            }}
          >
            {cpuModel}
          </div>
        )}

        <SegmentedBar value={cpuLoad} totalSegments={32} />

        {/* Detalhamento compacto dos núcleos */}
        {cores && cores.length > 0 && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(36px, 1fr))',
              gap: '4px',
              marginTop: '10px',
            }}
          >
            {cores.slice(0, 16).map((coreLoad, i) => (
              <div
                key={i}
                style={{
                  background: 'var(--bg-inset)',
                  border: '1px solid var(--border-hairline)',
                  borderRadius: 'var(--border-radius-sm)',
                  padding: '3px 4px',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>C{i + 1}</div>
                <div
                  style={{
                    fontSize: '0.68rem',
                    fontWeight: 600,
                    color: coreLoad >= 85 
                      ? 'var(--color-critical)' 
                      : coreLoad >= 65 
                      ? 'var(--color-elevated)' 
                      : 'var(--text-secondary)',
                  }}
                  className="tabular-nums"
                >
                  {Math.round(coreLoad)}%
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Divisor Hairline */}
      <div style={{ height: '1px', background: 'var(--border-hairline)' }} />

      {/* Seção Memória Operacional */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                width: '24px',
                height: '24px',
                borderRadius: 'var(--border-radius-sm)',
                background: 'var(--bg-inset)',
                border: '1px solid var(--border-hairline)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-secondary)',
              }}
            >
              <HardDrive size={14} />
            </div>
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              Memória RAM
            </span>
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }} className="tabular-nums">
            <strong style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{memory.usedGB}</strong> / {memory.totalGB} GB{' '}
            <span style={{ color: 'var(--text-muted)' }}>({Math.round(memory.percentUsed)}%)</span>
          </div>
        </div>

        <SegmentedBar value={memory.percentUsed} totalSegments={32} />
      </div>
    </BentoCard>
  );
}
