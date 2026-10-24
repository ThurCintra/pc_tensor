import { NextResponse } from 'next/server';
import { getDb } from '@pc-tensor/db';
import { auth } from '@/auth';
import { requireUserId, route } from '@/server/http';
import { listHistory } from '@/server/devices';

type Context = { params: Promise<{ id: string }> };

/** GET /api/devices/:id/history?hours=24 — resumos de 1 minuto (modo HEARTBEAT). */
export const GET = route<Context>(async (request, { params }) => {
  const userId = await requireUserId(auth);
  const { id } = await params;
  const hours = Number(request.nextUrl.searchParams.get('hours') ?? 24);
  return NextResponse.json({ history: await listHistory(getDb(), userId, id, hours) });
});
