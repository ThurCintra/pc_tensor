'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Activity, Cpu, Gamepad2, MemoryStick, MonitorPlay, Settings2, Thermometer } from 'lucide-react';
import type { DeviceStatus, DeviceStatusEvent } from '@pc-tensor/protocol';
import type { DeviceSummary } from '@/server/devices';

export type LiveStatus = DeviceStatusEvent & { receivedAt: number };

export const STATUS: Record<DeviceStatus, { label: string; className: string; dot: string }> = {
  ONLINE: { label: 'Online', className: 'bg-ok-bg text-ok', dot: 'bg-ok' },
  IN_GAME: { label: 'Em jogo', className: 'bg-game-bg text-game', dot: 'bg-game' },
  THERMAL_ALERT: { label: 'Alerta térmico', className: 'bg-crit-bg text-crit', dot: 'bg-crit' },
  OFFLINE: { label: 'Offline', className: 'bg-surface-2 text-fg-3', dot: 'bg-fg-3' },
};

/** "agora", "há 5 min", "há 2 h", "há 3 dias". */
export function relativeTime(iso: string | null, now: number): string {
  if (!iso) return 'nunca';
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'agora';
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86_400) return `há ${Math.floor(s / 3600)} h`;
  return `há ${Math.floor(s / 86_400)} ${s < 172_800 ? 'dia' : 'dias'}`;
}

function tempTone(temp: number | null, limit: number): string {
  if (temp === null) return 'text-fg-3';
  if (temp >= limit) return 'text-crit';
  if (temp >= limit - 10) return 'text-warn';
  return 'text-fg';
}

export function DeviceCard({
  device,
  live,
  onSettings,
}: {
  device: DeviceSummary;
  live: LiveStatus | undefined;
  onSettings: () => void;
}) {
  // Atualiza o "visto há…" sozinho
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const status = live?.status ?? device.status;
  const isOnline = live?.isOnline ?? device.isOnline;
  const cpuTemp = live?.cpuTempC ?? device.latest?.avgCpuTemp ?? null;
  const gpuTemp = live?.gpuTempC ?? device.latest?.avgGpuTemp ?? null;
  const lastSeen = live?.lastSeenAt ?? device.lastSeenAt;
  const badge = STATUS[status];

  return (
    <article
      className={`group flex h-full flex-col gap-4 rounded-xl border bg-surface p-5 transition-colors ${
        status === 'THERMAL_ALERT' ? 'border-crit/50' : 'border-line hover:border-fg-3'
      }`}
      aria-label={`${device.name}: ${badge.label}`}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold" title={device.name}>
            <Link href={`/computadores/${device.id}`} className="hover:text-accent">
              {device.name}
            </Link>
          </h3>
          <p className="mt-0.5 text-xs text-fg-3">
            {isOnline
              ? live?.mode === 'LIVE'
                ? 'Alguém está vendo ao vivo'
                : 'Conectado'
              : `Visto ${relativeTime(lastSeen, now)}`}
          </p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${badge.className}`}
        >
          {status === 'IN_GAME' ? (
            <Gamepad2 size={12} aria-hidden />
          ) : (
            <span className={`size-1.5 rounded-full ${badge.dot} ${isOnline ? 'animate-pulse-dot' : ''}`} aria-hidden />
          )}
          {badge.label}
        </span>
      </header>

      <dl className="grid grid-cols-2 gap-3">
        <Temp label="CPU" value={cpuTemp} tone={tempTone(cpuTemp, device.maxCpuTempAlert)} dim={!isOnline} />
        <Temp label="GPU" value={gpuTemp} tone={tempTone(gpuTemp, device.maxGpuTempAlert)} dim={!isOnline} />
      </dl>

      <ul className="flex flex-col gap-1.5 text-xs text-fg-2">
        <Spec icon={<Cpu size={13} aria-hidden />} text={device.cpuModel ?? 'Processador não informado'} />
        <Spec icon={<MonitorPlay size={13} aria-hidden />} text={device.gpuModel ?? 'Placa de vídeo não informada'} />
        <Spec
          icon={<MemoryStick size={13} aria-hidden />}
          text={device.totalRamGb ? `${device.totalRamGb.toLocaleString('pt-BR')} GB de RAM` : 'Memória não informada'}
        />
      </ul>

      <footer className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-xs text-fg-3">
        <span className="inline-flex items-center gap-1">
          <Thermometer size={12} aria-hidden /> Alertas em {device.maxCpuTempAlert}° / {device.maxGpuTempAlert}°
          {!device.alertsEnabled && ' (desligados)'}
        </span>
        <span className="flex items-center gap-1">
          <button
            onClick={onSettings}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-fg-2 hover:bg-surface-2 hover:text-fg"
          >
            <Settings2 size={14} aria-hidden /> Ajustes
          </button>
          <Link
            href={`/computadores/${device.id}`}
            className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-2 py-1 font-medium text-fg hover:bg-line"
          >
            <Activity size={14} aria-hidden /> Painel ao vivo
          </Link>
        </span>
      </footer>
    </article>
  );
}

function Temp({ label, value, tone, dim }: { label: string; value: number | null; tone: string; dim: boolean }) {
  return (
    <div className="rounded-lg bg-surface-2 px-3 py-2">
      <dt className="text-xs text-fg-3">{label}</dt>
      <dd className={`font-mono text-2xl font-semibold tabular-nums ${dim ? 'text-fg-3' : tone}`}>
        {value === null ? '—' : `${Math.round(value)}°`}
      </dd>
    </div>
  );
}

function Spec({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <li className="flex min-w-0 items-center gap-2">
      <span className="shrink-0 text-fg-3">{icon}</span>
      <span className="truncate" title={text}>
        {text}
      </span>
    </li>
  );
}
