'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Radio, Wifi, WifiOff } from 'lucide-react';
import type { DeviceStatusEvent } from '@pc-tensor/protocol';
import type { DeviceSummary } from '@/server/devices';
import { Button } from '@/components/ui';
import { apiFetch } from '@/lib/api';
import { useRealtime } from '@/lib/realtime';
import { DeviceCard, type LiveStatus } from './device-card';
import { PairDeviceModal } from './pair-device-modal';
import { DeviceSettingsModal } from './device-settings-modal';

export function FleetView({ initialDevices, siteUrl }: { initialDevices: DeviceSummary[]; siteUrl: string | null }) {
  const [devices, setDevices] = useState(initialDevices);
  const [live, setLive] = useState<Record<string, LiveStatus>>({});
  const [pairing, setPairing] = useState(false);
  const [editing, setEditing] = useState<DeviceSummary | null>(null);
  const { socket, connection } = useRealtime();

  const reload = useCallback(async () => {
    const { devices: fresh } = await apiFetch<{ devices: DeviceSummary[] }>('/api/devices');
    setDevices(fresh);
    return fresh;
  }, []);

  // Status ao vivo pela sala da conta (não liga o modo ao vivo dos PCs)
  useEffect(() => {
    if (!socket) return undefined;
    const onStatus = (event: DeviceStatusEvent) => {
      setLive((prev) => ({ ...prev, [event.deviceId]: { ...event, receivedAt: Date.now() } }));
    };
    socket.on('device:status', onStatus);
    return () => {
      socket.off('device:status', onStatus);
    };
  }, [socket]);

  // PC que apareceu por um status (acabou de parear em outra aba ou neste modal): recarrega a lista
  const unknown = useMemo(() => Object.keys(live).some((id) => !devices.some((d) => d.id === id)), [live, devices]);
  useEffect(() => {
    if (unknown) void reload();
  }, [unknown, reload]);

  const online = devices.filter((d) => live[d.id]?.isOnline ?? d.isOnline).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Meus Computadores</h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-fg-2">
            {devices.length === 0
              ? 'Nenhum computador vinculado ainda.'
              : `${online} de ${devices.length} ${devices.length === 1 ? 'computador online' : 'computadores online'}`}
            <ConnectionBadge state={connection} />
          </p>
        </div>
        <Button onClick={() => setPairing(true)}>
          <Plus size={16} aria-hidden /> Adicionar computador
        </Button>
      </div>

      {devices.length === 0 ? (
        <EmptyState onAdd={() => setPairing(true)} />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Computadores">
          {devices.map((device) => (
            <li key={device.id}>
              <DeviceCard device={device} live={live[device.id]} onSettings={() => setEditing(device)} />
            </li>
          ))}
        </ul>
      )}

      <PairDeviceModal
        open={pairing}
        onClose={() => setPairing(false)}
        knownIds={devices.map((d) => d.id)}
        reload={reload}
        siteUrl={siteUrl}
      />
      <DeviceSettingsModal
        device={editing}
        onClose={() => setEditing(null)}
        onSaved={(updated) => setDevices((list) => list.map((d) => (d.id === updated.id ? updated : d)))}
        onDeleted={(id) => setDevices((list) => list.filter((d) => d.id !== id))}
      />
    </div>
  );
}

function ConnectionBadge({ state }: { state: 'connecting' | 'online' | 'offline' }) {
  if (state === 'online')
    return (
      <span className="inline-flex items-center gap-1 text-xs text-ok">
        <Radio size={12} aria-hidden className="animate-pulse-dot" /> ao vivo
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-xs text-fg-3">
      {state === 'offline' ? <WifiOff size={12} aria-hidden /> : <Wifi size={12} aria-hidden />}
      {state === 'offline' ? 'reconectando…' : 'conectando…'}
    </span>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-line px-6 py-16 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-surface-2 text-accent">
        <Plus size={28} aria-hidden />
      </div>
      <div>
        <h2 className="text-lg font-semibold">Vincule o seu primeiro PC</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-fg-2">
          Instale o PC Sentinel no computador, gere um código aqui e digite no app. Sem abrir portas no roteador.
        </p>
      </div>
      <Button onClick={onAdd}>Adicionar computador</Button>
    </div>
  );
}
