'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Skull, X } from 'lucide-react';
import type { RecordedFrame, CrashReason, CrashSummary } from '@/lib/flight-recorder';
import type { CrashState } from '@/lib/use-device-live';
import type { TelemetryFrame } from '@/lib/telemetry';
import { beforeCrash, num } from './format';

/** Métricas que a linha do tempo sabe desenhar. */
export const SERIES = {
  temps: {
    label: 'Temperaturas',
    unit: '°C',
    lines: [
      { name: 'CPU', color: 'var(--chart-1)', read: (f: TelemetryFrame) => f.cpu.tempC },
      { name: 'GPU', color: 'var(--chart-2)', read: (f: TelemetryFrame) => f.gpu.tempC },
      { name: 'Hotspot', color: 'var(--crit)', read: (f: TelemetryFrame) => f.gpu.hotspotC },
    ],
  },
  power: {
    label: 'Potência',
    unit: 'W',
    lines: [
      { name: 'Sistema', color: 'var(--chart-1)', read: (f: TelemetryFrame) => f.energy.systemPowerW },
      { name: 'GPU', color: 'var(--chart-2)', read: (f: TelemetryFrame) => f.gpu.powerW },
      { name: 'CPU', color: 'var(--chart-3)', read: (f: TelemetryFrame) => f.cpu.powerW },
    ],
  },
  vram: {
    label: 'VRAM',
    unit: '%',
    lines: [
      {
        name: 'VRAM',
        color: 'var(--chart-2)',
        read: (f: TelemetryFrame) =>
          f.gpu.vramUsedMb !== null && f.gpu.vramTotalMb ? (f.gpu.vramUsedMb / f.gpu.vramTotalMb) * 100 : null,
      },
      { name: 'RAM', color: 'var(--chart-1)', read: (f: TelemetryFrame) => f.memory.loadPct },
    ],
  },
  vcore: {
    label: 'Tensão',
    unit: 'V',
    lines: [
      { name: 'CPU', color: 'var(--chart-1)', read: (f: TelemetryFrame) => f.cpu.vcoreV },
      { name: 'GPU', color: 'var(--chart-2)', read: (f: TelemetryFrame) => f.gpu.vcoreV },
    ],
  },
} as const;

export type SeriesKey = keyof typeof SERIES;

const REASONS: Record<CrashReason, string> = {
  crash:
    'O servidor confirmou uma queda abrupta: a conexão caiu sem despedida com o PC sob carga (travamento ou tela azul provável).',
  suspected:
    'A conexão com o PC caiu de repente com ele sob carga. Se não voltar em 20 s, o servidor registra como travamento.',
  recovered: 'Gravação recuperada de uma sessão em que o PC caiu com esta página fechada ou recarregada.',
};

const PEAK_LABELS: Record<keyof CrashSummary['peaks'], [string, string, number]> = {
  cpuTempC: ['CPU', '°C', 0],
  gpuTempC: ['GPU', '°C', 0],
  gpuHotspotC: ['Hotspot da GPU', '°C', 0],
  systemPowerW: ['Potência do sistema', 'W', 0],
  vramUsedMb: ['VRAM usada', 'MB', 0],
  cpuVcoreV: ['Tensão da CPU', 'V', 3],
  gpuVcoreV: ['Tensão da GPU', 'V', 3],
};

/**
 * Data e hora da queda até o milissegundo ("24/10/2026 13:42:07,250").
 * Hora, minuto e segundo precisam ser pedidos junto com os milissegundos: só fractionalSecondDigits
 * faz o Chromium devolver apenas "250".
 */
export function crashTime(ms: number): string {
  return new Date(ms).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
    hour12: false,
  });
}

interface PostMortemProps {
  crash: CrashState;
  onClose: () => void;
  onDelete: () => void;
}

/** "Post-Mortem Crash Inspector": linha do tempo dos últimos 60 s até o milissegundo da queda. */
export function PostMortem({ crash, onClose, onDelete }: PostMortemProps) {
  const { report, summary } = crash;
  const [series, setSeries] = useState<SeriesKey>('temps');
  const [cursor, setCursor] = useState(report.frames.length - 1);
  const closeRef = useRef<HTMLButtonElement>(null);
  const current = report.frames[cursor];

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-bg p-4 md:p-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pm-title"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        <header className="flex items-start gap-3">
          <Skull className="mt-1 text-crit" size={28} aria-hidden />
          <div className="flex-1">
            <h1 id="pm-title" className="text-2xl font-semibold">
              Post-Mortem
            </h1>
            <p className="text-fg-2">
              {REASONS[report.reason]} Último sinal às <strong>{crashTime(report.lastFrameAt)}</strong>.{' '}
              {num(summary.frameCount)} leituras em {num(summary.durationMs / 1000, 1)} s.
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="rounded-lg p-2 text-fg-2 hover:bg-surface-2 hover:text-fg"
            onClick={onClose}
            aria-label="Fechar"
          >
            <X size={16} />
          </button>
        </header>

        <section className="rounded-xl border border-line bg-surface p-4">
          <div className="mb-3 flex flex-wrap gap-2" role="tablist" aria-label="Métrica">
            {(Object.keys(SERIES) as SeriesKey[]).map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={series === key}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${series === key ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-fg-2 hover:text-fg'}`}
                onClick={() => setSeries(key)}
              >
                {SERIES[key].label}
              </button>
            ))}
          </div>
          <TimelineChart frames={report.frames} lastFrameAt={report.lastFrameAt} series={series} cursor={cursor} />
          <input
            type="range"
            min={0}
            max={Math.max(0, report.frames.length - 1)}
            value={cursor}
            onChange={(e) => setCursor(Number(e.target.value))}
            className="mt-2 w-full accent-[var(--accent)]"
            aria-label="Instante inspecionado"
          />
          {current && <FrameDetails entry={current} lastFrameAt={report.lastFrameAt} />}
        </section>

        <section className="rounded-xl border border-line bg-surface p-4">
          <h2 className="mb-2 text-base font-semibold">Picos antes da queda</h2>
          <ul className="grid list-none gap-x-8 gap-y-1 p-0 sm:grid-cols-2">
            {(Object.keys(PEAK_LABELS) as (keyof CrashSummary['peaks'])[]).map((key) => {
              const peak = summary.peaks[key];
              const [label, unit, digits] = PEAK_LABELS[key];
              return (
                <li key={key} className="flex justify-between gap-2 border-b border-line py-1 text-sm">
                  <span className="text-fg-2">{label}</span>
                  <span className="tabular-nums">
                    {peak ? (
                      <>
                        <strong>
                          {num(peak.value, digits)} {unit}
                        </strong>{' '}
                        <span className="text-fg-3">{beforeCrash(peak.msBeforeCrash)}</span>
                      </>
                    ) : (
                      <span className="text-fg-3">sem leitura</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="rounded-lg px-4 py-2 text-sm text-fg-2 hover:bg-surface-2"
            onClick={onDelete}
          >
            Apagar relatório
          </button>
          <button
            type="button"
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:bg-accent-strong"
            onClick={onClose}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

function FrameDetails({ entry, lastFrameAt }: { entry: RecordedFrame; lastFrameAt: number }) {
  const f = entry.frame;
  const items: [string, string][] = [
    ['Instante', beforeCrash(lastFrameAt - entry.t)],
    ['CPU', `${num(f.cpu.tempC)} °C · ${num(f.cpu.loadPct)}% · ${num(f.cpu.vcoreV, 3)} V`],
    ['GPU', `${num(f.gpu.tempC)} °C (hotspot ${num(f.gpu.hotspotC)}) · ${num(f.gpu.powerW)} W`],
    ['VRAM', `${num(f.gpu.vramUsedMb)} de ${num(f.gpu.vramTotalMb)} MB`],
    ['Sistema', `${num(f.energy.systemPowerW)} W · RAM ${num(f.memory.loadPct)}%`],
    ['Em foco', f.context.foregroundExe ?? '—'],
  ];
  return (
    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm md:grid-cols-3">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt className="text-xs text-fg-3">{label}</dt>
          <dd className="tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

const W = 800;
const H = 220;
const PAD = { top: 10, right: 12, bottom: 22, left: 40 };

/** Linha do tempo em SVG: eixo X de −60 s até a queda (linha vermelha), cursor no quadro inspecionado. */
export function TimelineChart({
  frames,
  lastFrameAt,
  series,
  cursor,
}: {
  frames: RecordedFrame[];
  lastFrameAt: number;
  series: SeriesKey;
  cursor: number;
}) {
  const { paths, yTicks, x, cursorX } = useMemo(() => {
    const def = SERIES[series];
    const values = frames
      .flatMap(({ frame }) => def.lines.map((l) => l.read(frame)))
      .filter((v): v is number => v !== null);
    let min = values.length ? Math.min(...values) : 0;
    let max = values.length ? Math.max(...values) : 1;
    if (max - min < 1e-6) {
      min -= 1;
      max += 1;
    }
    const pad = (max - min) * 0.1;
    min -= pad;
    max += pad;

    const first = frames[0]?.t ?? lastFrameAt;
    const span = Math.max(1, lastFrameAt - first);
    const x = (t: number) => PAD.left + ((t - first) / span) * (W - PAD.left - PAD.right);
    const y = (v: number) => PAD.top + (1 - (v - min) / (max - min)) * (H - PAD.top - PAD.bottom);

    const paths = def.lines.map((line) => {
      let d = '';
      let pen = false;
      for (const { t, frame } of frames) {
        const v = line.read(frame);
        if (v === null) {
          pen = false; // lacuna: sem leitura nesse quadro
          continue;
        }
        d += `${pen ? 'L' : 'M'}${x(t).toFixed(1)},${y(v).toFixed(1)} `;
        pen = true;
      }
      return { ...line, d };
    });

    const yTicks = [0, 0.5, 1].map((k) => {
      const v = min + (max - min) * k;
      return { v, y: y(v) };
    });
    const cursorEntry = frames[cursor];
    return { paths, yTicks, x, cursorX: cursorEntry ? x(cursorEntry.t) : null };
  }, [frames, lastFrameAt, series, cursor]);

  const def = SERIES[series];
  const digits = series === 'vcore' ? 2 : 0;

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Linha do tempo: ${def.label}`}>
        {yTicks.map((tick) => (
          <g key={tick.y}>
            <line x1={PAD.left} x2={W - PAD.right} y1={tick.y} y2={tick.y} stroke="var(--border)" />
            <text x={PAD.left - 6} y={tick.y + 4} textAnchor="end" className="fill-fg-3 text-[11px]">
              {num(tick.v, digits)}
            </text>
          </g>
        ))}
        {[60, 45, 30, 15].map((s) => {
          const t = lastFrameAt - s * 1000;
          if (t < (frames[0]?.t ?? lastFrameAt)) return null;
          return (
            <text key={s} x={x(t)} y={H - 6} textAnchor="middle" className="fill-fg-3 text-[11px]">
              −{s} s
            </text>
          );
        })}
        {paths.map((p) => (
          <path key={p.name} d={p.d} fill="none" stroke={p.color} strokeWidth="2" strokeLinejoin="round" />
        ))}
        <line
          x1={x(lastFrameAt)}
          x2={x(lastFrameAt)}
          y1={PAD.top}
          y2={H - PAD.bottom}
          stroke="var(--crit)"
          strokeWidth="2"
        />
        <text x={x(lastFrameAt) - 4} y={PAD.top + 10} textAnchor="end" className="fill-crit text-[11px] font-semibold">
          queda
        </text>
        {cursorX !== null && (
          <line x1={cursorX} x2={cursorX} y1={PAD.top} y2={H - PAD.bottom} stroke="var(--text)" strokeDasharray="3 3" />
        )}
      </svg>
      <div className="flex flex-wrap gap-3 text-xs text-fg-2">
        {def.lines.map((l) => (
          <span key={l.name} className="flex items-center gap-1">
            <span className="inline-block h-2 w-3 rounded-sm" style={{ background: l.color }} />
            {l.name} ({def.unit})
          </span>
        ))}
      </div>
    </div>
  );
}
