import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@pc-tensor/db';
import { clientIp, readJson, route } from '@/server/http';
import { limits } from '@/server/rate-limit';
import { resetPassword } from '@/server/users';

/** POST /api/auth/password/reset — troca a senha com o token do e-mail (uso único, vale 1 hora). */
export const POST = route(async (request) => {
  limits.auth.consume(`reset-confirm:${clientIp(request)}`);
  const { token, password } = await readJson(
    request,
    z.object({ token: z.string().min(10).max(200), password: z.string() }),
  );
  await resetPassword(getDb(), token, password);
  return NextResponse.json({ ok: true });
});
