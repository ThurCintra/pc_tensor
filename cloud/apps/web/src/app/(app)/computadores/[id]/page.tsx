import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getDb } from '@pc-tensor/db';
import type { DeviceStatusEvent } from '@pc-tensor/protocol';
import { auth } from '@/auth';
import { ApiError } from '@/server/errors';
import { getDevice } from '@/server/devices';
import { getUser } from '@/server/users';
import { LiveView } from './live-view';

type Props = { params: Promise<{ id: string }> };

async function load(userId: string, id: string) {
  try {
    return await getDevice(getDb(), userId, id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound(); // PC de outra conta: como se não existisse
    throw err;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const session = await auth();
  const { id } = await params;
  const device = session?.user?.id ? await load(session.user.id, id) : null;
  return { title: device?.name ?? 'Computador' };
}

/** Painel ao vivo de um PC: o status inicial vem do banco; os quadros, do tempo real assim que a página abre. */
export default async function DevicePage({ params }: Props) {
  const session = await auth();
  const { id } = await params;
  const [device, user] = await Promise.all([load(session!.user.id, id), getUser(getDb(), session!.user.id)]);

  const initial: DeviceStatusEvent = {
    deviceId: device.id,
    status: device.status,
    isOnline: device.isOnline,
    lastSeenAt: device.lastSeenAt,
    mode: null,
    profile: null,
    cpuTempC: device.latest?.avgCpuTemp ?? null,
    gpuTempC: device.latest?.avgGpuTemp ?? null,
  };

  return <LiveView device={device} initial={initial} tariff={user.kwhTariff} />;
}
