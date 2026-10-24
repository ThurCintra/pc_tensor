import { NextResponse } from 'next/server';
import { getDb } from '@pc-tensor/db';
import { auth } from '@/auth';
import { readJson, requireUserId, route } from '@/server/http';
import { deleteDevice, DeviceSettingsInput, getDevice, updateDevice } from '@/server/devices';

type Context = { params: Promise<{ id: string }> };

/** GET /api/devices/:id */
export const GET = route<Context>(async (_request, { params }) => {
  const userId = await requireUserId(auth);
  const { id } = await params;
  return NextResponse.json({ device: await getDevice(getDb(), userId, id) });
});

/** PATCH /api/devices/:id — nome, limites de alerta (°C) e alertas ligados. */
export const PATCH = route<Context>(async (request, { params }) => {
  const userId = await requireUserId(auth);
  const { id } = await params;
  const input = await readJson(request, DeviceSettingsInput);
  return NextResponse.json({ device: await updateDevice(getDb(), userId, id, input) });
});

/** DELETE /api/devices/:id — remove o PC; o token do agente deixa de funcionar. */
export const DELETE = route<Context>(async (_request, { params }) => {
  const userId = await requireUserId(auth);
  const { id } = await params;
  await deleteDevice(getDb(), userId, id);
  return new NextResponse(null, { status: 204 });
});
