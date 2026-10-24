import { createHash } from 'node:crypto';
import type { Db, Prisma } from '@pc-tensor/db';
import type { AlertType, Heartbeat } from '@pc-tensor/protocol';

export interface DeviceRecord {
  id: string;
  userId: string;
  name: string;
  maxCpuTempAlert: number;
  maxGpuTempAlert: number;
  alertsEnabled: boolean;
  lastSeenAt: Date | null;
}

export interface StoredAlert {
  id: string;
  type: AlertType;
  createdAt: Date;
  details: Record<string, unknown>;
}

/** Tudo que o servidor de tempo real precisa do banco. A implementação real usa Prisma. */
export interface DeviceStore {
  findDeviceByToken(token: string): Promise<DeviceRecord | null>;
  findOwnedDevice(userId: string, deviceId: string): Promise<DeviceRecord | null>;
  getDevice(deviceId: string): Promise<DeviceRecord | null>;
  setOnline(deviceId: string, isOnline: boolean, at: Date): Promise<void>;
  touch(deviceId: string, at: Date): Promise<void>;
  saveHeartbeat(deviceId: string, heartbeat: Heartbeat): Promise<void>;
  saveAlert(deviceId: string, type: AlertType, details: Record<string, unknown>): Promise<StoredAlert>;
  /** Ao subir o servidor: ninguém está conectado ainda. */
  resetOnline(): Promise<void>;
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

const select = {
  id: true,
  userId: true,
  name: true,
  maxCpuTempAlert: true,
  maxGpuTempAlert: true,
  alertsEnabled: true,
  lastSeenAt: true,
} as const;

export function createPrismaStore(db: Db): DeviceStore {
  return {
    async findDeviceByToken(token) {
      if (!token.startsWith('pct_dev_')) return null;
      return db.device.findUnique({ where: { deviceTokenHash: sha256(token) }, select });
    },
    findOwnedDevice: (userId, deviceId) => db.device.findFirst({ where: { id: deviceId, userId }, select }),
    getDevice: (deviceId) => db.device.findUnique({ where: { id: deviceId }, select }),
    async setOnline(deviceId, isOnline, at) {
      await db.device.updateMany({ where: { id: deviceId }, data: { isOnline, lastSeenAt: at } });
    },
    async touch(deviceId, at) {
      await db.device.updateMany({ where: { id: deviceId }, data: { lastSeenAt: at } });
    },
    async saveHeartbeat(deviceId, hb) {
      await db.$transaction([
        db.telemetryHistory.create({
          data: {
            deviceId,
            timestamp: new Date(hb.ts),
            avgCpuTemp: hb.avgCpuTemp,
            avgGpuTemp: hb.avgGpuTemp,
            maxTemp: hb.maxTemp,
            energyConsumedWh: hb.energyConsumedWh,
          },
        }),
        db.device.updateMany({ where: { id: deviceId }, data: { lastSeenAt: new Date() } }),
      ]);
    },
    async saveAlert(deviceId, type, details) {
      const row = await db.alertEvent.create({
        data: { deviceId, type, detailsJson: details as Prisma.InputJsonValue },
      });
      return { id: row.id, type: row.type, createdAt: row.createdAt, details };
    },
    async resetOnline() {
      await db.device.updateMany({ where: { isOnline: true }, data: { isOnline: false } });
    },
  };
}
