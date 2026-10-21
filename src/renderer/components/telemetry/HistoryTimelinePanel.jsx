import React, { useMemo, useState } from 'react';
import { BentoCard } from '../ui/BentoCard';
import { Activity, Clock, Flame, Zap, ArrowUp, ArrowDown, ShieldAlert } from 'lucide-react';

function getSplinePath(points) {
  if (!points || points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? 0 : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2 < points.length ? i + 2 : i + 1];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

export function HistoryTimelinePanel({
  history = [],
  cpuTemp = null,
  gpuTemp = null,
  cpuLoad = 0,
  gpuLoad = 0,
  ramPercent = 0,
}) {
  const [hoverIndex, setHoverIndex] = useState(null);

  // Amostras temporais reais
  const validHistory = useMemo(() => {
    if (history.length >= 2) return history;
    const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return [
      {
        time: nowStr,
        cpuTemp: cpuTemp ?? 45,
        gpuTemp: gpuTemp ?? 48,
        cpuLoad: cpuLoad || 15,
        gpuLoad: gpuLoad || 10,
        ramPercent: ramPercent || 40,
      },
    ];
  }, [history, cpuTemp, gpuTemp, cpuLoad, gpuLoad, ramPercent]);

  // Estatísticas agregadas da sessão
  const stats = useMemo(() => {
    let cpuMin = Infinity, cpuMax = -Infinity, cpuSum = 0, cpuCount = 0;
    let gpuMin = Infinity, gpuMax = -Infinity, gpuSum = 0, gpuCount = 0;
    let peakRam = 0;

    for (const h of validHistory) {
      if (typeof h.cpuTemp === 'number') {
        if (h.cpuTemp < cpuMin) cpuMin = h.cpuTemp;
        if (h.cpuTemp > cpuMax) cpuMax = h.cpuTemp;
        cpuSum += h.cpuTemp;
        cpuCount++;
      }
      if (typeof h.gpuTemp === 'number') {
        if (h.gpuTemp < gpuMin) gpuMin = h.gpuTemp;
        if (h.gpuTemp > gpuMax) gpuMax = h.gpuTemp;
        gpuSum += h.gpuTemp;
        gpuCount++;
      }
      if (typeof h.ramPercent === 'number' && h.ramPercent > peakRam) {
        peakRam = h.ramPercent;
      }
    }

    return {
      cpuMin: cpuCount > 0 ? Number(cpuMin.toFixed(1)) : '--',
      cpuMax: cpuCount > 0 ? Number(cpuMax.toFixed(1)) : '--',
      cpuAvg: cpuCount > 0 ? Number((cpuSum / cpuCount).toFixed(1)) : '--',
      gpuMin: gpuCount > 0 ? Number(gpuMin.toFixed(1)) : '--',
      gpuMax: gpuCount > 0 ? Number(gpuMax.toFixed(1)) : '--',
      gpuAvg: gpuCount > 0 ? Number((gpuSum / gpuCount).toFixed(1)) : '--',
      peakRam: Number(peakRam.toFixed(1)),
      samples: validHistory.length,
    };
  }, [validHistory]);

  const svgWidth = 840;
  const svgHeight = 220;
  const padding = { top: 20, right: 24, bottom: 28, left: 42 };
  const plotWidth = svgWidth - padding.left - padding.right;
  const plotHeight = svgHeight - padding.top - padding.bottom;

  // Escala de temperatura: 20°C a 105°C
  const minTempScale = 20;
  const maxTempScale = 105;

  const tempPointsCpu = useMemo(() => {
    return validHistory.map((pt, i) => {
      const x = padding.left + (i / Math.max(1, validHistory.length - 1)) * plotWidth;
      const t = pt.cpuTemp !== null ? Math.max(minTempScale, Math.min(maxTempScale, pt.cpuTemp)) : minTempScale;
      const y = padding.top + (1 - (t - minTempScale) / (maxTempScale - minTempScale)) * plotHeight;
      return { x, y, val: pt.cpuTemp, time: pt.time };
    });
  }, [validHistory, plotWidth, plotHeight, padding.left, padding.top]);

  const tempPointsGpu = useMemo(() => {
    return validHistory.map((pt, i) => {
      const x = padding.left + (i / Math.max(1, validHistory.length - 1)) * plotWidth;
      const t = pt.gpuTemp !== null ? Math.max(minTempScale, Math.min(maxTempScale, pt.gpuTemp)) : minTempScale;
      const y = padding.top + (1 - (t - minTempScale) / (maxTempScale - minTempScale)) * plotHeight;
      return { x, y, val: pt.gpuTemp, time: pt.time };
    });
  }, [validHistory, plotWidth, plotHeight, padding.left, padding.top]);

  // Escala de carga: 0% a 100%
  const loadPointsCpu = useMemo(() => {
    return validHistory.map((pt, i) => {
      const x = padding.left + (i / Math.max(1, validHistory.length - 1)) * plotWidth;
      const l = Math.max(0, Math.min(100, pt.cpuLoad || 0));
      const y = padding.top + (1 - l / 100) * plotHeight;
      return { x, y, val: pt.cpuLoad, time: pt.time };
    });
  }, [validHistory, plotWidth, plotHeight, padding.left, padding.top]);

  const loadPointsGpu = useMemo(() => {
    return validHistory.map((pt, i) => {
      const x = padding.left + (i / Math.max(1, validHistory.length - 1)) * plotWidth;
      const l = Math.max(0, Math.min(100, pt.gpuLoad || 0));
      const y = padding.top + (1 - l / 100) * plotHeight;
      return { x, y, val: pt.gpuLoad, time: pt.time };
    });
  }, [validHistory, plotWidth, plotHeight, padding.left, padding.top]);

  const loadPointsRam = useMemo(() => {
    return validHistory.map((pt, i) => {
      const x = padding.left + (i / Math.max(1, validHistory.length - 1)) * plotWidth;
      const l = Math.max(0, Math.min(100, pt.ramPercent || 0));
      const y = padding.top + (1 - l / 100) * plotHeight;
      return { x, y, val: pt.ramPercent, time: pt.time };
    });
  }, [validHistory, plotWidth, plotHeight, padding.left, padding.top]);

  const splineCpuTemp = useMemo(() => getSplinePath(tempPointsCpu), [tempPointsCpu]);
  const splineGpuTemp = useMemo(() => getSplinePath(tempPointsGpu), [tempPointsGpu]);
  const splineCpuLoad = useMemo(() => getSplinePath(loadPointsCpu), [loadPointsCpu]);
  const splineGpuLoad = useMemo(() => getSplinePath(loadPointsGpu), [loadPointsGpu]);
  const splineRamLoad = useMemo(() => getSplinePath(loadPointsRam), [loadPointsRam]);

  const activeCpuPoint = hoverIndex !== null && tempPointsCpu[hoverIndex]
    ? tempPointsCpu[hoverIndex]
    : tempPointsCpu[tempPointsCpu.length - 1];

  const activeGpuPoint = hoverIndex !== null && tempPointsGpu[hoverIndex]
    ? tempPointsGpu[hoverIndex]
    : tempPointsGpu[tempPointsGpu.length - 1];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>
      {/* Barra de Resumo da Sessão */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
        <BentoCard style={{ padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              CPU Térmico
            </span>
            <span style={{ fontSize: '0.68rem', color: 'var(--color-nominal)', fontFamily: 'var(--font-mono)' }}>
              {stats.samples} amostras
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span className="tabular-nums" style={{ fontSize: '1.45rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {typeof cpuTemp === 'number' ? `${cpuTemp}°C` : '--'}
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>atual</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
            <span>Mín: <strong className="tabular-nums" style={{ color: 'var(--text-primary)' }}>{stats.cpuMin}°C</strong></span>
            <span>Méd: <strong className="tabular-nums" style={{ color: 'var(--text-primary)' }}>{stats.cpuAvg}°C</strong></span>
            <span>Máx: <strong className="tabular-nums" style={{ color: 'var(--color-elevated)' }}>{stats.cpuMax}°C</strong></span>
          </div>
        </BentoCard>

        <BentoCard style={{ padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              GPU Térmico
            </span>
            <span style={{ fontSize: '0.68rem', color: 'var(--color-accent)', fontFamily: 'var(--font-mono)' }}>
              AMD ADL
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span className="tabular-nums" style={{ fontSize: '1.45rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {typeof gpuTemp === 'number' ? `${gpuTemp}°C` : '--'}
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>atual</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
            <span>Mín: <strong className="tabular-nums" style={{ color: 'var(--text-primary)' }}>{stats.gpuMin}°C</strong></span>
            <span>Méd: <strong className="tabular-nums" style={{ color: 'var(--text-primary)' }}>{stats.gpuAvg}°C</strong></span>
            <span>Máx: <strong className="tabular-nums" style={{ color: 'var(--color-elevated)' }}>{stats.gpuMax}°C</strong></span>
          </div>
        </BentoCard>

        <BentoCard style={{ padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Memória & Carga
            </span>
            <span style={{ fontSize: '0.68rem', color: 'var(--color-nominal)', fontFamily: 'var(--font-mono)' }}>
              Host V8
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span className="tabular-nums" style={{ fontSize: '1.45rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {cpuLoad.toFixed(1)}%
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>CPU</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
            <span>GPU: <strong className="tabular-nums" style={{ color: 'var(--text-primary)' }}>{gpuLoad.toFixed(1)}%</strong></span>
            <span>RAM: <strong className="tabular-nums" style={{ color: 'var(--text-primary)' }}>{ramPercent.toFixed(1)}%</strong></span>
            <span>Pico RAM: <strong className="tabular-nums" style={{ color: 'var(--color-accent)' }}>{stats.peakRam}%</strong></span>
          </div>
        </BentoCard>
      </div>

      {/* Gráfico 1: Trajetória Térmica Contínua */}
      <BentoCard style={{ padding: '18px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
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
                color: 'var(--color-nominal)',
              }}
            >
              <Flame size={14} />
            </div>
            <div>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                Histórico Térmico Contínuo
              </h3>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                Acompanhamento temporal em tempo real (°C) de CPU e GPU
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '0.75rem' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)' }}>
              <span style={{ width: '10px', height: '2px', background: 'var(--color-nominal)', display: 'inline-block' }} />
              CPU: <strong className="tabular-nums" style={{ color: 'var(--text-primary)' }}>{activeCpuPoint?.val != null ? `${activeCpuPoint.val}°C` : '--'}</strong>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)' }}>
              <span style={{ width: '10px', height: '2px', background: 'var(--color-accent)', display: 'inline-block' }} />
              GPU: <strong className="tabular-nums" style={{ color: 'var(--text-primary)' }}>{activeGpuPoint?.val != null ? `${activeGpuPoint.val}°C` : '--'}</strong>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)' }}>
              <Clock size={12} /> {activeCpuPoint?.time || 'Agora'}
            </span>
          </div>
        </div>

        {/* SVG Plot */}
        <div style={{ width: '100%', overflowX: 'auto' }}>
          <svg
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            style={{ width: '100%', height: 'auto', display: 'block', maxHeight: '240px' }}
            onMouseLeave={() => setHoverIndex(null)}
          >
            {/* Linhas de Grade de Temperatura */}
            {[20, 40, 60, 80, 100].map((t) => {
              const y = padding.top + (1 - (t - minTempScale) / (maxTempScale - minTempScale)) * plotHeight;
              const isThrottlingLine = t === 80;
              return (
                <g key={t}>
                  <line
                    x1={padding.left}
                    y1={y}
                    x2={padding.left + plotWidth}
                    y2={y}
                    stroke={isThrottlingLine ? 'rgba(239, 68, 68, 0.25)' : 'var(--border-hairline)'}
                    strokeDasharray={isThrottlingLine ? '3 3' : undefined}
                    strokeWidth="1"
                  />
                  <text
                    x={padding.left - 8}
                    y={y + 3}
                    textAnchor="end"
                    fill={isThrottlingLine ? 'var(--color-critical)' : 'var(--text-dim)'}
                    fontSize="9"
                    fontFamily="var(--font-mono)"
                  >
                    {t}°
                  </text>
                </g>
              );
            })}

            {/* Linha de Trajetória da CPU */}
            {splineCpuTemp && (
              <path
                d={splineCpuTemp}
                fill="none"
                stroke="var(--color-nominal)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Linha de Trajetória da GPU */}
            {splineGpuTemp && (
              <path
                d={splineGpuTemp}
                fill="none"
                stroke="var(--color-accent)"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Marcadores Interativos na Curva */}
            {tempPointsCpu.map((pt, i) => (
              <circle
                key={i}
                cx={pt.x}
                cy={pt.y}
                r={hoverIndex === i ? 4 : 2}
                fill={hoverIndex === i ? 'var(--color-nominal)' : 'var(--bg-card)'}
                stroke="var(--color-nominal)"
                strokeWidth="1.5"
                onMouseEnter={() => setHoverIndex(i)}
                style={{ cursor: 'pointer', transition: 'r 0.1s ease' }}
              />
            ))}
          </svg>
        </div>
      </BentoCard>

      {/* Gráfico 2: Utilização de Recursos (%) */}
      <BentoCard style={{ padding: '18px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
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
                color: 'var(--color-accent)',
              }}
            >
              <Zap size={14} />
            </div>
            <div>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                Utilização de Carga do Sistema (%)
              </h3>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                Perfil contínuo de CPU, GPU e Memória RAM
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '0.75rem' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)' }}>
              <span style={{ width: '10px', height: '2px', background: 'var(--color-nominal)', display: 'inline-block' }} />
              CPU: <strong className="tabular-nums" style={{ color: 'var(--text-primary)' }}>{cpuLoad.toFixed(1)}%</strong>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)' }}>
              <span style={{ width: '10px', height: '2px', background: 'var(--color-accent)', display: 'inline-block' }} />
              GPU: <strong className="tabular-nums" style={{ color: 'var(--text-primary)' }}>{gpuLoad.toFixed(1)}%</strong>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)' }}>
              <span style={{ width: '10px', height: '2px', background: 'var(--color-elevated)', display: 'inline-block' }} />
              RAM: <strong className="tabular-nums" style={{ color: 'var(--text-primary)' }}>{ramPercent.toFixed(1)}%</strong>
            </span>
          </div>
        </div>

        {/* SVG Plot */}
        <div style={{ width: '100%', overflowX: 'auto' }}>
          <svg
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            style={{ width: '100%', height: 'auto', display: 'block', maxHeight: '240px' }}
          >
            {/* Linhas de Grade de Carga */}
            {[0, 25, 50, 75, 100].map((l) => {
              const y = padding.top + (1 - l / 100) * plotHeight;
              return (
                <g key={l}>
                  <line
                    x1={padding.left}
                    y1={y}
                    x2={padding.left + plotWidth}
                    y2={y}
                    stroke="var(--border-hairline)"
                    strokeWidth="1"
                  />
                  <text
                    x={padding.left - 8}
                    y={y + 3}
                    textAnchor="end"
                    fill="var(--text-dim)"
                    fontSize="9"
                    fontFamily="var(--font-mono)"
                  >
                    {l}%
                  </text>
                </g>
              );
            })}

            {/* Linha de Carga CPU */}
            {splineCpuLoad && (
              <path
                d={splineCpuLoad}
                fill="none"
                stroke="var(--color-nominal)"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Linha de Carga GPU */}
            {splineGpuLoad && (
              <path
                d={splineGpuLoad}
                fill="none"
                stroke="var(--color-accent)"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Linha de RAM */}
            {splineRamLoad && (
              <path
                d={splineRamLoad}
                fill="none"
                stroke="var(--color-elevated)"
                strokeWidth="1.6"
                strokeDasharray="4 2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
          </svg>
        </div>
      </BentoCard>
    </div>
  );
}
