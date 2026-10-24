'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  Flame,
  Gamepad2,
  History,
  Radio,
  Skull,
  ThermometerSun,
  Vibrate,
  Wind,
  WifiOff,
} from 'lucide-react';
import type { AlertType, DeviceAlertEvent, DeviceStatusEvent } from '@pc-tensor/protocol';
import type { DeviceSummary } from '@/server/devices';
import { Alert } from '@/components/ui';
import { EfficiencyCard, LagJudgeCard, MaintenanceCard, ThermalCard, VramCard } from '@/components/pit-wall/cards';
import { EnergyCard, type MonthEnergy } from '@/components/pit-wall/energy';
import { StutterBusterCard } from '@/components/pit-wall/stutter';
import { XRayCard } from '@/components/pit-wall/xray';
import { PostMortem, crashTime } from '@/components/pit-wall/post-mortem';
import { PROFILE_LABELS, SIZE_CLASSES, layoutFor, type CardSlot } from '@/components/pit-wall/layout';
import { num } from '@/components/pit-wall/format';
import type { CrashReport } from '@/lib/flight-recorder';
import type { TelemetryFrame } from '@/lib/telemetry';
import { useDeviceLive, type DeviceLive } from '@/lib/use-device-live';
import { STATUS, relativeTime } from '../device-card';

const ENERGY_REFRESH_MS = 60_000;

export function LiveView({
  device,
  initial,
  tariff,
}: {
  device: DeviceSummary;
  initial: DeviceStatusEvent;
  tariff: number;
}) {
  const limits = useMemo(
    () => ({ cpuC: device.maxCpuTempAlert, gpuC: device.maxGpuTempAlert }),
    [device.maxCpuTempAlert, device.maxGpuTempAlert],
  );
  const live = useDeviceLive(device.id, initial, limits);
  const { status, frame } = live;
  const now = useNow(1000);
  const month = useMonthEnergy(device.id, frame);
  const reports = useReports(live);

  const profile = frame?.profile ?? status.profile ?? 'IDLE';
  const badge = STATUS[status.status];
  const waiting = status.isOnline && !frame;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link href="/computadores" className="inline-flex w-fit items-center gap-1 text-sm text-fg-2 hover:text-fg">
          <ArrowLeft size={14} aria-hidden /> Meus Computadores
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{device.name}</h1>
            <p className="mt-1 text-sm text-fg-2">
              {status.isOnline
                ? `${PROFILE_LABELS[profile]}${frame?.context.foregroundExe ? ` · ${frame.context.foregroundExe}` : ''}`
                : `Offline · visto ${relativeTime(status.lastSeenAt, now)}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ConnectionBadge live={live} />
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${badge.className}`}
            >
              {status.status === 'IN_GAME' ? (
                <Gamepad2 size={12} aria-hidden />
              ) : (
                <span className={`size-1.5 rounded-full ${badge.dot}`} aria-hidden />
              )}
              {badge.label}
            </span>
          </div>
        </div>
      </div>

      {live.error && <Alert>{live.error}</Alert>}
      {live.suspectedCrash && (
        <Alert tone="warn">
          O PC caiu de repente com carga alta. Se ele não voltar em alguns segundos, o servidor registra como travamento
          e o Post-Mortem abre aqui com os últimos 60 s.
        </Alert>
      )}

      {frame && status.isOnline ? (
        <div className="grid grid-flow-dense auto-rows-[minmax(150px,auto)] grid-cols-2 gap-4 md:grid-cols-4">
          {layoutFor(profile).map((slot) => (
            <Card key={slot.id} slot={slot} frame={frame} live={live} tariff={tariff} month={month} now={now} />
          ))}
        </div>
      ) : (
        <OfflinePanel device={device} status={status} waiting={waiting} />
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <AlertsList alerts={live.alerts} reports={reports} onOpen={(id) => void live.openReport(id)} now={now} />
        <BlackBox reports={reports} onOpen={(id) => void live.openReport(id)} />
      </div>

      <HapticToggle live={live} />

      {live.crash && (
        <PostMortem crash={live.crash} onClose={live.dismissCrash} onDelete={() => void live.deleteCrash()} />
      )}
    </div>
  );
}

function Card({
  slot,
  frame,
  live,
  tariff,
  month,
  now,
}: {
  slot: CardSlot;
  frame: TelemetryFrame;
  live: DeviceLive;
  tariff: number;
  month: MonthEnergy | null;
  now: number;
}) {
  const props = { frame, highlight: slot.highlight, className: SIZE_CLASSES[slot.size] };
  switch (slot.id) {
    case 'cpu':
    case 'gpu':
      return <ThermalCard component={slot.id} {...props} />;
    case 'lag':
      return <LagJudgeCard {...props} />;
    case 'vram':
      return <VramCard {...props} />;
    case 'maintenance':
      return <MaintenanceCard {...props} />;
    case 'efficiency':
      return <EfficiencyCard {...props} />;
    case 'xray':
      return <XRayCard {...props} />;
    case 'energy':
      return <EnergyCard {...props} tariff={tariff} month={month} now={now} />;
    case 'stutter':
      return (
        <StutterBusterCard
          online={live.status.isOnline}
          send={live.send}
          highlight={slot.highlight}
          className={props.className}
        />
      );
  }
}

function ConnectionBadge({ live }: { live: DeviceLive }) {
  if (live.connection !== 'online')
    return (
      <span className="inline-flex items-center gap-1 text-xs text-warn">
        <WifiOff size={12} aria-hidden /> reconectando
      </span>
    );
  if (!live.frame || !live.status.isOnline) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-ok" title="Quadros a cada 250 ms">
      <Radio size={12} className="animate-pulse-dot" aria-hidden /> ao vivo
    </span>
  );
}

/** Sem quadros ao vivo: o PC está offline ou o modo ao vivo ainda está ligando. */
function OfflinePanel({
  device,
  status,
  waiting,
}: {
  device: DeviceSummary;
  status: DeviceStatusEvent;
  waiting: boolean;
}) {
  const cpu = status.cpuTempC ?? device.latest?.avgCpuTemp ?? null;
  const gpu = status.gpuTempC ?? device.latest?.avgGpuTemp ?? null;
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line px-6 py-12 text-center">
      {waiting ? (
        <>
          <Radio size={28} className="animate-pulse-dot text-accent" aria-hidden />
          <p className="font-medium">Ligando o modo ao vivo…</p>
          <p className="max-w-md text-sm text-fg-2">O PC passa a mandar leituras a cada 250 ms em instantes.</p>
        </>
      ) : (
        <>
          <WifiOff size={28} className="text-fg-3" aria-hidden />
          <p className="font-medium">O computador está offline</p>
          <p className="max-w-md text-sm text-fg-2">
            O painel volta sozinho quando o PC Sentinel conectar de novo.
            {(cpu !== null || gpu !== null) && ` Última média: CPU ${num(cpu)} °C, GPU ${num(gpu)} °C.`}
          </p>
        </>
      )}
    </div>
  );
}

const ALERTS: Record<AlertType, { label: string; icon: typeof Flame; tone: string }> = {
  OVERHEAT: { label: 'Superaquecimento', icon: Flame, tone: 'text-crit' },
  PREDICTIVE_THROTTLE: { label: 'Vai chegar ao limite', icon: ThermometerSun, tone: 'text-warn' },
  DUST_WARNING: { label: 'Hora de limpar o PC', icon: Wind, tone: 'text-warn' },
  ABRUPT_CRASH: { label: 'Queda abrupta', icon: Skull, tone: 'text-crit' },
};

function alertText(alert: DeviceAlertEvent): string {
  const d = alert.details;
  if (typeof d.message === 'string') return d.message;
  if (alert.type === 'ABRUPT_CRASH') {
    const parts = [typeof d.reason === 'string' ? d.reason : 'conexão caiu sem despedida'];
    if (typeof d.maxTempC === 'number') parts.push(`máxima de ${num(d.maxTempC)} °C`);
    if (typeof d.gpuLoadPct === 'number') parts.push(`GPU em ${num(d.gpuLoadPct)}%`);
    return parts.join(', ');
  }
  return '';
}

/** Relatório da caixa preta que corresponde a uma queda registrada pelo servidor (até 1 minuto de diferença). */
function reportFor(alert: DeviceAlertEvent, reports: Omit<CrashReport, 'frames'>[]) {
  if (alert.type !== 'ABRUPT_CRASH') return null;
  const at = new Date(typeof alert.details.lastSeenAt === 'string' ? alert.details.lastSeenAt : alert.createdAt);
  return reports.find((r) => Math.abs(r.lastFrameAt - at.getTime()) < 60_000) ?? null;
}

function AlertsList({
  alerts,
  reports,
  onOpen,
  now,
}: {
  alerts: DeviceAlertEvent[];
  reports: Omit<CrashReport, 'frames'>[];
  onOpen: (id: string) => void;
  now: number;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-fg-2">
        <AlertTriangle size={16} aria-hidden /> Alertas recentes
      </h2>
      {alerts.length === 0 ? (
        <p className="text-sm text-fg-3">Nenhum alerta deste PC.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line rounded-xl border border-line bg-surface">
          {alerts.slice(0, 10).map((alert) => {
            const meta = ALERTS[alert.type];
            const Icon = meta.icon;
            const report = reportFor(alert, reports);
            return (
              <li key={alert.id} className="flex items-start gap-3 px-4 py-3 text-sm">
                <Icon size={16} className={`mt-0.5 shrink-0 ${meta.tone}`} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{meta.label}</p>
                  <p className="text-fg-2">{alertText(alert)}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <time className="text-xs text-fg-3" dateTime={alert.createdAt}>
                    {relativeTime(alert.createdAt, now)}
                  </time>
                  {report && (
                    <button
                      type="button"
                      onClick={() => onOpen(report.id)}
                      className="text-xs font-medium text-accent hover:underline"
                    >
                      Post-Mortem
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

const REPORT_LABEL: Record<CrashReport['reason'], string> = {
  crash: 'Travamento confirmado',
  suspected: 'Queda sob carga',
  recovered: 'Queda (gravação recuperada)',
};

/** Relatórios guardados neste navegador (os quadros ao vivo não passam pelo banco). */
function BlackBox({ reports, onOpen }: { reports: Omit<CrashReport, 'frames'>[]; onOpen: (id: string) => void }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-fg-2">
        <History size={16} aria-hidden /> Caixa preta
      </h2>
      {reports.length === 0 ? (
        <p className="text-sm text-fg-3">
          Com este painel aberto, os últimos 60 s ficam gravados neste navegador. Se o PC travar sob carga, o
          Post-Mortem mostra o que aconteceu até o milissegundo da queda.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-line rounded-xl border border-line bg-surface">
          {reports.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onOpen(r.id)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm hover:bg-surface-2"
              >
                <span>
                  <span className="block font-medium">{REPORT_LABEL[r.reason]}</span>
                  <span className="text-xs text-fg-3 tabular-nums">{crashTime(r.lastFrameAt)}</span>
                </span>
                <span className="shrink-0 text-xs font-medium text-accent">Abrir Post-Mortem</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function HapticToggle({ live }: { live: DeviceLive }) {
  const [enabled, setEnabled] = useState(true);
  const [supported, setSupported] = useState(false);
  useEffect(() => {
    // Só no navegador: a API de vibração não existe na renderização do servidor
    setSupported(live.haptics.supported);
    setEnabled(live.haptics.enabled);
  }, [live.haptics]);

  if (!supported) return null;
  return (
    <label className="flex items-center gap-2 text-sm text-fg-2">
      <Vibrate size={16} aria-hidden />
      <input
        type="checkbox"
        checked={enabled}
        className="size-4 accent-[var(--accent)]"
        onChange={(e) => {
          live.haptics.setEnabled(e.target.checked);
          setEnabled(e.target.checked);
        }}
      />
      Vibrar o celular com temperatura crítica, perda de pacotes e travamentos
    </label>
  );
}

// Dados auxiliares ------------------------------------------------------------------------------

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/** Energia do mês na nuvem (início do mês no fuso deste navegador), buscada de novo a cada minuto. */
function useMonthEnergy(deviceId: string, frame: TelemetryFrame | null): MonthEnergy | null {
  const [month, setMonth] = useState<MonthEnergy | null>(null);
  const sessionWh = useRef<number | null>(null);
  useEffect(() => {
    sessionWh.current = frame ? frame.energy.sessionKwh * 1000 : null;
  }, [frame]);

  useEffect(() => {
    let active = true;
    const load = () => {
      const start = new Date();
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      const atFetch = sessionWh.current;
      fetch(`/api/devices/${deviceId}/energy?since=${encodeURIComponent(start.toISOString())}`, { cache: 'no-store' })
        .then((r) => (r.ok ? (r.json() as Promise<{ wh: number }>) : null))
        .then((data) => {
          if (active && data) setMonth({ wh: data.wh, sessionWhAtFetch: atFetch, since: start.getTime() });
        })
        .catch(() => undefined);
    };
    load();
    const timer = setInterval(load, ENERGY_REFRESH_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [deviceId]);

  return month;
}

function useReports(live: DeviceLive): Omit<CrashReport, 'frames'>[] {
  const [reports, setReports] = useState<Omit<CrashReport, 'frames'>[]>([]);
  const { recorder, reportsVersion } = live;
  useEffect(() => {
    let active = true;
    recorder
      .listReports()
      .then((list) => active && setReports(list))
      .catch(() => active && setReports([]));
    return () => {
      active = false;
    };
  }, [recorder, reportsVersion]);
  return reports;
}
