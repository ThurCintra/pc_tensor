import { z } from 'zod';

const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

const passwordSchema = z.string().min(10).max(256);

export const registerSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
  })
  .strict();

export const loginSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(1).max(256),
  })
  .strict();

export const refreshSchema = z
  .object({
    refreshToken: z.string().min(1).max(1024),
  })
  .strict();

export const logoutSchema = refreshSchema;

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
