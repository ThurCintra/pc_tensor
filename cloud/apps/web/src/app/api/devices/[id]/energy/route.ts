import { NextResponse } from 'next/server';
import { getDb } from '@pc-tensor/db';
import { auth } from '@/auth';
import { requireUserId, route } from '@/server/http';
import { energySince } from '@/server/devices';

type Context = { params: Promise<{ id: string }> };

/** GET /api/devices/:id/energy?since=ISO — Wh gravados desde o início do mês (no fuso do navegador). */
export const GET = route<Context>(async (request, { params }) => {
  const userId = await requireUserId(auth);
  const { id } = await params;
  const since = new Date(request.nextUrl.searchParams.get('since') ?? '');
  return NextResponse.json(await energySince(getDb(), userId, id, since));
});
