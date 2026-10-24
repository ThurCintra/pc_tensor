import { NextResponse } from 'next/server';
import { getDb } from '@pc-tensor/db';
import { auth } from '@/auth';
import { requireUserId, route } from '@/server/http';
import { listDevices } from '@/server/devices';

/** GET /api/devices — "Meus Computadores". */
export const GET = route(async () => {
  const userId = await requireUserId(auth);
  return NextResponse.json({ devices: await listDevices(getDb(), userId) });
});
