import React, { useMemo, useState } from 'react';
import { BentoCard } from '../ui/BentoCard';
import { Activity, Clock } from 'lucide-react';

/**
 * Utilitário para construir Monotone Cubic Spline (Curva Suavizada de Osciloscópio)
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

  const svgWidth = 600;
  const svgHeight = 220;
  const padding = { top: 18, right: 18, bottom: 26, left: 36 };

  const plotWidth = svgWidth - padding.left - padding.right;
  const plotHeight = svgHeight - padding.top - padding.bottom;

  // Escala fixa: 20°C a 100°C
  const minTemp = 20;
  const maxTemp = 100;

  const tempPoints = useMemo(() => {
    return dataPoints.map((pt, i) => {
      const x = padding.left + (i / Math.max(1, dataPoints.length - 1)) * plotWidth;
      const t = Math.max(minTemp, Math.min(maxTemp, pt.temp));
      const y = padding.top + (1 - (t - minTemp) / (maxTemp - minTemp)) * plotHeight;
      return { x, y, temp: pt.temp, load: pt.load, time: pt.time };
    });
  }, [dataPoints, plotWidth, plotHeight, padding.left, padding.top]);

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
      {/* Topo: Identificação e Legenda Técnica */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '8px',
          flexWrap: 'wrap',
          gap: '8px',
        }}
      >
        <div>
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
                color: 'var(--text-secondary)',
              }}
            >
              <Activity size={15} />
            </div>
            <div>
              <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                Histórico Temporal
              </span>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                Janela deslizante contínua de 30 minutos
              </div>
            </div>
          </div>
        </div>

        {/* Legenda Calibrada */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '0.74rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span
              style={{
                width: '12px',
                height: '2px',
                background: 'var(--color-nominal)',
              }}
            />
            <span style={{ color: 'var(--text-secondary)' }}>Temperatura</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span
              style={{
                width: '12px',
                height: '2px',
                borderTop: '2px dashed var(--text-muted)',
              }}
            />
            <span style={{ color: 'var(--text-muted)' }}>Carga (%)</span>
          </div>
        </div>
      </div>

      {/* Área Gráfica com Grade Técnica de Precisão */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '240px',
          background: 'var(--bg-inset)',
          borderRadius: 'var(--border-radius-inner)',
          border: '1px solid var(--border-hairline)',
          overflow: 'hidden',
          padding: '6px',
        }}
      >
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          preserveAspectRatio="none"
          style={{ width: '100%', height: '100%', overflow: 'visible' }}
          onMouseLeave={() => setHoverIndex(null)}
        >
          {/* Linhas de Grade de Referência */}
          {[80, 60, 40].map((tempLvl) => {
            const y = padding.top + (1 - (tempLvl - minTemp) / (maxTemp - minTemp)) * plotHeight;
            return (
              <g key={tempLvl}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={svgWidth - padding.right}
                  y2={y}
                  stroke="var(--border-hairline)"
                  strokeDasharray="2 3"
                />
                <text
                  x={padding.left - 8}
                  y={y + 3}
                  textAnchor="end"
                  fill="var(--text-dim)"
                  fontSize="9"
                  fontFamily="var(--font-mono)"
                >
                  {tempLvl}°
                </text>
              </g>
            );
          })}

          {/* Área Translúcida Unicolor Suave (Sem gradientes artificiais multicoloridos) */}
          {areaD && (
            <path
              d={areaD}
              fill="var(--color-nominal)"
              fillOpacity="0.05"
            />
          )}

          {/* Curva de Carga CPU em linha tracejada discreta */}
          {loadSplineD && (
            <path
              d={loadSplineD}
              fill="none"
              stroke="var(--text-muted)"
              strokeWidth="1.2"
              strokeDasharray="3 3"
              opacity="0.5"
            />
          )}

          {/* Curva Principal de Temperatura com traço nítido */}
          {splineD && (
            <path
              d={splineD}
              fill="none"
              stroke="var(--color-nominal)"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Zonas Interativas de Hover */}
          {tempPoints.map((pt, i) => (
            <g key={i}>
              <rect
                x={pt.x - 10}
                y={padding.top}
                width={20}
                height={plotHeight}
                fill="transparent"
                style={{ cursor: 'crosshair' }}
                onMouseEnter={() => setHoverIndex(i)}
              />
              {hoverIndex === i && (
                <>
                  <line
                    x1={pt.x}
                    y1={padding.top}
                    x2={pt.x}
                    y2={padding.top + plotHeight}
                    stroke="var(--border-subtle)"
                    strokeWidth="1"
                    strokeDasharray="2 2"
                  />
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={3.5}
                    fill="var(--bg-card)"
                    stroke="var(--color-nominal)"
                    strokeWidth={2}
                  />
                </>
              )}
            </g>
          ))}
        </svg>

        {/* Mini Tooltip de Leitura no Hover */}
        {activePoint && (
          <div
            style={{
              position: 'absolute',
              top: '10px',
              right: '12px',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--border-radius-sm)',
              padding: '4px 8px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              fontSize: '0.72rem',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono)',
              pointerEvents: 'none',
            }}
          >
            <span>
              T: <strong style={{ color: 'var(--color-nominal)' }}>{activePoint.temp}°C</strong>
            </span>
            <span style={{ color: 'var(--border-subtle)' }}>|</span>
            <span>
              Carga: <strong style={{ color: 'var(--text-secondary)' }}>{Math.round(activePoint.load || 0)}%</strong>
            </span>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.68rem' }}>({activePoint.time})</span>
          </div>
        )}
      </div>

      {/* Rodapé com Amostragem */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: '8px',
          fontSize: '0.7rem',
          color: 'var(--text-muted)',
          fontFamily: 'var(--font-mono)',
        }}
      >
        <span>Amostragem: 1.2s</span>
        <span>Buffer: {dataPoints.length} pontos</span>
      </div>
    </BentoCard>
  );
}
