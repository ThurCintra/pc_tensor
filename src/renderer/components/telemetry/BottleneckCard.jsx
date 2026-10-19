import React from 'react';
import { BentoCard } from '../ui/BentoCard';
import { Zap, AlertTriangle, ShieldCheck, Cpu, HardDrive } from 'lucide-react';

const STATE_CONFIG = {
  BALANCED: {
    label: 'EQUILIBRADO',
    sublabel: 'CPU e GPU operando com folga térmica e de processamento',
    color: '#10B981',
    bgColor: 'rgba(16, 185, 129, 0.1)',
    borderColor: 'rgba(16, 185, 129, 0.3)',
    icon: ShieldCheck,
  },
  CPU_BOUND: {
    label: 'GARGALO DE CPU',
    sublabel: 'Processador em 100% limitando o rendimento da GPU',
    color: '#FF8A00',
    bgColor: 'rgba(255, 138, 0, 0.1)',
    borderColor: 'rgba(255, 138, 0, 0.35)',
    icon: Cpu,
  },
  GPU_BOUND: {
    label: 'GARGALO DE GPU',
    sublabel: 'Placa de vídeo em carga máxima (comum em resolução alta)',
    color: '#A855F7',
    bgColor: 'rgba(168, 85, 247, 0.1)',
    borderColor: 'rgba(168, 85, 247, 0.35)',
    icon: Zap,
  },
  VRAM_PRESSURE: {
    label: 'PRESSÃO DE VRAM',
    sublabel: 'Memória de vídeo saturada (>90%), risco de stuttering',
    color: '#FF2A54',
    bgColor: 'rgba(255, 42, 84, 0.12)',
    borderColor: 'rgba(255, 42, 84, 0.4)',
    icon: AlertTriangle,
  },
  RAM_SWAP_RISK: {
    label: 'RISCO DE SWAP',
    sublabel: 'RAM esgotada forçando paginação pesada em disco',
    color: '#FF2A54',
    bgColor: 'rgba(255, 42, 84, 0.15)',
    borderColor: 'rgba(255, 42, 84, 0.45)',
    icon: HardDrive,
  },
};

export function BottleneckCard({ bottleneck = null, cpuLoad = 0, gpuLoad = null, ramPercent = 0, className = '' }) {
  const stateKey = bottleneck?.state || 'BALANCED';
  const config = STATE_CONFIG[stateKey] || STATE_CONFIG.BALANCED;
  const IconComponent = config.icon;

  return (
    <BentoCard className={className} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Cabeçalho do Card */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '8px',
              background: config.bgColor,
              border: `1px solid ${config.borderColor}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <IconComponent size={15} color={config.color} />
          </div>
          <div>
            <div style={{ fontSize: '0.68rem', color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.6px', fontWeight: 600 }}>
              DIAGNÓSTICO DINÂMICO
            </div>
            <div style={{ fontSize: '0.86rem', fontWeight: 700, color: '#F3F4F6' }}>
              Balanço de Hardware
            </div>
          </div>
        </div>

        {/* Badge do Estado */}
        <span
          style={{
            fontSize: '0.72rem',
            fontWeight: 700,
            color: config.color,
            background: config.bgColor,
            border: `1px solid ${config.borderColor}`,
            padding: '3px 8px',
            borderRadius: '6px',
            letterSpacing: '0.4px',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
          }}
        >
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: config.color,
              boxShadow: `0 0 8px ${config.color}`,
            }}
          />
          {config.label}
        </span>
      </div>

      {/* Descrição Curta */}
      <p style={{ fontSize: '0.76rem', color: '#9CA3AF', margin: '2px 0 0 0', lineHeight: 1.35 }}>
        {bottleneck?.reason || config.sublabel}
      </p>

      {/* Barras Comparativas de Carga */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
        {/* CPU */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#6B7280', marginBottom: '2px' }}>
            <span>Carga da CPU</span>
            <span style={{ color: '#F3F4F6', fontFamily: 'var(--font-mono)' }}>{cpuLoad.toFixed(1)}%</span>
          </div>
          <div style={{ height: '4px', background: '#1F2937', borderRadius: '2px', overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${Math.min(100, Math.max(0, cpuLoad))}%`,
                background: cpuLoad > 85 ? '#FF8A00' : '#00F0FF',
                transition: 'width 0.4s ease',
              }}
            />
          </div>
        </div>

        {/* GPU */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#6B7280', marginBottom: '2px' }}>
            <span>Carga da GPU</span>
            <span style={{ color: '#F3F4F6', fontFamily: 'var(--font-mono)' }}>
              {typeof gpuLoad === 'number' ? `${gpuLoad.toFixed(1)}%` : 'Ativa'}
            </span>
          </div>
          <div style={{ height: '4px', background: '#1F2937', borderRadius: '2px', overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${typeof gpuLoad === 'number' ? Math.min(100, Math.max(0, gpuLoad)) : 45}%`,
                background: typeof gpuLoad === 'number' && gpuLoad > 90 ? '#A855F7' : '#10B981',
                transition: 'width 0.4s ease',
              }}
            />
          </div>
        </div>

        {/* RAM */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#6B7280', marginBottom: '2px' }}>
            <span>Uso de Memória RAM</span>
            <span style={{ color: '#F3F4F6', fontFamily: 'var(--font-mono)' }}>{ramPercent.toFixed(1)}%</span>
          </div>
          <div style={{ height: '4px', background: '#1F2937', borderRadius: '2px', overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${Math.min(100, Math.max(0, ramPercent))}%`,
                background: ramPercent > 85 ? '#FF2A54' : '#38BDF8',
                transition: 'width 0.4s ease',
              }}
            />
          </div>
        </div>
      </div>
    </BentoCard>
  );
}
