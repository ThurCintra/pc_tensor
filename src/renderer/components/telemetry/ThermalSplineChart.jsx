import React, { useMemo, useState } from 'react';
import { BentoCard } from '../ui/BentoCard';
import { TrendingUp, Clock } from 'lucide-react';

/**
 * Utilitário para construir Monotone Cubic Spline (Curva Suavizada)
 */
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

export function ThermalSplineChart({
  history = [],
  currentTemp = 45,
  currentLoad = 30,
  className = '',
}) {
  const [hoverIndex, setHoverIndex] = useState(null);

  // Garante ao menos dados para preencher a linha se o app acabou de abrir
  const dataPoints = useMemo(() => {
    if (history.length >= 2) return history;
    const base = currentTemp || 42;
    const load = currentLoad || 25;
    return [
      { temp: base - 2, load: load - 5, time: '28m' },
      { temp: base - 1, load: load, time: '20m' },
      { temp: base + 3, load: load + 8, time: '12m' },
      { temp: base + 1, load: load + 3, time: '5m' },
      { temp: base, load: load, time: 'Agora' },
    ];
  }, [history, currentTemp, currentLoad]);

  // Dimensões do SVG do gráfico
  const svgWidth = 600;
  const svgHeight = 220;
  const padding = { top: 20, right: 20, bottom: 30, left: 35 };

  const plotWidth = svgWidth - padding.left - padding.right;
  const plotHeight = svgHeight - padding.top - padding.bottom;

  // Escalas: Temperatura de 20°C a 95°C
  const minTemp = 20;
  const maxTemp = 95;

  const tempPoints = useMemo(() => {
    return dataPoints.map((pt, i) => {
      const x = padding.left + (i / Math.max(1, dataPoints.length - 1)) * plotWidth;
      const t = Math.max(minTemp, Math.min(maxTemp, pt.temp));
      const y = padding.top + (1 - (t - minTemp) / (maxTemp - minTemp)) * plotHeight;
      return { x, y, temp: pt.temp, load: pt.load, time: pt.time };
    });
  }, [dataPoints, plotWidth, plotHeight, padding.left, padding.top]);

  // Pontos de carga (0% a 100%)
  const loadPoints = useMemo(() => {
    return dataPoints.map((pt, i) => {
      const x = padding.left + (i / Math.max(1, dataPoints.length - 1)) * plotWidth;
      const l = Math.max(0, Math.min(100, pt.load || 0));
      const y = padding.top + (1 - l / 100) * plotHeight;
      return { x, y };
    });
  }, [dataPoints, plotWidth, plotHeight, padding.left, padding.top]);

  const splineD = useMemo(() => getSplinePath(tempPoints), [tempPoints]);
  const loadSplineD = useMemo(() => getSplinePath(loadPoints), [loadPoints]);

  // Área fechada para o gradiente de preenchimento
  const areaD = useMemo(() => {
    if (!splineD || tempPoints.length === 0) return '';
    const last = tempPoints[tempPoints.length - 1];
    const first = tempPoints[0];
    const baselineY = padding.top + plotHeight;
    return `${splineD} L ${last.x} ${baselineY} L ${first.x} ${baselineY} Z`;
  }, [splineD, tempPoints, padding.top, plotHeight]);

  const activePoint = hoverIndex !== null && tempPoints[hoverIndex] 
    ? tempPoints[hoverIndex] 
    : tempPoints[tempPoints.length - 1];

  return (
    <BentoCard
      className={className || 'bento-col-6'}
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        minHeight: '340px',
      }}
    >
      {/* Topo: Header com Insights e Legenda */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '10px',
          flexWrap: 'wrap',
          gap: '8px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <TrendingUp size={16} color="#00F0FF" />
            <h3 style={{ fontSize: '0.85rem', fontWeight: 600, color: '#F3F4F6', letterSpacing: '0.5px' }}>
              TENDÊNCIA TEMPORAL
            </h3>
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '0.68rem',
                color: '#6B7280',
                background: 'rgba(255, 255, 255, 0.04)',
                padding: '2px 8px',
                borderRadius: '4px',
              }}
            >
              <Clock size={11} /> 30 min
            </span>
          </div>
          <p style={{ fontSize: '0.72rem', color: '#6B7280', marginTop: '2px' }}>
            Dinâmica térmica contínua sincronizada com a carga do processador
          </p>
        </div>

        {/* Legenda de Cores */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '0.72rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span
              style={{
                width: '12px',
                height: '3px',
                borderRadius: '2px',
                background: 'linear-gradient(90deg, #00F0FF, #FF8A00, #FF2A54)',
              }}
            />
            <span style={{ color: '#9CA3AF' }}>Temp (°C)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span
              style={{
                width: '12px',
                height: '2px',
                borderTop: '2px dashed #10B981',
              }}
            />
            <span style={{ color: '#9CA3AF' }}>Carga CPU (%)</span>
          </div>
        </div>
      </div>

      {/* Área Central: SVG Canvas com Gradiente Vertical no Eixo Y */}
      <div style={{ position: 'relative', width: '100%', height: '240px' }}>
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          preserveAspectRatio="none"
          style={{ width: '100%', height: '100%', overflow: 'visible' }}
          onMouseLeave={() => setHoverIndex(null)}
        >
          <defs>
            {/* Gradiente Vertical Dinâmico no Eixo Y (Regra 3.2 da especificação):
                0% (Topo / >76°C): Vermelho-Rubi (#FF2A54)
                45% (Meio / 56°C–75°C): Laranja-Neon (#FF8A00)
                100% (Base / <=55°C): Azul-Ciano (#00F0FF) */}
            <linearGradient id="vertical-y-stroke" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FF2A54" />
              <stop offset="45%" stopColor="#FF8A00" />
              <stop offset="100%" stopColor="#00F0FF" />
            </linearGradient>

            {/* Gradiente da Área Preenchida Translúcida (opacity: 0.25 no topo a 0.0 na base) */}
            <linearGradient id="vertical-y-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FF2A54" stopOpacity="0.25" />
              <stop offset="45%" stopColor="#FF8A00" stopOpacity="0.12" />
              <stop offset="100%" stopColor="#00F0FF" stopOpacity="0.0" />
            </linearGradient>

            <filter id="spline-glow" x="-10%" y="-10%" width="120%" height="120%">
              <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="rgba(0, 240, 255, 0.4)" />
            </filter>
          </defs>

          {/* Grid Horizontal Discreto */}
          {[90, 75, 55, 35].map((tempLvl) => {
            const y = padding.top + (1 - (tempLvl - minTemp) / (maxTemp - minTemp)) * plotHeight;
            return (
              <g key={tempLvl}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={svgWidth - padding.right}
                  y2={y}
                  stroke="rgba(255, 255, 255, 0.05)"
                  strokeDasharray="3 3"
                />
                <text
                  x={padding.left - 6}
                  y={y + 3}
                  textAnchor="end"
                  fill="#4B5563"
                  fontSize="9"
                  fontFamily="var(--font-mono)"
                >
                  {tempLvl}°
                </text>
              </g>
            );
          })}

          {/* Área Translúcida Preenchida */}
          {areaD && <path d={areaD} fill="url(#vertical-y-area)" />}

          {/* Curva Secundária de Carga CPU (%) */}
          {loadSplineD && (
            <path
              d={loadSplineD}
              fill="none"
              stroke="#10B981"
              strokeWidth="1.5"
              strokeDasharray="4 4"
              opacity="0.6"
            />
          )}

          {/* Curva Principal de Temperatura com Gradiente Vertical no Eixo Y */}
          {splineD && (
            <path
              d={splineD}
              fill="none"
              stroke="url(#vertical-y-stroke)"
              strokeWidth="2.5"
              strokeLinecap="round"
              filter="url(#spline-glow)"
              style={{ transition: 'd 0.3s ease' }}
            />
          )}

          {/* Zonas de Interação / Hover nos pontos */}
          {tempPoints.map((pt, i) => (
            <circle
              key={i}
              cx={pt.x}
              cy={pt.y}
              r={hoverIndex === i ? 5 : 3}
              fill={hoverIndex === i ? '#F3F4F6' : 'url(#vertical-y-stroke)'}
              stroke="#0B0F19"
              strokeWidth="2"
              style={{ cursor: 'pointer', transition: 'r 0.15s ease' }}
              onMouseEnter={() => setHoverIndex(i)}
            />
          ))}

          {/* Linha vertical Guia quando em Hover */}
          {activePoint && hoverIndex !== null && (
            <line
              x1={activePoint.x}
              y1={padding.top}
              x2={activePoint.x}
              y2={padding.top + plotHeight}
              stroke="rgba(0, 240, 255, 0.3)"
              strokeDasharray="2 2"
            />
          )}
        </svg>

        {/* Tooltip Dinâmico */}
        {activePoint && (
          <div
            style={{
              position: 'absolute',
              top: '8px',
              right: '12px',
              background: 'rgba(17, 24, 39, 0.92)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '8px',
              padding: '6px 10px',
              display: 'flex',
              gap: '12px',
              fontSize: '0.74rem',
              backdropFilter: 'blur(8px)',
              pointerEvents: 'none',
            }}
          >
            <div>
              <span style={{ color: '#6B7280', fontSize: '0.65rem' }}>TEMP</span>
              <div style={{ color: '#F3F4F6', fontWeight: 700 }} className="tabular-nums">
                {activePoint.temp}°C
              </div>
            </div>
            <div style={{ borderLeft: '1px solid rgba(255,255,255,0.08)', paddingLeft: '8px' }}>
              <span style={{ color: '#6B7280', fontSize: '0.65rem' }}>CARGA</span>
              <div style={{ color: '#10B981', fontWeight: 700 }} className="tabular-nums">
                {activePoint.load}%
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Rodapé: Resumo e Marcadores Temporais */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderTop: '1px solid var(--border-subtle)',
          paddingTop: '8px',
          marginTop: '4px',
          fontSize: '0.72rem',
          color: '#6B7280',
          fontFamily: 'var(--font-mono)',
        }}
      >
        <span>-30 min</span>
        <span>-20 min</span>
        <span>-10 min</span>
        <span style={{ color: '#00F0FF', fontWeight: 600 }}>Tempo Real ●</span>
      </div>
    </BentoCard>
  );
}
