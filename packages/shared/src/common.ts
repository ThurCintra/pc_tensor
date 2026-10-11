import { z } from 'zod';

export const PROTOCOL_VERSION = 1 as const;

export const uuidSchema = z.string().uuid();

export const isoTimestampSchema = z.string().datetime({ offset: true });

export const percentageSchema = z.number().min(0).max(100);

export const nullablePercentageSchema = percentageSchema.nullable();

export const temperatureCelsiusSchema = z.number();

export const nullableTemperatureSchema = temperatureCelsiusSchema.nullable();

export const bytesSchema = z.number().int().nonnegative();

export const nullableBytesSchema = bytesSchema.nullable();

export const frequencyMhzSchema = z.number().nonnegative();

export const nullableFrequencySchema = frequencyMhzSchema.nullable();

export const powerWattsSchema = z.number().nonnegative();

export const nullablePowerSchema = powerWattsSchema.nullable();
