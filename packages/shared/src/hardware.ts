import { z } from 'zod';
import { bytesSchema } from './common.js';

export const cpuInfoSchema = z
  .object({
    name: z.string().min(1),
    cores: z.number().int().positive(),
    threads: z.number().int().positive(),
  })
  .strict();

export const gpuInfoSchema = z
  .object({
    vendor: z.string().min(1),
    name: z.string().min(1),
    vramTotalBytes: bytesSchema.nullable(),
  })
  .strict();

export const ramInfoSchema = z
  .object({
    totalBytes: bytesSchema,
  })
  .strict();

export const diskInfoSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    mountPoint: z.string().min(1),
    totalBytes: bytesSchema,
  })
  .strict();

export const capabilitiesSchema = z
  .object({
    cpuTemperature: z.boolean(),
    gpuTemperature: z.boolean(),
    gpuPower: z.boolean(),
    perCoreLoad: z.boolean(),
  })
  .strict();

export const hardwareInfoDataSchema = z
  .object({
    os: z.string().min(1),
    hostname: z.string().min(1),
    agentVersion: z.string().min(1),
    cpu: cpuInfoSchema,
    gpus: z.array(gpuInfoSchema),
    ram: ramInfoSchema,
    disks: z.array(diskInfoSchema),
    capabilities: capabilitiesSchema,
  })
  .strict();

export type CpuInfo = z.infer<typeof cpuInfoSchema>;
export type GpuInfo = z.infer<typeof gpuInfoSchema>;
export type RamInfo = z.infer<typeof ramInfoSchema>;
export type DiskInfo = z.infer<typeof diskInfoSchema>;
export type Capabilities = z.infer<typeof capabilitiesSchema>;
export type HardwareInfoData = z.infer<typeof hardwareInfoDataSchema>;
