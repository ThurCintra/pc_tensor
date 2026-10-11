import { describe, expect, it } from 'vitest';
import { envelopeSchema } from '../src/index.js';

const COMPUTER_ID = '123e4567-e89b-12d3-a456-426614174000';
const MESSAGE_ID = '123e4567-e89b-12d3-a456-426614174001';
const REPLY_ID = '123e4567-e89b-12d3-a456-426614174002';
const TS = '2026-01-01T00:00:00.000Z';

describe('envelope', () => {
  it('accepts a valid hardware:info payload', () => {
    const payload = {
      v: 1,
      type: 'hardware:info',
      id: MESSAGE_ID,
      ts: TS,
      computerId: COMPUTER_ID,
      data: {
        os: 'Windows 11 Pro',
        hostname: 'DESKTOP-ABC123',
        agentVersion: '0.1.0',
        cpu: { name: 'Intel Core i7-12700K', cores: 12, threads: 20 },
        gpus: [{ vendor: 'NVIDIA', name: 'GeForce RTX 4070', vramTotalBytes: 12884901888 }],
        ram: { totalBytes: 34359738368 },
        disks: [
          { id: 'disk-0', label: 'System', mountPoint: 'C:', totalBytes: 1000204886016 },
        ],
        capabilities: {
          cpuTemperature: true,
          gpuTemperature: true,
          gpuPower: true,
          perCoreLoad: true,
        },
      },
    };
    const result = envelopeSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it('accepts a valid metrics:update payload', () => {
    const payload = {
      v: 1,
      type: 'metrics:update',
      id: MESSAGE_ID,
      ts: TS,
      computerId: COMPUTER_ID,
      data: {
        seq: 42,
        cpu: { usage: 12.5, temperature: 55.2, frequencyMhz: 3600, perCore: [10, 15.5, 12] },
        gpus: [
          {
            index: 0,
            usage: 33.3,
            temperature: 61,
            vramUsedBytes: 4294967296,
            clockMhz: 2400,
            powerWatts: 120.5,
          },
        ],
        ram: { usedBytes: 8589934592, availableBytes: 25769803776, usage: 25 },
        network: { upBytesPerSec: 1024, downBytesPerSec: 2048 },
        disks: [{ mountPoint: 'C:', usedBytes: 500000000000, totalBytes: 1000204886016, usage: 50 }],
      },
    };
    const result = envelopeSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it('accepts valid control payloads', () => {
    const cases = [
      {
        v: 1,
        type: 'subscribe',
        id: MESSAGE_ID,
        ts: TS,
        data: { computerId: COMPUTER_ID },
      },
      {
        v: 1,
        type: 'unsubscribe',
        id: MESSAGE_ID,
        ts: TS,
        data: { computerId: COMPUTER_ID },
      },
      {
        v: 1,
        type: 'stream:mode',
        id: MESSAGE_ID,
        ts: TS,
        computerId: COMPUTER_ID,
        data: { mode: 'live' },
      },
      {
        v: 1,
        type: 'computer:status',
        id: MESSAGE_ID,
        ts: TS,
        computerId: COMPUTER_ID,
        data: { status: 'online' },
      },
      {
        v: 1,
        type: 'error',
        id: MESSAGE_ID,
        ts: TS,
        replyTo: REPLY_ID,
        data: { code: 'INVALID_MESSAGE', message: 'bad payload' },
      },
    ];
    for (const payload of cases) {
      expect(envelopeSchema.safeParse(payload).success).toBe(true);
    }
  });

  it('accepts null for unavailable sensors', () => {
    const hardwareWithNullVram = {
      v: 1,
      type: 'hardware:info',
      id: MESSAGE_ID,
      ts: TS,
      computerId: COMPUTER_ID,
      data: {
        os: 'Windows 11 Pro',
        hostname: 'DESKTOP-NULL',
        agentVersion: '0.1.0',
        cpu: { name: 'AMD Ryzen 7', cores: 8, threads: 16 },
        gpus: [{ vendor: 'Unknown', name: 'Generic GPU', vramTotalBytes: null }],
        ram: { totalBytes: 17179869184 },
        disks: [],
        capabilities: {
          cpuTemperature: false,
          gpuTemperature: false,
          gpuPower: false,
          perCoreLoad: false,
        },
      },
    };
    expect(envelopeSchema.safeParse(hardwareWithNullVram).success).toBe(true);

    const metricsAllNull = {
      v: 1,
      type: 'metrics:update',
      id: MESSAGE_ID,
      ts: TS,
      computerId: COMPUTER_ID,
      data: {
        seq: 7,
        cpu: { usage: null, temperature: null, frequencyMhz: null, perCore: null },
        gpus: [
          {
            index: 0,
            usage: null,
            temperature: null,
            vramUsedBytes: null,
            clockMhz: null,
            powerWatts: null,
          },
        ],
        ram: { usedBytes: null, availableBytes: null, usage: null },
      },
    };
    const result = envelopeSchema.safeParse(metricsAllNull);
    expect(result.success).toBe(true);
  });

  it('accepts metrics without optional network and disks', () => {
    const payload = {
      v: 1,
      type: 'metrics:update',
      id: MESSAGE_ID,
      ts: TS,
      computerId: COMPUTER_ID,
      data: {
        seq: 1,
        cpu: { usage: 5, temperature: 40, frequencyMhz: 3000, perCore: [5, 6] },
        gpus: [],
        ram: { usedBytes: 1000, availableBytes: 2000, usage: 33.3 },
      },
    };
    expect(envelopeSchema.safeParse(payload).success).toBe(true);
  });

  it('rejects a wrong protocol version', () => {
    const payload = {
      v: 999,
      type: 'subscribe',
      id: MESSAGE_ID,
      ts: TS,
      data: { computerId: COMPUTER_ID },
    };
    const result = envelopeSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it('rejects percentage above 100', () => {
    const payload = {
      v: 1,
      type: 'metrics:update',
      id: MESSAGE_ID,
      ts: TS,
      computerId: COMPUTER_ID,
      data: {
        seq: 1,
        cpu: { usage: 150, temperature: 40, frequencyMhz: 3000, perCore: null },
        gpus: [],
        ram: { usedBytes: 1000, availableBytes: 2000, usage: 10 },
      },
    };
    expect(envelopeSchema.safeParse(payload).success).toBe(false);
  });

  it('rejects negative bytes', () => {
    const payload = {
      v: 1,
      type: 'hardware:info',
      id: MESSAGE_ID,
      ts: TS,
      computerId: COMPUTER_ID,
      data: {
        os: 'Windows 11 Pro',
        hostname: 'DESKTOP-NEG',
        agentVersion: '0.1.0',
        cpu: { name: 'Intel', cores: 4, threads: 8 },
        gpus: [],
        ram: { totalBytes: -1 },
        disks: [],
        capabilities: {
          cpuTemperature: true,
          gpuTemperature: false,
          gpuPower: false,
          perCoreLoad: false,
        },
      },
    };
    expect(envelopeSchema.safeParse(payload).success).toBe(false);
  });

  it('rejects an unknown message type', () => {
    const payload = {
      v: 1,
      type: 'unknown:type',
      id: MESSAGE_ID,
      ts: TS,
      data: {},
    };
    expect(envelopeSchema.safeParse(payload).success).toBe(false);
  });

  it('rejects mismatched data for a known type', () => {
    const payload = {
      v: 1,
      type: 'hardware:info',
      id: MESSAGE_ID,
      ts: TS,
      data: { seq: 1 },
    };
    expect(envelopeSchema.safeParse(payload).success).toBe(false);
  });
});
