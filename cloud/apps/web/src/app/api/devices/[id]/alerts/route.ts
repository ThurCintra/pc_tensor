import { NextResponse } from 'next/server';
import { getDb } from '@pc-tensor/db';
import { auth } from '@/auth';
import { requireUserId, route } from '@/server/http';
import { listAlerts } from '@/server/devices';

type Context = { params: Promise<{ id: string }> };

/** GET /api/devices/:id/alerts?limit=50 */
export const GET = route<Context>(async (request, { params }) => {
  const userId = await requireUserId(auth);
  const { id } = await params;
  const limit = Number(request.nextUrl.searchParams.get('limit') ?? 50);
  return NextResponse.json({ alerts: await listAlerts(getDb(), userId, id, Number.isFinite(limit) ? limit : 50) });
});
