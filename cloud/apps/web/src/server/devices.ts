import { z } from 'zod';
import type { Db } from '@pc-tensor/db';
import { deriveStatus, type DeviceStatus } from '@pc-tensor/protocol';
import { badRequest, notFound } from './errors';
import { sha256 } from './crypto';

export interface DeviceSummary {
  id: string;
  name: string;
  status: DeviceStatus;
  isOnline: boolean;
  lastSeenAt: string | null;
  cpuModel: string | null;
  gpuModel: string | null;
  totalRamGb: number | null;
  maxCpuTempAlert: number;
  maxGpuTempAlert: number;
  alertsEnabled: boolean;
  /** Último resumo de 1 minuto gravado (temperaturas "atuais" quando ninguém está com o painel aberto). */
  latest: { timestamp: string; avgCpuTemp: number | null; avgGpuTemp: number | null; maxTemp: number | null } | null;
  createdAt: string;
}

export const DeviceSettingsInput = z
  .object({
    name: z.string().trim().min(1, 'Dê um nome ao computador.').max(64),
    maxCpuTempAlert: z.number().int().min(50).max(110),
    maxGpuTempAlert: z.number().int().min(50).max(110),
    alertsEnabled: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nada para atualizar.');

const deviceInclude = { telemetry: { orderBy: { timestamp: 'desc' as const }, take: 1 } };

type DeviceWithLatest = Awaited<ReturnType<Db['device']['findFirstOrThrow']>> & {
  telemetry: { timestamp: Date; avgCpuTemp: number | null; avgGpuTemp: number | null; maxTemp: number | null }[];
};

function toSummary(d: DeviceWithLatest): DeviceSummary {
  const latest = d.telemetry[0] ?? null;
  return {
    id: d.id,
    name: d.name,
    status: deriveStatus({
      isOnline: d.isOnline,
      profile: null,
      cpuTempC: latest?.avgCpuTemp ?? null,
      gpuTempC: latest?.avgGpuTemp ?? null,
      maxCpuTempAlert: d.maxCpuTempAlert,
      maxGpuTempAlert: d.maxGpuTempAlert,
    }),
    isOnline: d.isOnline,
    lastSeenAt: d.lastSeenAt?.toISOString() ?? null,
    cpuModel: d.cpuModel,
    gpuModel: d.gpuModel,
    totalRamGb: d.totalRamGb === null ? null : Number(d.totalRamGb),
    maxCpuTempAlert: d.maxCpuTempAlert,
    maxGpuTempAlert: d.maxGpuTempAlert,
    alertsEnabled: d.alertsEnabled,
    latest: latest && {
      timestamp: latest.timestamp.toISOString(),
      avgCpuTemp: latest.avgCpuTemp,
      avgGpuTemp: latest.avgGpuTemp,
      maxTemp: latest.maxTemp,
    },
    createdAt: d.createdAt.toISOString(),
  };
}

export async function listDevices(db: Db, userId: string): Promise<DeviceSummary[]> {
  const devices = await db.device.findMany({
    where: { userId },
    include: deviceInclude,
    orderBy: { createdAt: 'asc' },
  });
  return devices.map(toSummary);
}

/** Busca sempre filtrando pelo dono: o PC de outra pessoa responde 404, como se não existisse. */
export async function getDevice(db: Db, userId: string, deviceId: string): Promise<DeviceSummary> {
  const device = await db.device.findFirst({ where: { id: deviceId, userId }, include: deviceInclude });
  if (!device) throw notFound('Computador não encontrado.');
  return toSummary(device);
}

export async function updateDevice(
  db: Db,
  userId: string,
  deviceId: string,
  input: z.infer<typeof DeviceSettingsInput>,
): Promise<DeviceSummary> {
  const result = await db.device.updateMany({ where: { id: deviceId, userId }, data: input });
  if (result.count === 0) throw notFound('Computador não encontrado.');
  return getDevice(db, userId, deviceId);
}

/** Remove o PC e todo o histórico; o token do agente deixa de valer na hora. */
export async function deleteDevice(db: Db, userId: string, deviceId: string): Promise<void> {
  const result = await db.device.deleteMany({ where: { id: deviceId, userId } });
  if (result.count === 0) throw notFound('Computador não encontrado.');
}

export async function listAlerts(db: Db, userId: string, deviceId: string, limit = 50) {
  await getDevice(db, userId, deviceId);
  const alerts = await db.alertEvent.findMany({
    where: { deviceId },
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(limit, 1), 200),
  });
  return alerts.map((a) => ({ id: a.id, type: a.type, details: a.detailsJson, createdAt: a.createdAt.toISOString() }));
}

export async function listHistory(db: Db, userId: string, deviceId: string, hours = 24) {
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24 * 31) throw badRequest('Período inválido (até 31 dias).');
  await getDevice(db, userId, deviceId);
  const since = new Date(Date.now() - hours * 3_600_000);
  const rows = await db.telemetryHistory.findMany({
    where: { deviceId, timestamp: { gte: since } },
    orderBy: { timestamp: 'asc' },
  });
  return rows.map((r) => ({
    timestamp: r.timestamp.toISOString(),
    avgCpuTemp: r.avgCpuTemp,
    avgGpuTemp: r.avgGpuTemp,
    maxTemp: r.maxTemp,
    energyConsumedWh: r.energyConsumedWh,
  }));
}

/**
 * Energia gravada desde `since` (os resumos de 1 minuto continuam chegando com o painel aberto), para o
 * taxímetro mostrar o mês inteiro mesmo que o PC tenha sido reiniciado. O navegador manda o início do mês
 * no fuso dele.
 */
export async function energySince(db: Db, userId: string, deviceId: string, since: Date) {
  if (Number.isNaN(since.getTime()) || Date.now() - since.getTime() > 40 * 86_400_000)
    throw badRequest('Período inválido (até 40 dias).');
  await getDevice(db, userId, deviceId);
  const total = await db.telemetryHistory.aggregate({
    where: { deviceId, timestamp: { gte: since } },
    _sum: { energyConsumedWh: true },
    _count: true,
  });
  return { since: since.toISOString(), wh: total._sum.energyConsumedWh ?? 0, minutes: total._count };
}

/** Autenticação do agente pelo cabeçalho X-Device-Token (só o hash fica no banco). */
export async function authenticateDevice(db: Db, token: string | null | undefined) {
  if (!token || !token.startsWith('pct_dev_')) return null;
  return db.device.findUnique({ where: { deviceTokenHash: sha256(token) } });
}
