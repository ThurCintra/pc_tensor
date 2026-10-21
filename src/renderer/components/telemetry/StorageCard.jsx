import React from 'react';
import { BentoCard } from '../ui/BentoCard';
import { HardDrive, ArrowDown, ArrowUp } from 'lucide-react';

export function StorageCard({
  disks = [],
  diskIo = { readMBps: 18.2, writeMBps: 6.4 },
  className = '',
}) {
  const displayDisks = disks && disks.length > 0
    ? disks
    : [{ mount: 'C:', sizeGB: 950, usedGB: 460, percentUsed: 48 }];

  return (
    <BentoCard className={className} style={{ padding: '14px 16px', gap: '10px' }}>
      {/* Topo: Título e Taxas de Leitura / Escrita (I/O) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
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
            Armazenamento & I/O
          </span>
        </div>

        {/* Indicadores I/O (Read / Write) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.72rem' }} className="tabular-nums">
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span
              style={{
                width: '5px',
                height: '5px',
                borderRadius: '50%',
                background: 'var(--color-nominal)',
              }}
            />
            <ArrowDown size={11} color="var(--text-muted)" />
            <span style={{ color: 'var(--text-secondary)' }}>{diskIo.readMBps} MB/s</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span
              style={{
                width: '5px',
                height: '5px',
                borderRadius: '50%',
                background: 'var(--color-elevated)',
              }}
            />
            <ArrowUp size={11} color="var(--text-muted)" />
            <span style={{ color: 'var(--text-secondary)' }}>{diskIo.writeMBps} MB/s</span>
          </div>
        </div>
      </div>

      {/* Lista de Partições */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {displayDisks.slice(0, 2).map((disk, idx) => {
          const usedPct = Math.round(disk.percentUsed || (disk.usedGB / (disk.sizeGB || 1)) * 100);
          const barColor = usedPct >= 85 
            ? 'var(--color-critical)' 
            : usedPct >= 70 
            ? 'var(--color-elevated)' 
            : 'var(--color-nominal)';

          return (
            <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  {disk.mount || disk.fs || `Disco ${idx + 1}`}
                </span>
                <span className="tabular-nums">
                  {disk.usedGB} GB / {disk.sizeGB} GB (
                  <strong style={{ color: barColor }}>{usedPct}%</strong>)
                </span>
              </div>

              {/* Barra de Ocupação */}
              <div
                style={{
                  width: '100%',
                  height: '4px',
                  background: 'var(--bg-inset)',
                  borderRadius: '2px',
                  overflow: 'hidden',
                  border: '1px solid var(--border-hairline)',
                }}
              >
                <div
                  style={{
                    width: `${Math.min(100, Math.max(0, usedPct))}%`,
                    height: '100%',
                    background: barColor,
                    borderRadius: '1px',
                    transition: 'width 0.25s ease',
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </BentoCard>
  );
}
