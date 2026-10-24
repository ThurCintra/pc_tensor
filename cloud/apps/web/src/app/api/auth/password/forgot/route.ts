import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@pc-tensor/db';
import { clientIp, readJson, route } from '@/server/http';
import { sendMail } from '@/server/mailer';
import { limits } from '@/server/rate-limit';
import { requestPasswordReset } from '@/server/users';

/** POST /api/auth/password/forgot — sempre 202, exista ou não a conta (não revela e-mails cadastrados). */
export const POST = route(async (request) => {
  const { email } = await readJson(request, z.object({ email: z.string().max(254) }));
  limits.auth.consume(`reset-ip:${clientIp(request)}`);
  limits.passwordReset.consume(`reset:${email.trim().toLowerCase()}`);
  await requestPasswordReset(getDb(), email, {
    mailer: sendMail,
    appUrl: process.env.APP_URL ?? request.nextUrl.origin,
  });
  return NextResponse.json({ ok: true }, { status: 202 });
});
