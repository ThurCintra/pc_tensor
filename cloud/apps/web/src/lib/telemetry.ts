import type { Profile } from '@pc-tensor/protocol';

/**
 * Quadro LIVE completo como o agente manda (CloudFrames.Live no serviço C#): o quadro local do contrato v2
 * inteiro, mais `ts` e o perfil no vocabulário da nuvem. O servidor de tempo real só valida cpu/gpu/profile/ts
 * e repassa o resto, então os outros campos podem faltar num agente antigo: os cards tratam ausência.
 */

export type LagVerdict = 'NORMAL' | 'CAUSE_NETWORK' | 'CAUSE_CPU_BOTTLENECK' | 'CAUSE_VRAM_OVERFLOW';
export type TempSource = 'sensor' | 'amdDriver' | 'ioDie';

export interface ThermalTrend {
  slopeCPerS: number | null;
  timeToThrottleS: number | null;
  limitC: number;
  throttling: boolean;
}

export interface CpuData {
  name: string | null;
  tempC: number | null;
  tempSource: TempSource | null;
  loadPct: number | null;
  maxCoreLoadPct: number | null;
  powerW: number | null;
  clockMhz: number | null;
  vcoreV: number | null;
  thermal: ThermalTrend;
}

export interface GpuData {
  name: string | null;
  tempC: number | null;
  hotspotC: number | null;
  memoryTempC: number | null;
  loadPct: number | null;
  powerW: number | null;
  clockMhz: number | null;
  vcoreV: number | null;
  vramUsedMb: number | null;
  vramTotalMb: number | null;
  fanRpm: number | null;
  fanPct: number | null;
  thermal: ThermalTrend;
}

export interface SiliconEfficiency {
  mhzPerWatt: number | null;
  vcoreStdDevMv: number | null;
  samples: number;
}

export interface TelemetryFrame {
  ts: number;
  profile: Profile;
  cpu: CpuData;
  gpu: GpuData;
  memory: { usedMb: number | null; totalMb: number | null; loadPct: number | null };
  board: { name: string | null; systemTempC: number | null; vrmTempC: number | null };
  storage: { name: string; tempC: number | null }[];
  fans: { name: string; rpm: number | null; pct: number | null }[];
  network: {
    adapter: string | null;
    gateway: string | null;
    gatewayLatencyMs: number | null;
    internetLatencyMs: number | null;
    jitterMs: number | null;
    lossPct: number | null;
  };
  lag: { verdict: LagVerdict; reasons: string[] };
  context: { profile: string; foregroundExe: string | null; foregroundPid: number | null };
  energy: {
    systemPowerW: number;
    baseLoadW: number;
    sessionKwh: number;
    monthKwh: number;
  };
  maintenance: {
    warning: boolean;
    component: 'cpu' | 'gpu' | null;
    tempDeltaC: number | null;
    fanDeltaPct: number | null;
    baselineAgeDays: number | null;
  };
  efficiency: { cpu: SiliconEfficiency | null; gpu: SiliconEfficiency | null };
}

const EMPTY_TREND: ThermalTrend = { slopeCPerS: null, timeToThrottleS: null, limitC: 95, throttling: false };

/**
 * Completa um quadro vindo da rede com valores neutros onde faltar algo, para os cards nunca quebrarem por um
 * campo ausente (agente de versão anterior, sensor que não existe nesse PC).
 */
export function normalizeFrame(raw: unknown): TelemetryFrame {
  const f = (raw ?? {}) as Partial<TelemetryFrame> & Record<string, unknown>;
  const cpu = (f.cpu ?? {}) as Partial<CpuData>;
  const gpu = (f.gpu ?? {}) as Partial<GpuData>;
  return {
    ts: typeof f.ts === 'number' ? f.ts : Date.now(),
    profile: f.profile ?? 'IDLE',
    cpu: {
      name: cpu.name ?? null,
      tempC: cpu.tempC ?? null,
      tempSource: cpu.tempSource ?? null,
      loadPct: cpu.loadPct ?? null,
      maxCoreLoadPct: cpu.maxCoreLoadPct ?? null,
      powerW: cpu.powerW ?? null,
      clockMhz: cpu.clockMhz ?? null,
      vcoreV: cpu.vcoreV ?? null,
      thermal: cpu.thermal ?? EMPTY_TREND,
    },
    gpu: {
      name: gpu.name ?? null,
      tempC: gpu.tempC ?? null,
      hotspotC: gpu.hotspotC ?? null,
      memoryTempC: gpu.memoryTempC ?? null,
      loadPct: gpu.loadPct ?? null,
      powerW: gpu.powerW ?? null,
      clockMhz: gpu.clockMhz ?? null,
      vcoreV: gpu.vcoreV ?? null,
      vramUsedMb: gpu.vramUsedMb ?? null,
      vramTotalMb: gpu.vramTotalMb ?? null,
      fanRpm: gpu.fanRpm ?? null,
      fanPct: gpu.fanPct ?? null,
      thermal: gpu.thermal ?? EMPTY_TREND,
    },
    memory: f.memory ?? { usedMb: null, totalMb: null, loadPct: null },
    board: f.board ?? { name: null, systemTempC: null, vrmTempC: null },
    storage: Array.isArray(f.storage) ? f.storage : [],
    fans: Array.isArray(f.fans) ? f.fans : [],
    network: f.network ?? {
      adapter: null,
      gateway: null,
      gatewayLatencyMs: null,
      internetLatencyMs: null,
      jitterMs: null,
      lossPct: null,
    },
    lag: f.lag ?? { verdict: 'NORMAL', reasons: [] },
    context: f.context ?? { profile: 'IDLE', foregroundExe: null, foregroundPid: null },
    energy: {
      systemPowerW: f.energy?.systemPowerW ?? (cpu.powerW ?? 0) + (gpu.powerW ?? 0),
      baseLoadW: f.energy?.baseLoadW ?? 0,
      sessionKwh: f.energy?.sessionKwh ?? 0,
      monthKwh: f.energy?.monthKwh ?? 0,
    },
    maintenance: f.maintenance ?? {
      warning: false,
      component: null,
      tempDeltaC: null,
      fanDeltaPct: null,
      baselineAgeDays: null,
    },
    efficiency: f.efficiency ?? { cpu: null, gpu: null },
  };
}
