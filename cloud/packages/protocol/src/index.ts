import { z } from 'zod';

/**
 * Contrato do pc_tensor Cloud entre o agente no PC, o servidor de tempo real e o navegador.
 * Toda mensagem que atravessa a rede é validada com estes esquemas nos dois lados.
 */

// Modos de transmissão -------------------------------------------------------------------------

/** Ninguém olhando: 1 resumo por minuto para o histórico. Alguém com o painel aberto: quadros a cada 250 ms. */
export const StreamMode = z.enum(['HEARTBEAT', 'LIVE']);
export type StreamMode = z.infer<typeof StreamMode>;

export const STREAM_INTERVAL_MS: Record<StreamMode, number> = { HEARTBEAT: 60_000, LIVE: 250 };

// Estado do computador -------------------------------------------------------------------------

export const DeviceStatus = z.enum(['ONLINE', 'OFFLINE', 'IN_GAME', 'THERMAL_ALERT']);
export type DeviceStatus = z.infer<typeof DeviceStatus>;

export const Profile = z.enum(['COMPETITIVE_FPS', 'AAA_GAMING', 'WORKSTATION', 'IDLE']);
export type Profile = z.infer<typeof Profile>;

// Pareamento -----------------------------------------------------------------------------------

export const PAIRING_CODE_LENGTH = 6;
export const PAIRING_CODE_TTL_MS = 5 * 60_000;

export const PairingCode = z.string().regex(/^\d{6}$/, 'O código tem 6 dígitos.');

/** O que o agente envia ao trocar o código de 6 dígitos pelo token definitivo. */
export const PairRequest = z.object({
  code: PairingCode,
  name: z.string().trim().min(1).max(64),
  cpuModel: z.string().trim().max(128).nullable(),
  gpuModel: z.string().trim().max(128).nullable(),
  totalRamGb: z.number().nonnegative().max(16_384).nullable(),
});
export type PairRequest = z.infer<typeof PairRequest>;

export const PairResponse = z.object({ deviceId: z.string(), deviceToken: z.string() });
export type PairResponse = z.infer<typeof PairResponse>;

// Telemetria -----------------------------------------------------------------------------------

/**
 * Quadro ao vivo (modo LIVE). O servidor só lê os campos abaixo e repassa o resto sem tocar,
 * então o agente pode acrescentar métricas sem mudar o servidor.
 */
export const LiveFrame = z
  .object({
    ts: z.number().int().nonnegative(),
    profile: Profile,
    cpu: z
      .object({ tempC: z.number().nullable(), loadPct: z.number().nullable(), powerW: z.number().nullable() })
      .passthrough(),
    gpu: z
      .object({ tempC: z.number().nullable(), loadPct: z.number().nullable(), powerW: z.number().nullable() })
      .passthrough(),
  })
  .passthrough();
export type LiveFrame = z.infer<typeof LiveFrame>;

/** Resumo de um minuto (modo HEARTBEAT), gravado em TelemetryHistory. */
export const Heartbeat = z.object({
  ts: z.number().int().nonnegative(),
  profile: Profile,
  avgCpuTemp: z.number().nullable(),
  avgGpuTemp: z.number().nullable(),
  maxTemp: z.number().nullable(),
  energyConsumedWh: z.number().nonnegative(),
});
export type Heartbeat = z.infer<typeof Heartbeat>;

// Alertas --------------------------------------------------------------------------------------

export const AlertType = z.enum(['OVERHEAT', 'PREDICTIVE_THROTTLE', 'DUST_WARNING', 'ABRUPT_CRASH']);
export type AlertType = z.infer<typeof AlertType>;

/** Alerta enviado pelo agente (ABRUPT_CRASH é detectado pelo servidor, nunca enviado pelo agente). */
export const AgentAlert = z.object({
  type: AlertType.exclude(['ABRUPT_CRASH']),
  component: z.enum(['cpu', 'gpu', 'system']),
  message: z.string().max(280),
  value: z.number().nullable(),
});
export type AgentAlert = z.infer<typeof AgentAlert>;

// Comandos remotos (allowlist) -----------------------------------------------------------------

/**
 * Os únicos comandos que o site pode mandar para um PC. O agente tem um switch fechado com essas três
 * ações e nunca executa texto vindo da rede.
 */
export const Command = z.discriminatedUnion('action', [
  z.object({ action: z.literal('ACTION_CLEAN_RAM') }),
  z.object({ action: z.literal('ACTION_OPTIMIZE_PRIORITY') }),
  z.object({
    action: z.literal('ACTION_UPDATE_CONFIG'),
    maxCpuTempAlert: z.number().int().min(50).max(110),
    maxGpuTempAlert: z.number().int().min(50).max(110),
  }),
]);
export type Command = z.infer<typeof Command>;
export type CommandAction = Command['action'];

export const CommandResult = z.object({
  ok: z.boolean(),
  message: z.string().max(500),
  // .nullish(): agentes em outras linguagens costumam mandar null em vez de omitir o campo
  data: z.record(z.string(), z.unknown()).nullish(),
});
export type CommandResult = z.infer<typeof CommandResult>;

export const COMMAND_TIMEOUT_MS = 15_000;

// Eventos do Socket.IO -------------------------------------------------------------------------

/** Namespaces: agentes (PCs) e clientes (navegadores) nunca se misturam. */
export const NAMESPACES = { agent: '/agent', client: '/client' } as const;

export const deviceRoom = (deviceId: string) => `device:${deviceId}`;

/**
 * Sala de cada conta: todo navegador entra nela ao conectar e recebe o status de todos os seus PCs
 * ("Meus Computadores") sem ligar o modo ao vivo de nenhum.
 */
export const userRoom = (userId: string) => `user:${userId}`;

export interface DeviceStatusEvent {
  deviceId: string;
  status: DeviceStatus;
  isOnline: boolean;
  lastSeenAt: string | null;
  mode: StreamMode | null;
  profile: Profile | null;
  /** Última leitura: ao vivo no modo LIVE, média do último minuto no HEARTBEAT. */
  cpuTempC: number | null;
  gpuTempC: number | null;
}

export interface DeviceAlertEvent {
  deviceId: string;
  id: string;
  type: AlertType;
  createdAt: string;
  details: Record<string, unknown>;
}

/** Servidor → agente. */
export interface AgentServerToClient {
  'stream:mode': (payload: { mode: StreamMode; intervalMs: number }) => void;
  command: (command: Command, ack: (result: CommandResult) => void) => void;
}

/** Agente → servidor. */
export interface AgentClientToServer {
  'telemetry:live': (frame: unknown) => void;
  'telemetry:heartbeat': (heartbeat: unknown, ack?: (ok: boolean) => void) => void;
  alert: (alert: unknown) => void;
}

/** Servidor → navegador. */
export interface ClientServerToClient {
  'device:telemetry': (payload: { deviceId: string; frame: LiveFrame }) => void;
  'device:status': (payload: DeviceStatusEvent) => void;
  'device:alert': (payload: DeviceAlertEvent) => void;
}

/** Navegador → servidor. Todas as respostas vêm pelo ack. */
export type Ack<T> = (result: { ok: true; data: T } | { ok: false; error: string }) => void;

export interface ClientClientToServer {
  'device:subscribe': (payload: { deviceId: string }, ack: Ack<DeviceStatusEvent>) => void;
  'device:unsubscribe': (payload: { deviceId: string }, ack?: Ack<null>) => void;
  'device:command': (payload: { deviceId: string; command: unknown }, ack: Ack<CommandResult>) => void;
}

// Status derivado ------------------------------------------------------------------------------

/** Status mostrado em "Meus Computadores" a partir da conexão, do perfil em foco e da temperatura. */
export function deriveStatus(input: {
  isOnline: boolean;
  profile: Profile | null;
  cpuTempC: number | null;
  gpuTempC: number | null;
  maxCpuTempAlert: number;
  maxGpuTempAlert: number;
}): DeviceStatus {
  if (!input.isOnline) return 'OFFLINE';
  const hotCpu = input.cpuTempC !== null && input.cpuTempC >= input.maxCpuTempAlert;
  const hotGpu = input.gpuTempC !== null && input.gpuTempC >= input.maxGpuTempAlert;
  if (hotCpu || hotGpu) return 'THERMAL_ALERT';
  if (input.profile === 'COMPETITIVE_FPS' || input.profile === 'AAA_GAMING') return 'IN_GAME';
  return 'ONLINE';
}
