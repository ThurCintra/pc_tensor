/**
 * Tipos do contrato WebSocket v2 (docs/contrato-websocket.md).
 * Espelham service/PcSentinel.Service/Contracts; ao mudar um lado, mude o outro.
 */

export const PROTOCOL_VERSION = 2;

export type Profile = 'COMPETITIVE_FPS' | 'AAA_GRAPHICS' | 'DEV_WORKSTATION' | 'IDLE';
export type LagVerdict = 'NORMAL' | 'CAUSE_NETWORK' | 'CAUSE_CPU_BOTTLENECK' | 'CAUSE_VRAM_OVERFLOW';
export type TempSource = 'sensor' | 'amdDriver' | 'ioDie';
export type AlertKind = 'PREDICTIVE_THROTTLE' | 'THROTTLING' | 'NETWORK_SPIKE' | 'MAINTENANCE';
export type AlertSeverity = 'info' | 'warning' | 'critical';

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

export interface TelemetryFrame {
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
  context: { profile: Profile; foregroundExe: string | null; foregroundPid: number | null };
  energy: {
    systemPowerW: number;
    baseLoadW: number;
    tariffBrlPerKwh: number;
    sessionKwh: number;
    sessionCostBrl: number;
    monthKwh: number;
    monthCostBrl: number;
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

export interface SiliconEfficiency {
  mhzPerWatt: number | null;
  vcoreStdDevMv: number | null;
  samples: number;
}

export interface HelloData {
  serviceVersion: string;
  machineName: string;
  isElevated: boolean;
  tickIntervalMs: number;
  throttleLimits: { cpuC: number; gpuC: number };
  profiles: Profile[];
  capabilities: { stutterBuster: boolean; foregroundDetection: boolean; frametime: boolean };
}

export interface AlertData {
  kind: AlertKind;
  component: string;
  severity: AlertSeverity;
  message: string;
  value: number | null;
}

export interface CommandResult<T = unknown> {
  id: string | null;
  ok: boolean;
  data: T | null;
  error: string | null;
}

export type ServerMessage =
  | Envelope<'hello', HelloData>
  | Envelope<'telemetry', TelemetryFrame>
  | Envelope<'alert', AlertData>
  | Envelope<'commandResult', CommandResult>;

export interface Envelope<TType extends string, TData> {
  v: number;
  type: TType;
  seq: number;
  ts: number;
  data: TData;
}

// Comandos cliente → servidor ------------------------------------------------------------------

export interface StutterBusterResult {
  standbyPurged: boolean;
  standbyFreedMb: number | null;
  standbyError: string | null;
  deprioritized: string[];
  restoreAfterS: number;
}

export interface SiliconCurvePoint {
  clockMhz: number;
  vcoreV: number;
  powerW: number;
  samples: number;
}

/** Ação → [parâmetros, resposta]. */
export interface CommandMap {
  PING: [Record<string, never>, { pong: boolean }];
  STUTTER_BUSTER: [Record<string, never>, StutterBusterResult];
  SET_ENERGY_CONFIG: [{ tariffBrlPerKwh?: number; baseLoadW?: number }, { tariffBrlPerKwh: number; baseLoadW: number }];
  GET_SILICON_CURVE: [{ component: 'cpu' | 'gpu' }, { component: 'cpu' | 'gpu'; points: SiliconCurvePoint[] }];
}

export type CommandAction = keyof CommandMap;

/** Valida o envelope recebido; mensagens de outra versão ou malformadas são descartadas. */
export function parseServerMessage(raw: string): ServerMessage | null {
  let msg: unknown;
  try {
    msg = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof msg !== 'object' || msg === null) return null;
  const { v, type, data } = msg as Partial<Envelope<string, unknown>>;
  if (v !== PROTOCOL_VERSION || typeof type !== 'string' || data === undefined) return null;
  if (!['hello', 'telemetry', 'alert', 'commandResult'].includes(type)) return null;
  return msg as ServerMessage;
}
