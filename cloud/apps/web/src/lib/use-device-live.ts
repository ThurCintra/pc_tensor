'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Command, CommandResult, DeviceAlertEvent, DeviceStatusEvent } from '@pc-tensor/protocol';
import {
  FlightRecorder,
  droppedUnderLoad,
  summarizeCrash,
  type CrashReport,
  type CrashSummary,
} from './flight-recorder';
import { HapticService, hapticForAlert, hapticsForFrame } from './haptics';
import { normalizeFrame, type TelemetryFrame } from './telemetry';
import { useRealtime, type ConnectionState } from './realtime';

export interface CrashState {
  report: CrashReport;
  summary: CrashSummary;
}

/** Tempo que o comando remoto pode levar (o servidor espera 15 s pelo PC). */
const COMMAND_TIMEOUT_MS = 20_000;

export interface DeviceLive {
  connection: ConnectionState;
  status: DeviceStatusEvent;
  frame: TelemetryFrame | null;
  /** Momento (relógio do navegador) do último quadro. */
  frameAt: number | null;
  alerts: DeviceAlertEvent[];
  /** Caiu sob carga e o servidor ainda não confirmou o travamento. */
  suspectedCrash: boolean;
  crash: CrashState | null;
  /** Muda quando a lista de relatórios da caixa preta muda. */
  reportsVersion: number;
  recorder: FlightRecorder;
  haptics: HapticService;
  error: string | null;
  openReport: (id: string) => Promise<void>;
  dismissCrash: () => void;
  deleteCrash: () => Promise<void>;
  send: (command: Command) => Promise<CommandResult>;
}

/**
 * Painel ao vivo de um PC: entra na sala do PC (o que liga o modo LIVE no agente), recebe os quadros de 250 ms,
 * grava a caixa preta e transforma uma queda sob carga em Post-Mortem quando o servidor confirma o travamento.
 */
export function useDeviceLive(
  deviceId: string,
  initial: DeviceStatusEvent,
  limits: { cpuC: number; gpuC: number },
): DeviceLive {
  const { socket, connection } = useRealtime();
  const [recorder] = useState(() => new FlightRecorder({ dbName: `pc-tensor-blackbox-${deviceId}` }));
  const [haptics] = useState(() => new HapticService());
  const [status, setStatus] = useState(initial);
  const [frame, setFrame] = useState<TelemetryFrame | null>(null);
  const [frameAt, setFrameAt] = useState<number | null>(null);
  const [alerts, setAlerts] = useState<DeviceAlertEvent[]>([]);
  const [suspectedId, setSuspectedId] = useState<string | null>(null);
  const [crash, setCrash] = useState<CrashState | null>(null);
  const [reportsVersion, setReportsVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Valores lidos nos ouvintes do socket sem recriá-los a cada quadro
  const statusRef = useRef(status);
  const suspectedRef = useRef<string | null>(null);
  const limitsRef = useRef(limits);
  useEffect(() => {
    limitsRef.current = limits;
  }, [limits]);

  const setSuspected = useCallback((id: string | null) => {
    suspectedRef.current = id;
    setSuspectedId(id);
  }, []);

  const openCrash = useCallback((report: CrashReport) => {
    setCrash({ report, summary: summarizeCrash(report) });
    setReportsVersion((v) => v + 1);
  }, []);

  // Alertas já gravados (o painel mostra os últimos)
  useEffect(() => {
    let active = true;
    fetch(`/api/devices/${deviceId}/alerts?limit=20`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { alerts: [] }))
      .then(
        (data: { alerts: { id: string; type: DeviceAlertEvent['type']; details: unknown; createdAt: string }[] }) => {
          if (!active) return;
          setAlerts((current) => {
            const known = new Set(current.map((a) => a.id));
            const loaded = data.alerts
              .filter((a) => !known.has(a.id))
              .map((a) => ({
                deviceId,
                id: a.id,
                type: a.type,
                createdAt: a.createdAt,
                details: (a.details ?? {}) as Record<string, unknown>,
              }));
            return [...current, ...loaded].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
          });
        },
      )
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [deviceId]);

  useEffect(() => {
    if (!socket) return undefined;

    // A conexão com o PC caiu: sob carga vira relatório (suspeito até o servidor confirmar); senão, descarta
    const onDrop = async () => {
      const last = recorder.frames.at(-1);
      if (!last || !droppedUnderLoad(last.frame)) {
        await recorder.discard().catch(() => undefined);
        return;
      }
      const report = await recorder.freeze('suspected', last.t).catch(() => null);
      if (report) {
        setSuspected(report.id);
        setReportsVersion((v) => v + 1);
      }
    };

    const applyStatus = (next: DeviceStatusEvent) => {
      const previous = statusRef.current;
      statusRef.current = next;
      setStatus(next);
      if (previous.isOnline && !next.isOnline) void onDrop();
      if (!previous.isOnline && next.isOnline && suspectedRef.current) {
        // Voltou dentro da tolerância: foi a rede piscando, não travamento
        const id = suspectedRef.current;
        setSuspected(null);
        void recorder
          .deleteReport(id)
          .then(() => setReportsVersion((v) => v + 1))
          .catch(() => undefined);
      }
    };

    const subscribe = () => {
      socket.emit('device:subscribe', { deviceId }, (result) => {
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setError(null);
        const first = statusRef.current === initial;
        applyStatus(result.data);
        // Ao abrir a página: gravação de uma visita anterior em que o PC caiu vira relatório
        if (first && !result.data.isOnline) {
          void recorder.recoverInterrupted().then((report) => report && setReportsVersion((v) => v + 1));
        } else if (first) {
          void recorder.discard().catch(() => undefined);
        }
      });
    };

    const onTelemetry = ({ deviceId: id, frame: raw }: { deviceId: string; frame: unknown }) => {
      if (id !== deviceId) return;
      const next = normalizeFrame(raw);
      const t = Date.now();
      recorder.record(next, t);
      setFrame(next);
      setFrameAt(t);
      for (const kind of hapticsForFrame(next, limitsRef.current)) haptics.notify(kind, next.profile);
    };

    const onStatus = (event: DeviceStatusEvent) => {
      if (event.deviceId === deviceId) applyStatus(event);
    };

    const onAlert = (event: DeviceAlertEvent) => {
      if (event.deviceId !== deviceId) return;
      setAlerts((current) => [event, ...current.filter((a) => a.id !== event.id)].slice(0, 50));
      const kind = hapticForAlert(event.type);
      if (kind) haptics.notify(kind, statusRef.current.profile);

      // O servidor confirmou o travamento: a gravação suspeita vira Post-Mortem e abre na tela
      if (event.type === 'ABRUPT_CRASH' && suspectedRef.current) {
        const id = suspectedRef.current;
        setSuspected(null);
        void recorder.setReason(id, 'crash').then((report) => report && openCrash(report));
      }
    };

    socket.on('connect', subscribe);
    socket.on('device:telemetry', onTelemetry);
    socket.on('device:status', onStatus);
    socket.on('device:alert', onAlert);
    if (socket.connected) subscribe();

    return () => {
      socket.off('connect', subscribe);
      socket.off('device:telemetry', onTelemetry);
      socket.off('device:status', onStatus);
      socket.off('device:alert', onAlert);
      // Sem ninguém olhando, o PC volta para 1 resumo por minuto
      socket.emit('device:unsubscribe', { deviceId });
      void recorder.flush();
    };
  }, [socket, deviceId, recorder, haptics, initial, openCrash, setSuspected]);

  useEffect(() => () => recorder.close(), [recorder]);

  const openReport = useCallback(
    async (id: string) => {
      const report = await recorder.getReport(id);
      if (report) setCrash({ report, summary: summarizeCrash(report) });
    },
    [recorder],
  );

  const dismissCrash = useCallback(() => setCrash(null), []);

  const deleteCrash = useCallback(async () => {
    if (crash) await recorder.deleteReport(crash.report.id);
    setCrash(null);
    setReportsVersion((v) => v + 1);
  }, [crash, recorder]);

  const send = useCallback(
    (command: Command) =>
      new Promise<CommandResult>((resolve, reject) => {
        if (!socket?.connected) return reject(new Error('Sem conexão com o servidor.'));
        socket.timeout(COMMAND_TIMEOUT_MS).emit('device:command', { deviceId, command }, (err, result) => {
          if (err) return reject(new Error('O computador não respondeu a tempo.'));
          if (!result.ok) return reject(new Error(result.error));
          resolve(result.data);
        });
      }),
    [socket, deviceId],
  );

  return {
    connection,
    status,
    frame,
    frameAt,
    alerts,
    suspectedCrash: suspectedId !== null,
    crash,
    reportsVersion,
    recorder,
    haptics,
    error,
    openReport,
    dismissCrash,
    deleteCrash,
    send,
  };
}
