import React, { useState } from 'react';
import { BentoCard } from '../ui/BentoCard';
import { NumberTicker } from '../ui/NumberTicker';
import { Thermometer, Cpu, Activity } from 'lucide-react';

export function ThermalHeroGauge({
  cpuTemp = 42,
  gpuTemp = 45,
  cpuMax = 46,
  gpuMax = 48,
  cpuModel = 'Processador Central',
  gpuModel = 'Placa de Vídeo',
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

  // Estado Térmico Funcional
  const isCritical = currentTemp >= 76;
  const isWarning = currentTemp >= 56 && currentTemp < 76;
  const status = isCritical ? 'critical' : isWarning ? 'warning' : 'stable';

  // Cores Sólidas de Instrumento (Sem gradientes artificiais)
  const statusColor = isCritical 
    ? 'var(--color-critical)' 
    : isWarning 
    ? 'var(--color-elevated)' 
    : 'var(--color-nominal)';

  // Geometria de Disco de Bancada com Escala Calibrada
  const size = 210;
  const strokeWidth = 10;
  const radius = (size - strokeWidth - 16) / 2;
  const circumference = 2 * Math.PI * radius;

  // Escala útil: 20°C a 100°C (80°C de amplitude total)
  const minTemp = 20;
  const maxTempScale = 100;
  const normalized = Math.max(0, Math.min(1, (currentTemp - minTemp) / (maxTempScale - minTemp)));
  const arcLength = circumference * 0.75; // 270 graus de arco para formato manômetro
  const dashoffset = arcLength * (1 - normalized);

  // Marcas de calibração (ticks) ao redor do disco
  const ticks = [20, 40, 60, 80, 100];

  return (
    <BentoCard
      isCritical={isCritical}
      status={status}
      className={className || 'bento-col-4'}
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        minHeight: '340px',
      }}
    >
      {/* Topo do Módulo: Título e Seletor de Canal */}
      <div
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '6px',
          gap: '8px',
        }}
      >
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
              color: statusColor,
            }}
          >
            <Thermometer size={15} />
          </div>
          <div>
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              Núcleo Térmico
            </span>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
              Telemetria contínua de junção
            </div>
          </div>
        </div>

        {/* Toggle Discreto CPU / GPU */}
        <div
          style={{
            display: 'inline-flex',
            background: 'var(--bg-inset)',
            borderRadius: 'var(--border-radius-inner)',
            padding: '2px',
            border: '1px solid var(--border-hairline)',
          }}
        >
          <button
            onClick={() => setSelectedTarget('CPU')}
            style={{
              background: selectedTarget === 'CPU' ? 'var(--bg-card)' : 'transparent',
              color: selectedTarget === 'CPU' ? 'var(--text-primary)' : 'var(--text-muted)',
              border: selectedTarget === 'CPU' ? '1px solid var(--border-subtle)' : '1px solid transparent',
              borderRadius: 'var(--border-radius-sm)',
              padding: '3px 9px',
              fontSize: '0.72rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            CPU
          </button>
          <button
            onClick={() => setSelectedTarget('GPU')}
            style={{
              background: selectedTarget === 'GPU' ? 'var(--bg-card)' : 'transparent',
              color: selectedTarget === 'GPU' ? 'var(--text-primary)' : 'var(--text-muted)',
              border: selectedTarget === 'GPU' ? '1px solid var(--border-subtle)' : '1px solid transparent',
              borderRadius: 'var(--border-radius-sm)',
              padding: '3px 9px',
              fontSize: '0.72rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            GPU
          </button>
        </div>
      </div>

      {/* Mostrador Técnico Circular de Alta Precisão */}
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
          style={{ width: '100%', height: '100%', transform: 'rotate(135deg)' }}
        >
          {/* Trilha de Referência Recuada */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--bg-chip)"
            strokeWidth={strokeWidth}
            strokeDasharray={`${arcLength} ${circumference}`}
            strokeLinecap="round"
          />

          {/* Arco Ativo com Cor Funcional Sólida */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={statusColor}
            strokeWidth={strokeWidth}
            strokeDasharray={`${arcLength} ${circumference}`}
            strokeDashoffset={dashoffset}
            strokeLinecap="round"
            style={{
              transition: 'stroke-dashoffset 0.4s cubic-bezier(0.16, 1, 0.3, 1), stroke 0.25s ease',
            }}
          />
        </svg>

        {/* Leitura Central Alinhada */}
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
                fontSize: '3.4rem',
                fontWeight: 700,
                color: 'var(--text-primary)',
                letterSpacing: '-0.03em',
              }}
            >
              <NumberTicker value={Math.round(currentTemp)} />
            </span>
            <span
              style={{
                fontSize: '1.25rem',
                fontWeight: 500,
                color: 'var(--text-muted)',
                marginLeft: '3px',
                fontFamily: 'var(--font-mono)',
              }}
            >
              °C
            </span>
          </div>

          {/* Parâmetros Mín/Máx */}
          <div
            style={{
              marginTop: '6px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '0.72rem',
              color: 'var(--text-muted)',
            }}
          >
            <span>
              Pico:{' '}
              <strong style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                {Math.round(currentMax)}°C
              </strong>
            </span>
            <span style={{ color: 'var(--border-subtle)' }}>•</span>
            <span style={{ color: statusColor, fontWeight: 500 }}>
              {isCritical ? 'Alerta Térmico' : isWarning ? 'Elevada' : 'Nominal'}
            </span>
          </div>
        </div>
      </div>

      {/* Rodapé do Módulo: Identificação do Dispositivo e Fonte do Sinal */}
      <div
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderTop: '1px solid var(--border-hairline)',
          paddingTop: '10px',
          marginTop: '6px',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
          <span
            style={{
              fontSize: '0.76rem',
              color: 'var(--text-secondary)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              fontWeight: 500,
            }}
            title={currentModel}
          >
            {currentModel}
          </span>
          <span style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>
            {selectedTarget === 'CPU' ? 'Processador do Sistema' : 'Acelerador Gráfico'}
          </span>
        </div>

        <span
          title={currentIsEstimated ? 'Modelo preditivo baseado em carga de trabalho' : 'Leitura física direta via sensores de silício'}
          style={{
            fontSize: '0.65rem',
            padding: '2px 8px',
            borderRadius: 'var(--border-radius-sm)',
            background: 'var(--bg-inset)',
            color: currentIsEstimated ? 'var(--text-muted)' : 'var(--color-nominal)',
            border: '1px solid var(--border-hairline)',
            fontWeight: 600,
            letterSpacing: '0.02em',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          {currentIsEstimated ? 'ESTIMADO' : 'SENSOR REAL'}
        </span>
      </div>
    </BentoCard>
  );
}
