import { NextResponse } from 'next/server';
import { getDb } from '@pc-tensor/db';
import { route } from '@/server/http';
import { authenticateDevice } from '@/server/devices';
import { unauthorized } from '@/server/errors';

/**
 * GET /api/agent/me — o agente confere se o token ainda vale (o PC pode ter sido removido no site)
 * e recebe a configuração de alertas e o endereço do tempo real. Autenticação: cabeçalho X-Device-Token.
 */
export const GET = route(async (request) => {
  const device = await authenticateDevice(getDb(), request.headers.get('x-device-token'));
  if (!device) throw unauthorized('Token do computador inválido ou revogado. Pareie de novo.');
  return NextResponse.json({
    deviceId: device.id,
    name: device.name,
    maxCpuTempAlert: device.maxCpuTempAlert,
    maxGpuTempAlert: device.maxGpuTempAlert,
    alertsEnabled: device.alertsEnabled,
    // Endereço público do servidor de tempo real; o agente conecta em <realtimeUrl>/agent
    realtimeUrl: process.env.REALTIME_URL ?? null,
  });
});
