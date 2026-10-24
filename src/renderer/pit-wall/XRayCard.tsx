import { useState } from 'react';
import { ScanLine } from 'lucide-react';
import type { TelemetryFrame } from '../realtime/protocol';
import { BentoCard, Muted } from './BentoCard';
import { thermalColor } from './thermal-color';
import { DASH, num } from './format';

interface XRayCardProps {
  frame: TelemetryFrame;
  highlight?: boolean;
  className?: string;
}

interface Zone {
  id: string;
  label: string;
  tempC: number | null;
  detail: string;
  /** Retângulo da zona no SVG (x, y, largura, altura). */
  rect: [number, number, number, number];
}

const LEGEND_STOPS = [25, 45, 60, 75, 85, 95];

/**
 * Modo Raio-X: o gabinete visto de lado, com cada componente colorido pela temperatura real
 * (azul frio → vermelho crítico). Toque numa zona para ver os detalhes.
 */
export function XRayCard({ frame, highlight, className }: XRayCardProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const zones = buildZones(frame);
  const active = zones.find((z) => z.id === selected) ?? null;

  const cpuFan = frame.fans.find((f) => /cpu/i.test(f.name))?.rpm ?? null;
  const caseFan = frame.fans.find((f) => !/cpu|pump/i.test(f.name))?.rpm ?? null;

  return (
    <BentoCard title="Raio-X" icon={ScanLine} highlight={highlight} className={className}>
      <svg
        viewBox="0 0 400 260"
        className="h-auto w-full select-none"
        role="img"
        aria-label="Mapa de calor do gabinete"
      >
        <defs>
          {zones.map((z) => (
            <radialGradient key={z.id} id={`heat-${z.id}`} cx="50%" cy="50%" r="70%">
              <stop offset="0%" stopColor={thermalColor(z.tempC)} stopOpacity={z.tempC === null ? 0.5 : 0.95} />
              <stop offset="100%" stopColor={thermalColor(z.tempC)} stopOpacity={z.tempC === null ? 0.25 : 0.35} />
            </radialGradient>
          ))}
          <linearGradient id="xray-legend" x1="0" x2="1">
            {LEGEND_STOPS.map((t, i) => (
              <stop key={t} offset={`${(i / (LEGEND_STOPS.length - 1)) * 100}%`} stopColor={thermalColor(t)} />
            ))}
          </linearGradient>
        </defs>

        {/* Gabinete e placa-mãe */}
        <rect x="4" y="4" width="392" height="226" rx="10" fill="var(--subtle)" stroke="var(--border-strong)" />
        <rect
          x="150"
          y="14"
          width="236"
          height="170"
          rx="4"
          fill="none"
          stroke="var(--border-strong)"
          strokeDasharray="4 3"
        />
        <rect x="14" y="196" width="130" height="28" rx="4" fill="var(--subtle)" stroke="var(--border)" />
        <text x="79" y="214" textAnchor="middle" className="fill-fg-3 text-[10px]">
          Fonte
        </text>

        {/* Fluxo de ar: entra pela frente, sai por trás */}
        {[60, 130].map((y) => (
          <path
            key={y}
            d={`M 40 ${y} C 110 ${y}, 150 ${y - 20}, 360 30`}
            fill="none"
            stroke="var(--accent)"
            strokeOpacity="0.35"
            strokeWidth="2"
            strokeDasharray="6 6"
            className="motion-safe:animate-flow"
            style={flowSpeed(caseFan)}
          />
        ))}
        <Fan cx={30} cy={60} rpm={caseFan} label="Entrada" />
        <Fan cx={30} cy={130} rpm={caseFan} label="Entrada" />
        <Fan cx={372} cy={36} rpm={caseFan} label="Saída" small />

        {zones.map((z) => {
          const [x, y, w, h] = z.rect;
          const isActive = z.id === selected;
          return (
            <g
              key={z.id}
              role="button"
              tabIndex={0}
              aria-label={`${z.label}: ${z.tempC === null ? 'sem sensor' : `${num(z.tempC)} graus`}`}
              className="cursor-pointer outline-none"
              onClick={() => setSelected(isActive ? null : z.id)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setSelected(isActive ? null : z.id)}
            >
              <rect
                x={x}
                y={y}
                width={w}
                height={h}
                rx="4"
                fill={`url(#heat-${z.id})`}
                stroke={isActive ? 'var(--text)' : 'var(--border-strong)'}
                strokeWidth={isActive ? 2 : 1}
                className="transition-[fill] duration-700"
              />
              <text x={x + w / 2} y={y + h / 2 - 2} textAnchor="middle" className="fill-fg text-[11px] font-semibold">
                {z.label}
              </text>
              <text x={x + w / 2} y={y + h / 2 + 11} textAnchor="middle" className="fill-fg text-[10px] tabular-nums">
                {z.tempC === null ? DASH : `${num(z.tempC)} °C`}
              </text>
            </g>
          );
        })}

        <Fan cx={233} cy={66} rpm={cpuFan} small />
        <Fan cx={235} cy={163} rpm={frame.gpu.fanRpm} small />

        {/* Legenda */}
        <rect x="160" y="240" width="160" height="8" rx="4" fill="url(#xray-legend)" />
        <text x="154" y="248" textAnchor="end" className="fill-fg-3 text-[9px]">
          25 °C
        </text>
        <text x="326" y="248" className="fill-fg-3 text-[9px]">
          95 °C
        </text>
      </svg>
      <Muted>{active ? `${active.label}: ${active.detail}` : 'Toque num componente para ver os detalhes.'}</Muted>
    </BentoCard>
  );
}

function buildZones(f: TelemetryFrame): Zone[] {
  const nvme = f.storage[0];
  return [
    {
      id: 'vrm',
      label: 'VRM',
      tempC: f.board.vrmTempC,
      detail:
        f.board.vrmTempC === null ? 'a placa-mãe não informa a temperatura do VRM' : 'reguladores de tensão da CPU',
      rect: [160, 22, 40, 88],
    },
    {
      id: 'cpu',
      label: 'CPU',
      tempC: f.cpu.tempC,
      detail: `${num(f.cpu.loadPct)}% de uso, ${num(f.cpu.powerW)} W${f.cpu.tempSource === 'ioDie' ? ' (die de E/S)' : ''}`,
      rect: [208, 40, 54, 54],
    },
    {
      id: 'ram',
      label: 'RAM',
      tempC: null,
      detail: `${num(f.memory.loadPct)}% em uso (os pentes não têm sensor de temperatura)`,
      rect: [276, 22, 34, 88],
    },
    {
      id: 'nvme',
      label: 'NVMe',
      tempC: nvme?.tempC ?? null,
      detail: nvme ? nvme.name : 'nenhum SSD informou temperatura',
      rect: [320, 118, 56, 22],
    },
    {
      id: 'gpu',
      label: 'GPU',
      tempC: f.gpu.tempC,
      detail: `ponto mais quente ${num(f.gpu.hotspotC)} °C, memória ${num(f.gpu.memoryTempC)} °C, ${num(f.gpu.powerW)} W`,
      rect: [160, 146, 160, 34],
    },
  ];
}

/** Uma volta a cada (60 / rpm) s, desacelerada 20× para continuar visível (1200 RPM = 1 volta/s). */
function spinSeconds(rpm: number | null): number | null {
  if (rpm === null || rpm <= 0) return null;
  return Math.min(4, Math.max(0.15, (60 / rpm) * 20));
}

function flowSpeed(rpm: number | null) {
  const s = spinSeconds(rpm);
  return { animationDuration: `${s ?? 2}s` };
}

function Fan({
  cx,
  cy,
  rpm,
  label,
  small,
}: {
  cx: number;
  cy: number;
  rpm: number | null;
  label?: string;
  small?: boolean;
}) {
  const r = small ? 10 : 18;
  const s = spinSeconds(rpm);
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="var(--card)" stroke="var(--border-strong)" />
      <g
        className={s ? 'motion-safe:animate-spin' : undefined}
        style={{ transformBox: 'fill-box', transformOrigin: 'center', animationDuration: `${s ?? 0}s` }}
      >
        {[0, 120, 240].map((a) => (
          <path
            key={a}
            d={`M ${cx} ${cy} q ${r * 0.5} ${-r * 0.2} ${r * 0.8} ${-r * 0.7}`}
            stroke="var(--text-secondary)"
            strokeWidth="2"
            fill="none"
            transform={`rotate(${a} ${cx} ${cy})`}
          />
        ))}
      </g>
      {label && (
        <text x={cx} y={cy + r + 11} textAnchor="middle" className="fill-fg-3 text-[9px]">
          {label}
        </text>
      )}
    </g>
  );
}
