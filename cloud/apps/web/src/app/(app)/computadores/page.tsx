import type { Metadata } from 'next';
import { getDb } from '@pc-tensor/db';
import { auth } from '@/auth';
import { listDevices } from '@/server/devices';
import { FleetView } from './fleet-view';

export const metadata: Metadata = { title: 'Meus Computadores' };

/** A lista vem do banco já na primeira renderização; o status ao vivo chega depois pelo tempo real. */
export default async function ComputersPage() {
  const session = await auth();
  const devices = await listDevices(getDb(), session!.user.id);
  return <FleetView initialDevices={devices} siteUrl={process.env.APP_URL ?? null} />;
}
