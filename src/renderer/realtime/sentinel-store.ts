import { FlightRecorder, summarizeCrash, type CrashReport, type CrashSummary } from './flight-recorder';
import { HapticService } from './haptics';
import {
  SentinelSocket,
  type ConnectionStatus,
  type DisconnectInfo,
  type SentinelSocketOptions,
} from './sentinel-socket';
import type { AlertData, CommandAction, CommandMap, HelloData, TelemetryFrame } from './protocol';
import type { ServiceEndpoint } from './endpoint';

export interface ReceivedAlert extends AlertData {
  receivedAt: number;
}

export interface CrashState {
  report: CrashReport;
  summary: CrashSummary;
}

export interface SentinelState {
  status: ConnectionStatus;
  hello: HelloData | null;
  frame: TelemetryFrame | null;
  /** Alertas mais recentes primeiro (até 20). */
  alerts: ReceivedAlert[];
  /** Relatório de travamento aberto no Post-Mortem (null quando não há queda para analisar). */
  crash: CrashState | null;
}

const MAX_ALERTS = 20;

/** Marca de sessão ao vivo: fica gravada enquanto há telemetria e some num encerramento limpo. */
const LIVE_SESSION_KEY = 'pc-sentinel-live-session';

export interface SentinelStoreOptions {
  createSocket?: (options: SentinelSocketOptions) => SentinelSocket;
  recorder?: FlightRecorder;
  haptics?: HapticService;
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
  now?: () => number;
}

/**
 * Estado de tempo real do app, fora do React: um cliente WebSocket, a caixa preta e a vibração.
 * Os componentes leem por useSentinel (useSyncExternalStore); o estado é imutável a cada mudança.
 */
export class SentinelStore {
  private state: SentinelState = { status: 'idle', hello: null, frame: null, alerts: [], crash: null };
  private readonly listeners = new Set<() => void>();
  private readonly createSocket: (options: SentinelSocketOptions) => SentinelSocket;
  private readonly storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
  private readonly now: () => number;
  private socket: SentinelSocket | null = null;
  private unsubscribers: (() => void)[] = [];
  private liveMarked = false;

  readonly recorder: FlightRecorder;
  readonly haptics: HapticService;

  constructor(options: SentinelStoreOptions = {}) {
    this.createSocket = options.createSocket ?? ((o) => new SentinelSocket(o));
    this.recorder = options.recorder ?? new FlightRecorder();
    this.haptics = options.haptics ?? new HapticService();
    this.storage = options.storage !== undefined ? options.storage : safeStorage();
    this.now = options.now ?? Date.now;
  }

  getState = (): SentinelState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Conecta ao serviço. Antes, recupera a gravação de uma sessão que terminou sem encerramento limpo. */
  async start(endpoint: ServiceEndpoint): Promise<void> {
    if (this.socket) return;

    if (this.readMarker()) {
      const recovered = await this.recorder.recoverInterrupted();
      if (recovered) this.openCrash(recovered);
    }
    this.clearMarker();

    const socket = this.createSocket(endpoint);
    this.socket = socket;
    this.unsubscribers = [
      socket.on('status', (status) => this.update({ status })),
      socket.on('hello', (hello) => this.update({ hello })),
      socket.on('telemetry', (frame) => this.onTelemetry(frame)),
      socket.on('alert', (alert) => this.onAlert(alert)),
      socket.on('disconnect', (info) => void this.onDisconnect(info)),
    ];
    socket.connect();
  }

  /** Encerramento limpo (sair da página, trocar de PC): não gera relatório. */
  stop(): void {
    this.unsubscribers.forEach((off) => off());
    this.unsubscribers = [];
    this.socket?.close();
    this.socket = null;
    this.clearMarker();
    void this.recorder.flush();
    this.update({ status: 'idle' });
  }

  send<A extends CommandAction>(action: A, params: CommandMap[A][0]): Promise<CommandMap[A][1]> {
    if (!this.socket) return Promise.reject(new Error('Sem conexão com o PC.'));
    return this.socket.send(action, params);
  }

  stutterBuster(): Promise<CommandMap['STUTTER_BUSTER'][1]> {
    return this.send('STUTTER_BUSTER', {});
  }

  setEnergyConfig(config: CommandMap['SET_ENERGY_CONFIG'][0]): Promise<CommandMap['SET_ENERGY_CONFIG'][1]> {
    return this.send('SET_ENERGY_CONFIG', config);
  }

  /** Abre um relatório salvo no Post-Mortem. */
  async openReport(id: string): Promise<void> {
    const report = await this.recorder.getReport(id);
    if (report) this.openCrash(report);
  }

  dismissCrash(): void {
    this.update({ crash: null });
  }

  private onTelemetry(frame: TelemetryFrame): void {
    this.recorder.record(frame, this.now());
    if (!this.liveMarked) this.writeMarker();
    this.update({ frame });
  }

  private onAlert(alert: AlertData): void {
    this.haptics.notify(alert, this.state.frame?.context.profile ?? null);
    const received: ReceivedAlert = { ...alert, receivedAt: this.now() };
    this.update({ alerts: [received, ...this.state.alerts].slice(0, MAX_ALERTS) });
  }

  private async onDisconnect(info: DisconnectInfo): Promise<void> {
    if (!info.abrupt) {
      // Serviço desligado normalmente (PC desligado pelo usuário): descarta a gravação
      await this.recorder.discard();
      this.clearMarker();
      return;
    }
    const report = await this.recorder.freeze(info.reason, info.lastFrameAt);
    this.clearMarker();
    if (report) {
      // Vibração longa: o PC caiu (vale em qualquer perfil, como um alerta crítico)
      this.haptics.notify({ kind: 'THROTTLING', severity: 'critical' }, null);
      this.openCrash(report);
    }
  }

  private openCrash(report: CrashReport): void {
    this.update({ crash: { report, summary: summarizeCrash(report) } });
  }

  private update(patch: Partial<SentinelState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  private readMarker(): boolean {
    try {
      return this.storage?.getItem(LIVE_SESSION_KEY) === '1';
    } catch {
      return false;
    }
  }

  private writeMarker(): void {
    try {
      this.storage?.setItem(LIVE_SESSION_KEY, '1');
      this.liveMarked = true;
    } catch {
      // sem armazenamento: a recuperação depois de fechar a aba fica indisponível
    }
  }

  private clearMarker(): void {
    this.liveMarked = false;
    try {
      this.storage?.removeItem(LIVE_SESSION_KEY);
    } catch {
      // idem
    }
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
