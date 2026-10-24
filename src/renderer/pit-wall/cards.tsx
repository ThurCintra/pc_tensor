import { Cpu, Gauge, HardDrive, MonitorPlay, Network, Wrench } from 'lucide-react';
import type { CpuData, GpuData, LagVerdict, TelemetryFrame } from '../realtime/protocol';
import { Bar, BentoCard, BigValue, Muted } from './BentoCard';
import { thermalColor } from './thermal-color';
import { DASH, num } from './format';

interface CardProps {
  frame: TelemetryFrame;
  highlight?: boolean;
  className?: string;
}

/** Temperatura com tendência (dT/dt) e contagem regressiva até o throttling. */
export function ThermalCard({ component, frame, highlight, className }: CardProps & { component: 'cpu' | 'gpu' }) {
  const data: CpuData | GpuData = frame[component];
  const { slopeCPerS, timeToThrottleS, limitC, throttling } = data.thermal;
  const ioDie = component === 'cpu' && frame.cpu.tempSource === 'ioDie';
  const color = thermalColor(data.tempC);

  let trend = 'Estável';
  if (slopeCPerS !== null && slopeCPerS >= 0.05) trend = `Subindo ${num(slopeCPerS, 2)} °C/s`;
  else if (slopeCPerS !== null && slopeCPerS <= -0.05) trend = `Caindo ${num(-slopeCPerS, 2)} °C/s`;
  else if (slopeCPerS === null) trend = ioDie ? 'Tendência só com o sensor dos núcleos' : 'Medindo tendência…';

  // Barra: quanto falta até o limite (30 s ou menos = alerta preditivo)
  const countdownPct = timeToThrottleS === null ? null : Math.max(0, Math.min(100, (timeToThrottleS / 120) * 100));

  return (
    <BentoCard
      title={component === 'cpu' ? 'Processador' : 'Placa de vídeo'}
      icon={component === 'cpu' ? Cpu : MonitorPlay}
      highlight={highlight || throttling || (timeToThrottleS !== null && timeToThrottleS < 30)}
      className={className}
    >
      <div className="flex items-end justify-between gap-3">
        <BigValue value={num(data.tempC)} unit="°C" color={data.tempC === null ? undefined : color} />
        <div className="text-right text-xs text-fg-2">
          <div>Uso {num(data.loadPct)}%</div>
          <div>{data.powerW === null ? DASH : `${num(data.powerW)} W`}</div>
        </div>
      </div>
      <Bar pct={data.tempC === null ? null : (data.tempC / limitC) * 100} color={color} />
      <div className="text-sm">
        {throttling ? (
          <span className="font-semibold text-crit">No limite de {num(limitC)} °C: perdendo desempenho</span>
        ) : timeToThrottleS !== null ? (
          <span className={timeToThrottleS < 30 ? 'font-semibold text-crit' : 'text-warn'}>
            Chega a {num(limitC)} °C em {num(timeToThrottleS)} s
          </span>
        ) : (
          <span className="text-fg-2">{trend}</span>
        )}
      </div>
      {countdownPct !== null && <Bar pct={100 - countdownPct} color="var(--critical)" />}
      <Muted>
        {data.name ?? DASH}
        {ioDie && ' · temperatura do die de E/S (abra como administrador para ler os núcleos)'}
      </Muted>
    </BentoCard>
  );
}

export function VramCard({ frame, highlight, className }: CardProps) {
  const { vramUsedMb, vramTotalMb } = frame.gpu;
  const pct = vramUsedMb !== null && vramTotalMb ? (vramUsedMb / vramTotalMb) * 100 : null;
  const color =
    pct !== null && pct >= 95 ? 'var(--critical)' : pct !== null && pct >= 85 ? 'var(--caution)' : 'var(--accent)';
  return (
    <BentoCard title="Memória de vídeo" icon={HardDrive} highlight={highlight} className={className}>
      <BigValue value={num(pct)} unit="%" />
      <Bar pct={pct} color={color} />
      <Muted>
        {num(vramUsedMb !== null ? vramUsedMb / 1024 : null, 1)} de{' '}
        {num(vramTotalMb !== null ? vramTotalMb / 1024 : null, 1)} GB · RAM {num(frame.memory.loadPct)}%
      </Muted>
    </BentoCard>
  );
}

const VERDICTS: Record<LagVerdict, { label: string; tone: string; hint: string }> = {
  NORMAL: { label: 'Tudo normal', tone: 'bg-ok-bg text-ok', hint: 'Rede e hardware sem anomalias.' },
  CAUSE_NETWORK: { label: 'Culpa da rede', tone: 'bg-crit-bg text-crit', hint: 'Rubberbanding: o PC está bem.' },
  CAUSE_CPU_BOTTLENECK: {
    label: 'Gargalo de CPU',
    tone: 'bg-warn-bg text-warn',
    hint: 'Um núcleo saturado segura a placa de vídeo.',
  },
  CAUSE_VRAM_OVERFLOW: {
    label: 'VRAM cheia',
    tone: 'bg-crit-bg text-crit',
    hint: 'Texturas transbordando para a RAM: baixe a qualidade.',
  },
};

/** Juiz de Lag: rede × hardware, com os números que embasam o veredito. */
export function LagJudgeCard({ frame, highlight, className }: CardProps) {
  const verdict = VERDICTS[frame.lag.verdict];
  const n = frame.network;
  return (
    <BentoCard title="Juiz de Lag" icon={Network} highlight={highlight} className={className}>
      <div className={`self-start rounded-full px-3 py-1 text-sm font-semibold ${verdict.tone}`}>{verdict.label}</div>
      <p className="m-0 text-sm text-fg-2">{frame.lag.reasons[0] ?? verdict.hint}</p>
      <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
        <Stat label="Internet" value={`${num(n.internetLatencyMs)} ms`} />
        <Stat label="Roteador" value={`${num(n.gatewayLatencyMs)} ms`} />
        <Stat label="Jitter" value={`${num(n.jitterMs, 1)} ms`} />
        <Stat label="Perda" value={`${num(n.lossPct, 1)}%`} />
        <Stat label="Núcleo mais usado" value={`${num(frame.cpu.maxCoreLoadPct)}%`} />
        <Stat label="GPU" value={`${num(frame.gpu.loadPct)}%`} />
      </dl>
      <Muted>
        {n.adapter ? `Via ${n.adapter}` : 'Sem interface de rede ativa'} · tempo de quadro do jogo ainda não medido
      </Muted>
    </BentoCard>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-fg-3">{label}</dt>
      <dd className="m-0 font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

export function MaintenanceCard({ frame, highlight, className }: CardProps) {
  const m = frame.maintenance;
  const part = m.component === 'gpu' ? 'A placa de vídeo' : 'O processador';
  return (
    <BentoCard title="Saúde térmica" icon={Wrench} highlight={highlight || m.warning} className={className}>
      {m.warning ? (
        <>
          <div className="text-sm font-semibold text-warn">Hora de limpar o PC</div>
          <p className="m-0 text-sm text-fg-2">
            {part} está{' '}
            {m.tempDeltaC !== null && m.tempDeltaC >= 5
              ? `${num(m.tempDeltaC, 1)} °C mais quente`
              : `com a ventoinha ${num(m.fanDeltaPct)}% mais rápida`}{' '}
            que há {num(m.baselineAgeDays)} dias, com o mesmo consumo. Pode ser poeira ou pasta térmica.
          </p>
        </>
      ) : (
        <>
          <div className="text-sm font-semibold text-ok">Sem sinal de degradação</div>
          <Muted>
            {m.baselineAgeDays === null
              ? 'A comparação começa depois de duas semanas de uso, com o mesmo consumo.'
              : `Comparado com ${num(m.baselineAgeDays)} dias atrás.`}
          </Muted>
        </>
      )}
    </BentoCard>
  );
}

export function EfficiencyCard({ frame, highlight, className }: CardProps) {
  const rows = [
    ['CPU', frame.efficiency.cpu],
    ['GPU', frame.efficiency.gpu],
  ] as const;
  return (
    <BentoCard title="Eficiência do silício" icon={Gauge} highlight={highlight} className={className}>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="text-left text-xs text-fg-3">
            <th className="font-normal" />
            <th className="font-normal">MHz/W</th>
            <th className="font-normal">Estabilidade</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, e]) => (
            <tr key={label}>
              <td className="py-0.5 text-fg-2">{label}</td>
              <td className="font-semibold tabular-nums">{num(e?.mhzPerWatt, 1)}</td>
              <td className="tabular-nums">
                {e?.vcoreStdDevMv === null || !e ? DASH : `±${num(e.vcoreStdDevMv, 1)} mV`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Muted>Medido sob carga (80% ou mais). Mais MHz/W = chip mais eficiente.</Muted>
    </BentoCard>
  );
}
