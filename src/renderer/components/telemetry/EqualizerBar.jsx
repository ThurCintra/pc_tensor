import React from 'react';
import { BentoCard } from '../ui/BentoCard';
import { NumberTicker } from '../ui/NumberTicker';
import { Cpu, HardDrive } from 'lucide-react';

/**
 * SegmentedBar Component
 * Renderiza blocos discretos de 4px separados por 2px no estilo equalizador de áudio
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
        height: '8px',
      }}
    >
      {Array.from({ length: totalSegments }).map((_, index) => {
        const isActive = index < activeCount;
        const segmentPercentage = (index / totalSegments) * 100;

        // Regra de cores da especificação:
        // Ciano até 60%, Laranja entre 60% e 85%, Vermelho acima de 85%
        let activeColor = '#00F0FF';
        if (segmentPercentage >= 85) {
          activeColor = '#FF2A54';
        } else if (segmentPercentage >= 60) {
          activeColor = '#FF8A00';
        }

        return (
          <div
            key={index}
            style={{
              flex: 1,
              height: '100%',
              borderRadius: '1px',
              backgroundColor: isActive ? activeColor : 'rgba(255, 255, 255, 0.07)',
              boxShadow: isActive ? `0 0 6px ${activeColor}55` : 'none',
              transition: 'background-color 0.15s ease, box-shadow 0.15s ease',
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
      {/* Seção CPU */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Cpu size={15} color="#00F0FF" />
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#E2E8F0', letterSpacing: '0.5px' }}>
              CPU LOAD
            </span>
          </div>
          <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#00F0FF' }} className="tabular-nums">
            <NumberTicker value={Math.round(cpuLoad)} />%
          </span>
        </div>

        {cpuModel && (
          <div
            style={{
              fontSize: '0.68rem',
              color: '#9CA3AF',
              marginBottom: '6px',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              fontWeight: 500,
            }}
          >
            {cpuModel}
          </div>
        )}

        <SegmentedBar value={cpuLoad} totalSegments={30} />

        {/* Detalhamento compacto dos núcleos */}
        {cores && cores.length > 0 && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${Math.min(cores.length, 6)}, 1fr)`,
              gap: '4px',
              marginTop: '8px',
            }}
          >
            {cores.slice(0, 12).map((coreLoad, i) => (
              <div
                key={i}
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                  borderRadius: '4px',
                  padding: '3px 4px',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: '0.58rem', color: '#6B7280' }}>C{i + 1}</div>
                <div
                  style={{
                    fontSize: '0.66rem',
                    fontWeight: 600,
                    color: coreLoad >= 80 ? '#FF2A54' : coreLoad >= 50 ? '#FF8A00' : '#9CA3AF',
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

      {/* Divisor */}
      <div style={{ height: '1px', background: 'var(--border-subtle)' }} />

      {/* Seção RAM */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <HardDrive size={15} color="#10B981" />
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#E2E8F0', letterSpacing: '0.5px' }}>
              MEMÓRIA RAM
            </span>
          </div>
          <div style={{ fontSize: '0.78rem', color: '#9CA3AF' }} className="tabular-nums">
            <strong style={{ color: '#F3F4F6', fontWeight: 700 }}>{memory.usedGB}</strong> / {memory.totalGB} GB (
            <span style={{ color: '#10B981', fontWeight: 600 }}>{Math.round(memory.percentUsed)}%</span>)
          </div>
        </div>

        <SegmentedBar value={memory.percentUsed} totalSegments={30} />
      </div>
    </BentoCard>
  );
}
