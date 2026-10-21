import React from 'react';
import { BentoCard } from '../ui/BentoCard';
import { Zap, AlertTriangle, ShieldCheck, Cpu, HardDrive } from 'lucide-react';

const STATE_CONFIG = {
  BALANCED: {
    label: 'Equilibrado',
    sublabel: 'CPU e GPU operando com folga térmica e de processamento',
    color: 'var(--color-nominal)',
    bgColor: 'rgba(45, 212, 191, 0.08)',
    borderColor: 'rgba(45, 212, 191, 0.25)',
    icon: ShieldCheck,
  },
  CPU_BOUND: {
    label: 'Gargalo de CPU',
    sublabel: 'Processador em saturação limitando a taxa da GPU',
    color: 'var(--color-elevated)',
    bgColor: 'rgba(245, 158, 11, 0.08)',
    borderColor: 'rgba(245, 158, 11, 0.25)',
    icon: Cpu,
  },
  GPU_BOUND: {
    label: 'Gargalo de GPU',
    sublabel: 'Placa de vídeo em carga máxima de renderização',
    color: 'var(--color-accent)',
    bgColor: 'rgba(56, 189, 248, 0.08)',
    borderColor: 'rgba(56, 189, 248, 0.25)',
    icon: Zap,
  },
  VRAM_PRESSURE: {
    label: 'Pressão de VRAM',
    sublabel: 'Memória de vídeo saturada (>90%), risco de oscilação',
    color: 'var(--color-critical)',
    bgColor: 'rgba(239, 68, 68, 0.08)',
    borderColor: 'rgba(239, 68, 68, 0.25)',
    icon: AlertTriangle,
  },
  RAM_SWAP_RISK: {
    label: 'Risco de Paginação',
    sublabel: 'Memória RAM saturada ativando swap em disco',
    color: 'var(--color-critical)',
    bgColor: 'rgba(239, 68, 68, 0.08)',
    borderColor: 'rgba(239, 68, 68, 0.25)',
    icon: HardDrive,
  },
};

export function BottleneckCard({ bottleneck = null, cpuLoad = 0, gpuLoad = null, ramPercent = 0, className = '' }) {
  const stateKey = bottleneck?.state || 'BALANCED';
  const config = STATE_CONFIG[stateKey] || STATE_CONFIG.BALANCED;
  const IconComponent = config.icon;

  return (
    <BentoCard className={className} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {/* Cabeçalho do Card */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
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
              color: config.color,
            }}
          >
            <IconComponent size={14} />
          </div>
          <div>
            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              Balanço de Hardware
            </div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
              Diagnóstico arquitetural
            </div>
          </div>
        </div>

        {/* Badge do Estado */}
        <span
          style={{
            fontSize: '0.72rem',
            fontWeight: 600,
            color: config.color,
            background: config.bgColor,
            border: `1px solid ${config.borderColor}`,
            padding: '2px 8px',
            borderRadius: 'var(--border-radius-sm)',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
          }}
        >
          <span
            style={{
              width: '5px',
              height: '5px',
              borderRadius: '50%',
              background: config.color,
            }}
          />
          {config.label}
        </span>
      </div>

      {/* Descrição Funcional */}
      <p style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', margin: '0', lineHeight: 1.4 }}>
        {bottleneck?.reason || config.sublabel}
      </p>

      {/* Barras Comparativas de Carga com Trilhas Recuadas */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
        {/* CPU */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '2px' }}>
            <span>Carga da CPU</span>
            <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{cpuLoad.toFixed(1)}%</span>
          </div>
          <div style={{ height: '4px', background: 'var(--bg-inset)', borderRadius: '2px', overflow: 'hidden', border: '1px solid var(--border-hairline)' }}>
            <div
              style={{
                height: '100%',
                width: `${Math.min(100, Math.max(0, cpuLoad))}%`,
                background: cpuLoad > 85 ? 'var(--color-critical)' : 'var(--color-nominal)',
                transition: 'width 0.3s ease',
              }}
            />
          </div>
        </div>

        {/* GPU */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '2px' }}>
            <span>Carga da GPU</span>
            <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
              {typeof gpuLoad === 'number' ? `${gpuLoad.toFixed(1)}%` : 'Ativa'}
            </span>
          </div>
          <div style={{ height: '4px', background: 'var(--bg-inset)', borderRadius: '2px', overflow: 'hidden', border: '1px solid var(--border-hairline)' }}>
            <div
              style={{
                height: '100%',
                width: `${typeof gpuLoad === 'number' ? Math.min(100, Math.max(0, gpuLoad)) : 45}%`,
                background: typeof gpuLoad === 'number' && gpuLoad > 90 ? 'var(--color-elevated)' : 'var(--color-accent)',
                transition: 'width 0.3s ease',
              }}
            />
          </div>
        </div>

        {/* RAM */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '2px' }}>
            <span>Ocupação de RAM</span>
            <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{ramPercent.toFixed(1)}%</span>
          </div>
          <div style={{ height: '4px', background: 'var(--bg-inset)', borderRadius: '2px', overflow: 'hidden', border: '1px solid var(--border-hairline)' }}>
            <div
              style={{
                height: '100%',
                width: `${Math.min(100, Math.max(0, ramPercent))}%`,
                background: ramPercent > 85 ? 'var(--color-critical)' : 'var(--text-secondary)',
                transition: 'width 0.3s ease',
              }}
            />
          </div>
        </div>
      </div>
    </BentoCard>
  );
}
