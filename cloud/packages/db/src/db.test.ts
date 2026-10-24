import { describe, it, expect, afterAll } from 'vitest';
import { createTestDb } from './testing';

describe('banco (PGlite com as migrações)', async () => {
  const { db, close } = await createTestDb();
  afterAll(close);

  it('cria usuário, PC e histórico, e apaga em cascata', async () => {
    const user = await db.user.create({ data: { name: 'Arthur', email: 'arthur@example.com' } });
    const device = await db.device.create({ data: { userId: user.id, name: 'PC da sala', deviceTokenHash: 'h1' } });
    await db.telemetryHistory.create({
      data: { deviceId: device.id, timestamp: new Date(), avgCpuTemp: 55, energyConsumedWh: 4.2 },
    });
    await db.alertEvent.create({ data: { deviceId: device.id, type: 'OVERHEAT', detailsJson: { tempC: 96 } } });

    expect(Number(user.kwhTariff)).toBe(0.95);
    expect(device.maxCpuTempAlert).toBe(90);

    await db.user.delete({ where: { id: user.id } });
    expect(await db.device.count()).toBe(0);
    expect(await db.telemetryHistory.count()).toBe(0);
  });

  it('não aceita dois usuários com o mesmo e-mail', async () => {
    await db.user.create({ data: { name: 'A', email: 'dup@example.com' } });
    await expect(db.user.create({ data: { name: 'B', email: 'dup@example.com' } })).rejects.toThrow();
  });
});
