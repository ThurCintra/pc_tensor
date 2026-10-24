import { NextResponse } from 'next/server';
import { getDb } from '@pc-tensor/db';
import { auth } from '@/auth';
import { readJson, requireUserId, route } from '@/server/http';
import { getUser, SettingsInput, updateSettings } from '@/server/users';

/** GET /api/me — dados da conta. */
export const GET = route(async () => {
  const userId = await requireUserId(auth);
  return NextResponse.json({ user: await getUser(getDb(), userId) });
});

/** PATCH /api/me — nome e tarifa de energia (R$/kWh). */
export const PATCH = route(async (request) => {
  const userId = await requireUserId(auth);
  const input = await readJson(request, SettingsInput);
  return NextResponse.json({ user: await updateSettings(getDb(), userId, input) });
});
