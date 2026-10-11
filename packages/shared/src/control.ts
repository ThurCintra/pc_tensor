import { z } from 'zod';
import { uuidSchema } from './common.js';

export const subscribeDataSchema = z
  .object({
    computerId: uuidSchema,
  })
  .strict();

export const unsubscribeDataSchema = z
  .object({
    computerId: uuidSchema,
  })
  .strict();

export const streamModeSchema = z.enum(['live', 'idle']);

export const streamModeDataSchema = z
  .object({
    mode: streamModeSchema,
  })
  .strict();

export const computerStatusSchema = z.enum([
  'online',
  'offline',
  'suspended',
  'shutting_down',
  'restarting',
  'unlinked',
]);

export const computerStatusDataSchema = z
  .object({
    status: computerStatusSchema,
  })
  .strict();

export const errorCodeSchema = z.enum([
  'UNSUPPORTED_VERSION',
  'INVALID_MESSAGE',
  'NOT_FOUND',
  'UNAUTHORIZED',
  'INTERNAL_ERROR',
]);

export const errorDataSchema = z
  .object({
    code: errorCodeSchema,
    message: z.string().min(1),
  })
  .strict();

export type SubscribeData = z.infer<typeof subscribeDataSchema>;
export type UnsubscribeData = z.infer<typeof unsubscribeDataSchema>;
export type StreamMode = z.infer<typeof streamModeSchema>;
export type StreamModeData = z.infer<typeof streamModeDataSchema>;
export type ComputerStatus = z.infer<typeof computerStatusSchema>;
export type ComputerStatusData = z.infer<typeof computerStatusDataSchema>;
export type ErrorCode = z.infer<typeof errorCodeSchema>;
export type ErrorData = z.infer<typeof errorDataSchema>;
