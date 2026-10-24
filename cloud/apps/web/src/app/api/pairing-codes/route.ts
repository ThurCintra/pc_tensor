import { NextResponse } from 'next/server';
import { getDb } from '@pc-tensor/db';
import { auth } from '@/auth';
import { requireUserId, route } from '@/server/http';
import { createPairingCode } from '@/server/pairing';

/** POST /api/pairing-codes — "Adicionar computador": código de 6 dígitos válido por 5 minutos. */
export const POST = route(async () => {
  const userId = await requireUserId(auth);
  return NextResponse.json(await createPairingCode(getDb(), userId), { status: 201 });
});
