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
    <BentoCard className={className} style={{ padding: '14px 18px', gap: '10px' }}>
      {/* Topo: Título e Taxas de Leitura / Escrita (I/O) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <HardDrive size={15} color="#00F0FF" />
          <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#E2E8F0', letterSpacing: '0.5px' }}>
            ARMAZENAMENTO
          </span>
        </div>

        {/* Indicadores I/O (Read / Write) com LEDs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.68rem' }} className="tabular-nums">
          <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            <span
              style={{
                width: '5px',
                height: '5px',
                borderRadius: '50%',
                background: '#00F0FF',
                boxShadow: '0 0 6px #00F0FF',
              }}
            />
            <ArrowDown size={11} color="#00F0FF" />
            <span style={{ color: '#9CA3AF' }}>{diskIo.readMBps} MB/s</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            <span
              style={{
                width: '5px',
                height: '5px',
                borderRadius: '50%',
                background: '#10B981',
                boxShadow: '0 0 6px #10B981',
              }}
            />
            <ArrowUp size={11} color="#10B981" />
            <span style={{ color: '#9CA3AF' }}>{diskIo.writeMBps} MB/s</span>
          </div>
        </div>
      </div>

      {/* Lista de Partições */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {displayDisks.slice(0, 2).map((disk, idx) => {
          const usedPct = Math.round(disk.percentUsed || (disk.usedGB / (disk.sizeGB || 1)) * 100);
          const barColor = usedPct >= 85 ? '#FF2A54' : usedPct >= 70 ? '#FF8A00' : '#00F0FF';

          return (
            <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#9CA3AF' }}>
                <span style={{ fontWeight: 600, color: '#F3F4F6' }}>
                  {disk.mount || disk.fs || `Disco ${idx + 1}`}
                </span>
                <span className="tabular-nums">
                  {disk.usedGB} GB / {disk.sizeGB} GB (
                  <strong style={{ color: barColor }}>{usedPct}%</strong>)
                </span>
              </div>

              {/* Barra de Progresso Arredondada */}
              <div
                style={{
                  width: '100%',
                  height: '5px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  borderRadius: '3px',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${Math.min(100, Math.max(0, usedPct))}%`,
                    height: '100%',
                    background: barColor,
                    borderRadius: '3px',
                    boxShadow: `0 0 8px ${barColor}66`,
                    transition: 'width 0.3s ease',
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
