import { useEffect, useMemo, useRef, useState } from 'react';
import { isNum, clockTime } from '../lib/format';

const HEIGHT = 220;
const PAD = { top: 12, right: 12, bottom: 24, left: 36 };

/**
 * Gráfico de linhas em SVG para séries temporais da telemetria.
 * Lacunas (sem leitura) interrompem a linha em vez de serem interpoladas.
 */
export function LineChart({ samples, series, min = 0, max = 100, unit = '', threshold, height = HEIGHT }) {
  const [hover, setHover] = useState(null);
  const wrapperRef = useRef(null);
  const [width, setWidth] = useState(800);

  // A largura real do contêiner vira o viewBox: o SVG não estica texto nem linhas
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(200, Math.round(entry.contentRect.width))));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const plotW = width - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;

  const { paths, xOf, yOf } = useMemo(() => {
    const n = samples.length;
    const xOfFn = (i) => PAD.left + (n <= 1 ? plotW : (i / (n - 1)) * plotW);
    const yOfFn = (v) => PAD.top + (1 - (Math.max(min, Math.min(max, v)) - min) / (max - min)) * plotH;
    const built = series.map((s) => {
      let d = '';
      let penDown = false;
      samples.forEach((sample, i) => {
        const v = sample[s.key];
        if (!isNum(v)) {
          penDown = false;
          return;
        }
        d += `${penDown ? 'L' : 'M'}${xOfFn(i).toFixed(1)},${yOfFn(v).toFixed(1)}`;
        penDown = true;
      });
      return { ...s, d };
    });
    return { paths: built, xOf: xOfFn, yOf: yOfFn };
  }, [samples, series, min, max, plotW, plotH]);

  const ticks = [min, min + (max - min) / 2, max];

  const handleMove = (event) => {
    if (samples.length === 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * width;
    const ratio = (x - PAD.left) / plotW;
    const idx = Math.round(ratio * (samples.length - 1));
    setHover(Math.max(0, Math.min(samples.length - 1, idx)));
  };

  const hovered = hover !== null ? samples[hover] : null;

  return (
    <div ref={wrapperRef}>
      <svg
        className="chart"
        viewBox={`0 0 ${width} ${height}`}
        style={{ height }}
        onMouseMove={handleMove}
        onMouseLeave={() => setHover(null)}
        role="img"
        aria-label={series.map((s) => s.label).join(', ')}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={width - PAD.right} y1={yOf(t)} y2={yOf(t)} stroke="var(--border)" />
            <text x={PAD.left - 6} y={yOf(t) + 4} textAnchor="end" fontSize="11" fill="var(--text-tertiary)">
              {Math.round(t)}
            </text>
          </g>
        ))}

        {isNum(threshold) && threshold <= max && (
          <line
            x1={PAD.left}
            x2={width - PAD.right}
            y1={yOf(threshold)}
            y2={yOf(threshold)}
            stroke="var(--critical)"
            strokeDasharray="4 4"
          />
        )}

        {paths.map((p) => (
          <path key={p.key} d={p.d} fill="none" stroke={p.color} strokeWidth="2" strokeLinejoin="round" />
        ))}

        {hovered && (
          <line x1={xOf(hover)} x2={xOf(hover)} y1={PAD.top} y2={height - PAD.bottom} stroke="var(--text-tertiary)" />
        )}
      </svg>

      <div className="chart-legend">
        {series.map((s) => (
          <span key={s.key}>
            <i style={{ background: s.color }} />
            {s.label}
            {hovered && (
              <b className="tabular" style={{ color: 'var(--text)' }}>
                {isNum(hovered[s.key]) ? `${hovered[s.key].toFixed(1)}${unit}` : 'sem leitura'}
              </b>
            )}
          </span>
        ))}
        {hovered && <span className="faint">{clockTime(hovered.t)}</span>}
        {isNum(threshold) && !hovered && (
          <span>
            <i style={{ background: 'var(--critical)' }} />
            Limite de alerta {threshold}
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}
