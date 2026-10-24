import { createServer, type Server as HttpServer } from 'node:http';
import { Server, type Namespace, type Socket } from 'socket.io';
import {
  AgentAlert,
  COMMAND_TIMEOUT_MS,
  Command,
  CommandResult,
  Heartbeat,
  LiveFrame,
  NAMESPACES,
  STREAM_INTERVAL_MS,
  deriveStatus,
  deviceRoom,
  type AgentClientToServer,
  type AgentServerToClient,
  type ClientClientToServer,
  type ClientServerToClient,
  type DeviceAlertEvent,
  type DeviceStatusEvent,
  type Profile,
  type StreamMode,
} from '@pc-tensor/protocol';
import { verifyRealtimeToken } from '@pc-tensor/protocol/realtime-token';
import { PresenceTracker } from './presence';
import { assessDisconnect, type LastActivity } from './crash';
import type { DeviceRecord, DeviceStore, StoredAlert } from './store';

export interface RealtimeOptions {
  store: DeviceStore;
  jwtSecret: string;
  /** Origens do navegador autorizadas (o site). */
  corsOrigins: string[];
  /** Espera antes de registrar ABRUPT_CRASH (um Wi-Fi que piscou reconecta antes). */
  crashGraceMs?: number;
  /** Intervalo mínimo entre quadros LIVE aceitos de um agente (o agente manda a cada 250 ms). */
  minFrameIntervalMs?: number;
  /** O mesmo tipo de alerta do mesmo PC só é gravado de novo depois disso. */
  alertCooldownMs?: number;
  pingIntervalMs?: number;
  pingTimeoutMs?: number;
  now?: () => number;
  log?: Pick<Console, 'info' | 'warn' | 'error'>;
}

type AgentSocket = Socket<AgentClientToServer, AgentServerToClient, Record<string, never>, { device: DeviceRecord }>;
type ClientSocket = Socket<
  ClientClientToServer,
  ClientServerToClient,
  Record<string, never>,
  { userId: string; subscriptions: Set<string>; commandTimes: number[] }
>;

interface AgentState {
  socket: AgentSocket;
  device: DeviceRecord;
  mode: StreamMode;
  lastFrameAt: number;
  activity: LastActivity | null;
  lastFrameStatus: { profile: Profile | null; cpuTempC: number | null; gpuTempC: number | null };
}

const COMMAND_RATE = { limit: 5, windowMs: 10_000 };

/**
 * Servidor de tempo real do pc_tensor Cloud.
 * - /agent: os PCs conectam de dentro para fora (sem abrir portas no roteador), autenticados pelo DeviceToken.
 * - /client: navegadores, autenticados pelo token curto emitido pelo site.
 * Cada PC tem uma sala `device:{id}`; só o dono entra nela. Com alguém olhando, o PC transmite ao vivo e o
 * servidor só repassa os quadros na memória (sem tocar no banco); sem ninguém, o PC manda 1 resumo por minuto.
 */
export function createRealtimeServer(options: RealtimeOptions) {
  const {
    store,
    jwtSecret,
    corsOrigins,
    crashGraceMs = 20_000,
    minFrameIntervalMs = 200,
    alertCooldownMs = 5 * 60_000,
    now = Date.now,
    log = console,
  } = options;

  const httpServer: HttpServer = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', agents: agents.size }));
      return;
    }
    res.writeHead(404).end();
  });

  const io = new Server(httpServer, {
    cors: { origin: corsOrigins, credentials: false },
    maxHttpBufferSize: 64 * 1024, // um quadro tem ~2 KB; 64 KB barra abuso
    pingInterval: options.pingIntervalMs ?? 10_000,
    pingTimeout: options.pingTimeoutMs ?? 10_000,
    serveClient: false,
  });

  const agentNs: Namespace<AgentClientToServer, AgentServerToClient> = io.of(NAMESPACES.agent);
  const clientNs: Namespace<ClientClientToServer, ClientServerToClient> = io.of(NAMESPACES.client);
  const presence = new PresenceTracker();
  const agents = new Map<string, AgentState>();
  const pendingCrashes = new Map<string, NodeJS.Timeout>();
  const lastAlertAt = new Map<string, number>();

  // Estado e alertas para quem está olhando ----------------------------------------------------

  function statusEvent(deviceId: string, device: DeviceRecord): DeviceStatusEvent {
    const agent = agents.get(deviceId);
    return {
      deviceId,
      isOnline: Boolean(agent),
      lastSeenAt: (agent ? new Date(agent.lastFrameAt || now()) : device.lastSeenAt)?.toISOString() ?? null,
      mode: agent?.mode ?? null,
      status: deriveStatus({
        isOnline: Boolean(agent),
        profile: agent?.lastFrameStatus.profile ?? null,
        cpuTempC: agent?.lastFrameStatus.cpuTempC ?? null,
        gpuTempC: agent?.lastFrameStatus.gpuTempC ?? null,
        maxCpuTempAlert: device.maxCpuTempAlert,
        maxGpuTempAlert: device.maxGpuTempAlert,
      }),
    };
  }

  function broadcastStatus(deviceId: string, device: DeviceRecord) {
    clientNs.to(deviceRoom(deviceId)).emit('device:status', statusEvent(deviceId, device));
  }

  async function recordAlert(
    device: DeviceRecord,
    type: StoredAlert['type'],
    details: Record<string, unknown>,
    force = false,
  ) {
    const key = `${device.id}:${type}`;
    const last = lastAlertAt.get(key);
    if (!force && last !== undefined && now() - last < alertCooldownMs) return null;
    lastAlertAt.set(key, now());

    const alert = await store.saveAlert(device.id, type, details);
    const event: DeviceAlertEvent = {
      deviceId: device.id,
      id: alert.id,
      type,
      createdAt: alert.createdAt.toISOString(),
      details,
    };
    clientNs.to(deviceRoom(device.id)).emit('device:alert', event);
    return alert;
  }

  function setMode(deviceId: string, mode: StreamMode) {
    const agent = agents.get(deviceId);
    if (!agent || agent.mode === mode) return;
    agent.mode = mode;
    agent.socket.emit('stream:mode', { mode, intervalMs: STREAM_INTERVAL_MS[mode] });
    broadcastStatus(deviceId, agent.device);
  }

  // Agentes (PCs) -----------------------------------------------------------------------------

  agentNs.use(async (socket, next) => {
    try {
      const token =
        (socket.handshake.auth?.token as string | undefined) ??
        (socket.handshake.headers['x-device-token'] as string | undefined);
      const device = token ? await store.findDeviceByToken(token) : null;
      if (!device) return next(new Error('UNAUTHORIZED'));
      socket.data.device = device;
      next();
    } catch (err) {
      log.error('[agent] falha na autenticação', err);
      next(new Error('INTERNAL'));
    }
  });

  agentNs.on('connection', async (rawSocket) => {
    const socket = rawSocket as unknown as AgentSocket;
    const device = socket.data.device;

    // Um PC, uma conexão: se reconectou antes de o servidor perceber a queda, a conexão antiga sai
    const previous = agents.get(device.id);
    if (previous && previous.socket.id !== socket.id) previous.socket.disconnect(true);

    // Voltou dentro da tolerância: não foi travamento
    const pending = pendingCrashes.get(device.id);
    if (pending) {
      clearTimeout(pending);
      pendingCrashes.delete(device.id);
    }

    const mode = presence.modeFor(device.id);
    agents.set(device.id, {
      socket,
      device,
      mode,
      lastFrameAt: 0,
      activity: null,
      lastFrameStatus: { profile: null, cpuTempC: null, gpuTempC: null },
    });
    socket.emit('stream:mode', { mode, intervalMs: STREAM_INTERVAL_MS[mode] });
    await store.setOnline(device.id, true, new Date(now())).catch((err) => log.error('[agent] setOnline', err));
    broadcastStatus(device.id, device);
    log.info(`[agent] ${device.id} conectado (${mode})`);

    socket.on('telemetry:live', (raw) => {
      const state = agents.get(device.id);
      if (!state || state.socket !== socket) return;
      const t = now();
      if (t - state.lastFrameAt < minFrameIntervalMs) return; // agente acelerado demais: descarta
      const parsed = LiveFrame.safeParse(raw);
      if (!parsed.success) return;

      const frame = parsed.data;
      state.lastFrameAt = t;
      state.activity = {
        at: t,
        profile: frame.profile,
        cpuLoadPct: frame.cpu.loadPct,
        gpuLoadPct: frame.gpu.loadPct,
        maxTempC: Math.max(frame.cpu.tempC ?? -Infinity, frame.gpu.tempC ?? -Infinity),
      };
      const previousStatus = statusEvent(device.id, state.device).status;
      state.lastFrameStatus = { profile: frame.profile, cpuTempC: frame.cpu.tempC, gpuTempC: frame.gpu.tempC };

      // Repasse direto na memória; "volatile" descarta se o navegador estiver atrasado
      clientNs.to(deviceRoom(device.id)).volatile.emit('device:telemetry', { deviceId: device.id, frame });
      if (statusEvent(device.id, state.device).status !== previousStatus) broadcastStatus(device.id, state.device);
    });

    socket.on('telemetry:heartbeat', async (raw, ack) => {
      const state = agents.get(device.id);
      const parsed = Heartbeat.safeParse(raw);
      if (!state || !parsed.success) return ack?.(false);
      const hb = parsed.data;
      state.activity = { at: now(), profile: hb.profile, cpuLoadPct: null, gpuLoadPct: null, maxTempC: hb.maxTemp };
      state.lastFrameStatus = { profile: hb.profile, cpuTempC: hb.avgCpuTemp, gpuTempC: hb.avgGpuTemp };
      try {
        await store.saveHeartbeat(device.id, hb);
        ack?.(true);
      } catch (err) {
        log.error('[agent] heartbeat', err);
        ack?.(false);
      }
    });

    socket.on('alert', async (raw) => {
      const parsed = AgentAlert.safeParse(raw);
      if (!parsed.success) return;
      const current = (await store.getDevice(device.id)) ?? device; // limites e alertas podem ter mudado no site
      if (!current.alertsEnabled) return;
      await recordAlert(current, parsed.data.type, { ...parsed.data }).catch((err) => log.error('[agent] alerta', err));
    });

    socket.on('disconnect', async (reason) => {
      const state = agents.get(device.id);
      if (!state || state.socket !== socket) return; // substituída por uma conexão nova
      agents.delete(device.id);
      const at = now();
      await store
        .setOnline(device.id, false, new Date(state.lastFrameAt || at))
        .catch((err) => log.error('[agent] setOffline', err));
      broadcastStatus(device.id, state.device);

      const assessment = assessDisconnect(reason, state.activity, at);
      log.info(`[agent] ${device.id} desconectado: ${reason} (${assessment.reason})`);
      if (!assessment.suspected) return;

      const lastActivity = state.activity;
      const timer = setTimeout(() => {
        pendingCrashes.delete(device.id);
        if (agents.has(device.id)) return;
        void recordAlert(
          state.device,
          'ABRUPT_CRASH',
          {
            reason: assessment.reason,
            disconnectReason: reason,
            lastSeenAt: new Date(lastActivity?.at ?? at).toISOString(),
            profile: lastActivity?.profile ?? null,
            cpuLoadPct: lastActivity?.cpuLoadPct ?? null,
            gpuLoadPct: lastActivity?.gpuLoadPct ?? null,
            maxTempC: lastActivity?.maxTempC ?? null,
          },
          true,
        ).catch((err) => log.error('[agent] ABRUPT_CRASH', err));
      }, crashGraceMs);
      timer.unref();
      pendingCrashes.set(device.id, timer);
    });
  });

  // Navegadores ------------------------------------------------------------------------------

  clientNs.use(async (socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    const userId = token ? await verifyRealtimeToken(token, jwtSecret) : null;
    if (!userId) return next(new Error('UNAUTHORIZED'));
    socket.data.userId = userId;
    socket.data.subscriptions = new Set();
    socket.data.commandTimes = [];
    next();
  });

  clientNs.on('connection', (rawSocket) => {
    const socket = rawSocket as unknown as ClientSocket;
    const { userId } = socket.data;

    socket.on('device:subscribe', async (payload, ack) => {
      if (typeof ack !== 'function') return;
      const deviceId = typeof payload?.deviceId === 'string' ? payload.deviceId : '';
      try {
        // Isolamento: só o dono do PC entra na sala; para os outros o PC "não existe"
        const device = deviceId ? await store.findOwnedDevice(userId, deviceId) : null;
        if (!device) return ack({ ok: false, error: 'Computador não encontrado.' });

        if (!socket.data.subscriptions.has(deviceId)) {
          socket.data.subscriptions.add(deviceId);
          await socket.join(deviceRoom(deviceId));
          if (presence.add(deviceId, socket.id) === 'LIVE') setMode(deviceId, 'LIVE');
        }
        ack({ ok: true, data: statusEvent(deviceId, device) });
      } catch (err) {
        log.error('[client] subscribe', err);
        ack({ ok: false, error: 'Erro interno.' });
      }
    });

    socket.on('device:unsubscribe', async (payload, ack) => {
      const deviceId = typeof payload?.deviceId === 'string' ? payload.deviceId : '';
      if (socket.data.subscriptions.delete(deviceId)) {
        await socket.leave(deviceRoom(deviceId));
        if (presence.remove(deviceId, socket.id) === 'HEARTBEAT') setMode(deviceId, 'HEARTBEAT');
      }
      ack?.({ ok: true, data: null });
    });

    socket.on('device:command', async (payload, ack) => {
      if (typeof ack !== 'function') return;
      const deviceId = typeof payload?.deviceId === 'string' ? payload.deviceId : '';
      // Só para PCs em que o socket já entrou (ou seja, cuja posse foi verificada no subscribe)
      if (!socket.data.subscriptions.has(deviceId))
        return ack({ ok: false, error: 'Abra o painel do computador primeiro.' });

      const t = now();
      socket.data.commandTimes = socket.data.commandTimes.filter((x) => t - x < COMMAND_RATE.windowMs);
      if (socket.data.commandTimes.length >= COMMAND_RATE.limit)
        return ack({ ok: false, error: 'Muitos comandos seguidos. Aguarde alguns segundos.' });
      socket.data.commandTimes.push(t);

      const command = Command.safeParse(payload?.command);
      if (!command.success) return ack({ ok: false, error: 'Comando não permitido.' });

      const agent = agents.get(deviceId);
      if (!agent) return ack({ ok: false, error: 'O computador está offline.' });

      try {
        const result = await agent.socket.timeout(COMMAND_TIMEOUT_MS).emitWithAck('command', command.data);
        const parsed = CommandResult.safeParse(result);
        ack(
          parsed.success ? { ok: true, data: parsed.data } : { ok: false, error: 'Resposta inválida do computador.' },
        );
      } catch {
        ack({ ok: false, error: 'O computador não respondeu a tempo.' });
      }
    });

    socket.on('disconnect', () => {
      for (const deviceId of presence.removeSocket(socket.id)) setMode(deviceId, 'HEARTBEAT');
    });
  });

  return {
    io,
    httpServer,
    presence,
    /** Marca todos offline (ninguém conectado ao subir) e começa a ouvir. */
    async listen(port: number, host = '0.0.0.0'): Promise<number> {
      await store.resetOnline();
      await new Promise<void>((resolve) => httpServer.listen(port, host, resolve));
      const address = httpServer.address();
      return typeof address === 'object' && address ? address.port : port;
    },
    async close(): Promise<void> {
      for (const timer of pendingCrashes.values()) clearTimeout(timer);
      pendingCrashes.clear();
      await new Promise<void>((resolve) => io.close(() => resolve()));
    },
  };
}
