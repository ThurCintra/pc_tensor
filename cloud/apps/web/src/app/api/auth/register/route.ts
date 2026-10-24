import { NextResponse } from 'next/server';
import { getDb } from '@pc-tensor/db';
import { clientIp, readJson, route } from '@/server/http';
import { limits } from '@/server/rate-limit';
import { RegisterInput, registerUser } from '@/server/users';

/** POST /api/auth/register — cria a conta com e-mail e senha; depois o site entra com signIn("credentials"). */
export const POST = route(async (request) => {
  limits.auth.consume(`register:${clientIp(request)}`);
  const input = await readJson(request, RegisterInput);
  const user = await registerUser(getDb(), input);
  return NextResponse.json({ user }, { status: 201 });
});
