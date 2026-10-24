import {
  PROTOCOL_VERSION,
  parseServerMessage,
  type AlertData,
  type CommandAction,
  type CommandMap,
  type HelloData,
  type TelemetryFrame,
} from './protocol';

/**
 * Cliente do WebSocket v2 do serviço nativo.
 *
 * Estados: idle → connecting → online ⇄ stalled → offline (e reconecta sozinho).
 * "stalled" é o caso que importa para a caixa preta: o PC congelou ou travou com tela azul e a conexão TCP
 * continua aberta, mas os quadros (4 por segundo) pararam de chegar. Ele é detectado por um vigia que espera
 * no máximo `stallAfterMs` entre quadros.
 */
export type ConnectionStatus = 'idle' | 'connecting' | 'online' | 'stalled' | 'offline';

export interface DisconnectInfo {
  /** true quando não foi o cliente nem um desligamento normal do serviço que encerrou a conexão. */
  abrupt: boolean;
  reason: 'stalled' | 'closed' | 'error';
  code: number | null;
  /** Momento (ms) do último quadro recebido antes da queda. */
  lastFrameAt: number | null;
}

interface Events {
  status: ConnectionStatus;
  hello: HelloData;
  telemetry: TelemetryFrame;
  alert: AlertData;
  disconnect: DisconnectInfo;
}

type Listener<T> = (value: T) => void;

export interface SentinelSocketOptions {
  /** ws://host:porta/ws, sem o token. */
  url: string;
  token: string;
  stallAfterMs?: number;
  commandTimeoutMs?: number;
  maxRetryDelayMs?: number;
  /** Para testes. */
  WebSocketImpl?: typeof WebSocket;
  now?: () => number;
}

const NORMAL_CLOSURE = 1000;

export class CommandError extends Error {
  constructor(
    message: string,
    readonly action: CommandAction,
  ) {
    super(message);
    this.name = 'CommandError';
  }
}

export class SentinelSocket {
  private readonly options: Required<Omit<SentinelSocketOptions, 'WebSocketImpl' | 'now'>>;
  private readonly WebSocketImpl: typeof WebSocket;
  private readonly now: () => number;
  private readonly listeners: { [K in keyof Events]: Set<Listener<Events[K]>> } = {
    status: new Set(),
    hello: new Set(),
    telemetry: new Set(),
    alert: new Set(),
    disconnect: new Set(),
  };
  private readonly pending = new Map<
    string,
    {
      action: CommandAction;
      resolve: (data: unknown) => void;
      reject: (err: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();

  private socket: WebSocket | null = null;
  private stallTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryDelay = 1000;
  private commandSeq = 0;
  private lastFrameAt: number | null = null;
  private stopped = true;
  private _status: ConnectionStatus = 'idle';

  constructor(options: SentinelSocketOptions) {
    this.options = {
      url: options.url,
      token: options.token,
      stallAfterMs: options.stallAfterMs ?? 2000,
      commandTimeoutMs: options.commandTimeoutMs ?? 10_000,
      maxRetryDelayMs: options.maxRetryDelayMs ?? 15_000,
    };
    this.WebSocketImpl = options.WebSocketImpl ?? WebSocket;
    this.now = options.now ?? Date.now;
  }

  get status(): ConnectionStatus {
    return this._status;
  }

  on<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void {
    this.listeners[event].add(listener);
    return () => this.listeners[event].delete(listener);
  }

  connect(): void {
    this.stopped = false;
    this.open();
  }

  /** Encerra de propósito: não conta como queda nem reconecta. */
  close(): void {
    this.stopped = true;
    this.clearTimers();
    const socket = this.socket;
    this.socket = null;
    socket?.close(NORMAL_CLOSURE);
    this.failPending('Conexão encerrada.');
    this.setStatus('idle');
  }

  /** Envia um comando e espera o commandResult com o mesmo id. */
  send<A extends CommandAction>(action: A, params: CommandMap[A][0]): Promise<CommandMap[A][1]> {
    const socket = this.socket;
    if (!socket || socket.readyState !== this.WebSocketImpl.OPEN || this._status !== 'online') {
      return Promise.reject(new CommandError('Sem conexão com o PC.', action));
    }

    // crypto.randomUUID só existe em contexto seguro (HTTPS); na rede local o celular usa HTTP
    const id = `c${++this.commandSeq}-${this.now().toString(36)}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new CommandError('O PC não respondeu a tempo.', action));
      }, this.options.commandTimeoutMs);
      this.pending.set(id, { action, resolve: resolve as (data: unknown) => void, reject, timer });
      socket.send(JSON.stringify({ v: PROTOCOL_VERSION, type: 'command', id, action, params }));
    });
  }

  private open(): void {
    if (this.stopped || this.socket) return;
    this.setStatus('connecting');

    const url = `${this.options.url}?token=${encodeURIComponent(this.options.token)}`;
    const socket = new this.WebSocketImpl(url);
    this.socket = socket;

    socket.onopen = () => {
      if (this.socket !== socket) return;
      this.retryDelay = 1000;
      this.setStatus('online');
      this.armStallWatchdog();
    };

    socket.onmessage = (event: MessageEvent) => {
      if (this.socket !== socket || typeof event.data !== 'string') return;
      this.handleMessage(event.data);
    };

    socket.onclose = (event: CloseEvent) => {
      if (this.socket !== socket) return; // conexão já substituída (ex.: depois de "stalled")
      this.socket = null;
      const wasReceiving = this._status === 'online';
      this.handleLoss({
        abrupt: wasReceiving && event.code !== NORMAL_CLOSURE,
        reason: 'closed',
        code: event.code,
        lastFrameAt: this.lastFrameAt,
      });
    };

    socket.onerror = () => {
      // O navegador sempre dispara onclose em seguida; o tratamento fica lá
    };
  }

  private handleMessage(raw: string): void {
    const msg = parseServerMessage(raw);
    if (!msg) return;

    switch (msg.type) {
      case 'hello':
        this.emit('hello', msg.data);
        break;
      case 'telemetry':
        this.lastFrameAt = this.now();
        if (this._status === 'stalled') this.setStatus('online');
        this.armStallWatchdog();
        this.emit('telemetry', msg.data);
        break;
      case 'alert':
        this.emit('alert', msg.data);
        break;
      case 'commandResult': {
        const entry = msg.data.id ? this.pending.get(msg.data.id) : undefined;
        if (!entry || !msg.data.id) return;
        this.pending.delete(msg.data.id);
        clearTimeout(entry.timer);
        if (msg.data.ok) entry.resolve(msg.data.data);
        else entry.reject(new CommandError(msg.data.error ?? 'O comando falhou.', entry.action));
        break;
      }
    }
  }

  /** Vigia: sem quadro por stallAfterMs com a conexão aberta = PC travado. */
  private armStallWatchdog(): void {
    if (this.stallTimer) clearTimeout(this.stallTimer);
    this.stallTimer = setTimeout(() => {
      if (this._status !== 'online') return;
      this.setStatus('stalled');
      const socket = this.socket;
      this.socket = null;
      socket?.close();
      this.handleLoss({ abrupt: true, reason: 'stalled', code: null, lastFrameAt: this.lastFrameAt });
    }, this.options.stallAfterMs);
  }

  private handleLoss(info: DisconnectInfo): void {
    this.clearTimers();
    this.failPending('A conexão com o PC caiu.');
    this.emit('disconnect', info);
    if (this.stopped) return;

    if (info.reason !== 'stalled') this.setStatus('offline');
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.open();
    }, this.retryDelay);
    this.retryDelay = Math.min(this.retryDelay * 2, this.options.maxRetryDelayMs);
  }

  private failPending(message: string): void {
    for (const [id, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.reject(new CommandError(message, entry.action));
      this.pending.delete(id);
    }
  }

  private clearTimers(): void {
    if (this.stallTimer) clearTimeout(this.stallTimer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.stallTimer = null;
    this.retryTimer = null;
  }

  private setStatus(next: ConnectionStatus): void {
    if (this._status === next) return;
    this._status = next;
    this.emit('status', next);
  }

  private emit<K extends keyof Events>(event: K, value: Events[K]): void {
    for (const listener of this.listeners[event]) listener(value);
  }
}
