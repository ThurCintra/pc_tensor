import { NextResponse } from 'next/server';
import { REALTIME_TOKEN, signRealtimeToken } from '@pc-tensor/protocol/realtime-token';
import { auth } from '@/auth';
import { requireUserId, route } from '@/server/http';

/** GET /api/realtime-token — token de 5 minutos para o navegador conectar no servidor de tempo real. */
export const GET = route(async () => {
  const userId = await requireUserId(auth);
  const secret = process.env.REALTIME_JWT_SECRET;
  if (!secret) throw new Error('REALTIME_JWT_SECRET não configurado.');
  return NextResponse.json(
    {
      token: await signRealtimeToken(userId, secret),
      url: process.env.REALTIME_URL,
      expiresIn: REALTIME_TOKEN.ttlSeconds,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
});
