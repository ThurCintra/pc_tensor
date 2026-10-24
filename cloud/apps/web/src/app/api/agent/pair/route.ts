import { NextResponse } from 'next/server';
import { getDb } from '@pc-tensor/db';
import { PairRequest } from '@pc-tensor/protocol';
import { clientIp, readJson, route } from '@/server/http';
import { redeemPairingCode } from '@/server/pairing';
import { limits } from '@/server/rate-limit';

/**
 * POST /api/agent/pair — chamado pelo agente no PC (sem sessão): troca o código de 6 dígitos pelo
 * DeviceToken definitivo. Limitado por IP para inviabilizar adivinhar códigos.
 */
export const POST = route(async (request) => {
  limits.pair.consume(`pair:${clientIp(request)}`);
  const input = await readJson(request, PairRequest);
  return NextResponse.json(await redeemPairingCode(getDb(), input), { status: 201 });
});
