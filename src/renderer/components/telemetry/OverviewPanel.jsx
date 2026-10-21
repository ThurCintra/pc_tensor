import React from 'react';
import { BentoCard } from '../ui/BentoCard';
import { ThermalHeroGauge } from './ThermalHeroGauge';
import { EqualizerCard } from './EqualizerBar';
import { FanSpeedCard } from './FanSpeedCard';
import { StorageCard } from './StorageCard';
import { BottleneckCard } from './BottleneckCard';
import { NetworkCard } from './NetworkCard';
import { 
  Cpu, 
  Layers, 
  HardDrive, 
  Server, 
  ShieldAlert, 
  Flame, 
  Gauge, 
  AlertTriangle,
  Info
} from 'lucide-react';

export function OverviewPanel({
  metrics,
  viewPreset = 'GAMING',
}) {
  const temperatures = metrics?.temperatures;
  const cpuMetrics = metrics?.cpu;
  const memMetrics = metrics?.memory;
  const diskIo = metrics?.diskIo;
  const fan = metrics?.fan;
  const disks = metrics?.disks || [];

  const cpuLoad = cpuMetrics?.loadPercent ?? 0;
  const ramPercent = memMetrics?.percentUsed ?? 0;

  const cpuTemp = typeof temperatures?.cpuMain === 'number' ? temperatures.cpuMain : null;
  const gpuTemp = typeof temperatures?.gpu === 'number' ? temperatures.gpu : null;
  const cpuMax = temperatures?.cpuMax ?? cpuTemp;
  const gpuMax = gpuTemp;

  const cpuModelName = cpuMetrics?.model || cpuMetrics?.brand || temperatures?.cpuName || 'Processador Central';
  const gpuModelName = temperatures?.gpuName || 'GPU Primária';

  const motherboard = temperatures?.motherboard || { name: 'Placa-mãe', temp: null, requiresElevation: true };
  const storage = temperatures?.storage || { name: 'Armazenamento', temp: null, load: null, requiresElevation: true };

  const requiresElevation = Boolean(temperatures?.requiresElevation);
  const isAdmin = Boolean(temperatures?.isAdmin);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>
      {/* Aviso Técnico de Privilégios de Administrador no Windows (se aplicável) */}
      {requiresElevation && (
        <div
          style={{
            background: 'var(--bg-inset)',
            border: '1px solid var(--border-subtle)',
            borderLeft: '3px solid var(--color-elevated)',
            borderRadius: 'var(--border-radius-inner)',
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Info size={16} color="var(--color-elevated)" style={{ flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                Modo de Operação Padrão do Windows
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '2px', lineHeight: 1.4 }}>
                A telemetria de GPU, memória, I/O e carga está ativa. Sensores térmicos internos que exigem acesso ao anel 0 (registradores MSR de núcleos Zen 5 e SMART de NVMe) demandam privilégios elevados. Para ativá-los, execute o aplicativo como Administrador.
              </div>
            </div>
          </div>
          <span
            style={{
              fontSize: '0.68rem',
              color: 'var(--color-elevated)',
              fontFamily: 'var(--font-mono)',
              border: '1px solid rgba(245, 158, 11, 0.25)',
              padding: '3px 8px',
              borderRadius: 'var(--border-radius-sm)',
              whiteSpace: 'nowrap',
            }}
          >
            Acesso Restrito
          </span>
        </div>
      )}

      {/* Grid de Cartões de Estado Físico dos 4 Componentes */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '12px' }}>
        {/* Componente 1: CPU */}
        <BentoCard style={{ padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Processador
            </span>
            <Cpu size={14} color="var(--color-nominal)" />
          </div>
          <div style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {cpuModelName}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '6px' }}>
            <span className="tabular-nums" style={{ fontSize: '1.45rem', fontWeight: 700, color: cpuTemp ? (cpuTemp >= 76 ? 'var(--color-critical)' : cpuTemp >= 56 ? 'var(--color-elevated)' : 'var(--color-nominal)') : 'var(--text-muted)' }}>
              {cpuTemp !== null ? `${cpuTemp}°C` : 'Sem leitura'}
            </span>
            <span className="tabular-nums" style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              {cpuLoad.toFixed(1)}% carga
            </span>
          </div>
        </BentoCard>

        {/* Componente 2: GPU */}
        <BentoCard style={{ padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Placa de Vídeo
            </span>
            <Flame size={14} color="var(--color-accent)" />
          </div>
          <div style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {gpuModelName}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '6px' }}>
            <span className="tabular-nums" style={{ fontSize: '1.45rem', fontWeight: 700, color: gpuTemp ? (gpuTemp >= 76 ? 'var(--color-critical)' : gpuTemp >= 56 ? 'var(--color-elevated)' : 'var(--color-nominal)') : 'var(--text-muted)' }}>
              {gpuTemp !== null ? `${gpuTemp}°C` : 'Sem leitura'}
            </span>
            {temperatures?.gpuHotspotTemp && (
              <span className="tabular-nums" style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }} title="Ponto mais quente da matriz (Hotspot)">
                HS: {temperatures.gpuHotspotTemp}°C
              </span>
            )}
          </div>
        </BentoCard>

        {/* Componente 3: Placa-mãe */}
        <BentoCard style={{ padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Placa-mãe
            </span>
            <Server size={14} color="var(--text-muted)" />
          </div>
          <div style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {motherboard.name}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '6px' }}>
            <span className="tabular-nums" style={{ fontSize: '1.45rem', fontWeight: 700, color: motherboard.temp ? 'var(--color-nominal)' : 'var(--text-muted)' }}>
              {motherboard.temp !== null ? `${motherboard.temp}°C` : (motherboard.requiresElevation ? 'Elevação requerida' : '--')}
            </span>
          </div>
        </BentoCard>

        {/* Componente 4: Armazenamento */}
        <BentoCard style={{ padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Armazenamento
            </span>
            <HardDrive size={14} color="var(--text-muted)" />
          </div>
          <div style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {storage.name}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '6px' }}>
            <span className="tabular-nums" style={{ fontSize: '1.45rem', fontWeight: 700, color: storage.temp ? 'var(--color-nominal)' : 'var(--text-muted)' }}>
              {storage.temp !== null ? `${storage.temp}°C` : (storage.requiresElevation ? 'SMART restrito' : '--')}
            </span>
            {diskIo && (
              <span className="tabular-nums" style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                R: {diskIo.readMBps} MB/s
              </span>
            )}
          </div>
        </BentoCard>
      </div>

      {/* Grid Principal de Instrumentação */}
      <div className="bento-grid">
        <ThermalHeroGauge
          className="bento-col-4"
          cpuTemp={cpuTemp ?? 45}
          gpuTemp={gpuTemp ?? 48}
          cpuMax={cpuMax ?? 48}
          gpuMax={gpuMax ?? 50}
          cpuModel={cpuModelName}
          gpuModel={gpuModelName}
          isEstimated={temperatures?.isEstimated ?? false}
          isCpuEstimated={temperatures?.isCpuEstimated ?? false}
          isGpuEstimated={temperatures?.isGpuEstimated ?? false}
        />

        <EqualizerCard
          className="bento-col-4"
          cpuLoad={cpuLoad}
          cpuModel={cpuModelName}
          cores={cpuMetrics?.cores || []}
          memory={memMetrics || { totalGB: 16, usedGB: 8, percentUsed: 50 }}
        />

        <BottleneckCard
          className="bento-col-4"
          bottleneck={metrics?.bottleneck}
          cpuLoad={cpuLoad}
          gpuLoad={temperatures?.gpuLoadVal ?? null}
          ramPercent={ramPercent}
        />

        <FanSpeedCard
          className="bento-col-4"
          rpm={fan?.rpm}
          pwmPercent={fan?.pwmPercent}
        />

        <StorageCard
          className="bento-col-4"
          disks={disks}
          diskIo={diskIo || { readMBps: 0, writeMBps: 0 }}
        />

        <NetworkCard
          className="bento-col-4"
          network={metrics?.network}
        />
      </div>
    </div>
  );
}
