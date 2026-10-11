import { z } from 'zod';
import {
  bytesSchema,
  nullableBytesSchema,
  nullableFrequencySchema,
  nullablePercentageSchema,
  nullablePowerSchema,
  nullableTemperatureSchema,
} from './common.js';

export const metricsCpuSchema = z
  .object({
    usage: nullablePercentageSchema,
    temperature: nullableTemperatureSchema,
    frequencyMhz: nullableFrequencySchema,
    perCore: z.array(nullablePercentageSchema).nullable(),
  })
  .strict();

export const metricsGpuSchema = z
  .object({
    index: z.number().int().nonnegative(),
    usage: nullablePercentageSchema,
    temperature: nullableTemperatureSchema,
    vramUsedBytes: nullableBytesSchema,
    clockMhz: nullableFrequencySchema,
    powerWatts: nullablePowerSchema,
  })
  .strict();

export const metricsRamSchema = z
  .object({
    usedBytes: nullableBytesSchema,
    availableBytes: nullableBytesSchema,
    usage: nullablePercentageSchema,
  })
  .strict();

export const metricsNetworkSchema = z
  .object({
    upBytesPerSec: nullableBytesSchema,
    downBytesPerSec: nullableBytesSchema,
  })
  .strict();

export const metricsDiskSchema = z
  .object({
    mountPoint: z.string().min(1),
    usedBytes: nullableBytesSchema,
    totalBytes: bytesSchema,
    usage: nullablePercentageSchema,
  })
  .strict();

export const metricsUpdateDataSchema = z
  .object({
    seq: z.number().int().nonnegative(),
    cpu: metricsCpuSchema,
    gpus: z.array(metricsGpuSchema),
    ram: metricsRamSchema,
    network: metricsNetworkSchema.optional(),
    disks: z.array(metricsDiskSchema).optional(),
  })
  .strict();

export type MetricsCpu = z.infer<typeof metricsCpuSchema>;
export type MetricsGpu = z.infer<typeof metricsGpuSchema>;
export type MetricsRam = z.infer<typeof metricsRamSchema>;
export type MetricsNetwork = z.infer<typeof metricsNetworkSchema>;
export type MetricsDisk = z.infer<typeof metricsDiskSchema>;
export type MetricsUpdateData = z.infer<typeof metricsUpdateDataSchema>;
