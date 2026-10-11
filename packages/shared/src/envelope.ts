import { z } from 'zod';
import { PROTOCOL_VERSION, isoTimestampSchema, uuidSchema } from './common.js';
import { hardwareInfoDataSchema } from './hardware.js';
import { metricsUpdateDataSchema } from './metrics.js';
import {
  computerStatusDataSchema,
  deviceUnlinkedDataSchema,
  errorDataSchema,
  streamModeDataSchema,
  subscribeDataSchema,
  unsubscribeDataSchema,
} from './control.js';

function baseEnvelope<TType extends z.ZodLiteral<string>, TData extends z.ZodTypeAny>(
  typeSchema: TType,
  dataSchema: TData,
) {
  return z
    .object({
      v: z.literal(PROTOCOL_VERSION),
      type: typeSchema,
      id: uuidSchema,
      ts: isoTimestampSchema,
      computerId: uuidSchema.optional(),
      replyTo: uuidSchema.optional(),
      data: dataSchema,
    })
    .strict();
}

export const hardwareInfoEnvelopeSchema = baseEnvelope(
  z.literal('hardware:info'),
  hardwareInfoDataSchema,
);

export const metricsUpdateEnvelopeSchema = baseEnvelope(
  z.literal('metrics:update'),
  metricsUpdateDataSchema,
);

export const subscribeEnvelopeSchema = baseEnvelope(z.literal('subscribe'), subscribeDataSchema);

export const unsubscribeEnvelopeSchema = baseEnvelope(
  z.literal('unsubscribe'),
  unsubscribeDataSchema,
);

export const streamModeEnvelopeSchema = baseEnvelope(z.literal('stream:mode'), streamModeDataSchema);

export const computerStatusEnvelopeSchema = baseEnvelope(
  z.literal('computer:status'),
  computerStatusDataSchema,
);

export const errorEnvelopeSchema = baseEnvelope(z.literal('error'), errorDataSchema);

export const deviceUnlinkedEnvelopeSchema = baseEnvelope(
  z.literal('device:unlinked'),
  deviceUnlinkedDataSchema,
);

export const envelopeSchema = z.discriminatedUnion('type', [
  hardwareInfoEnvelopeSchema,
  metricsUpdateEnvelopeSchema,
  subscribeEnvelopeSchema,
  unsubscribeEnvelopeSchema,
  streamModeEnvelopeSchema,
  computerStatusEnvelopeSchema,
  deviceUnlinkedEnvelopeSchema,
  errorEnvelopeSchema,
]);

export const messageTypeSchema = z.enum([
  'hardware:info',
  'metrics:update',
  'subscribe',
  'unsubscribe',
  'stream:mode',
  'computer:status',
  'device:unlinked',
  'error',
]);

export type HardwareInfoEnvelope = z.infer<typeof hardwareInfoEnvelopeSchema>;
export type MetricsUpdateEnvelope = z.infer<typeof metricsUpdateEnvelopeSchema>;
export type SubscribeEnvelope = z.infer<typeof subscribeEnvelopeSchema>;
export type UnsubscribeEnvelope = z.infer<typeof unsubscribeEnvelopeSchema>;
export type StreamModeEnvelope = z.infer<typeof streamModeEnvelopeSchema>;
export type ComputerStatusEnvelope = z.infer<typeof computerStatusEnvelopeSchema>;
export type DeviceUnlinkedEnvelope = z.infer<typeof deviceUnlinkedEnvelopeSchema>;
export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;
export type Envelope = z.infer<typeof envelopeSchema>;
export type MessageType = z.infer<typeof messageTypeSchema>;
