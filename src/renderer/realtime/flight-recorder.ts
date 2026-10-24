import { openDatabase, requestToPromise, transactionDone } from './idb';
import { RingBuffer } from './ring-buffer';
import type { TelemetryFrame } from './protocol';

/**
 * Caixa preta (flight recorder) do celular.
 *
 * Guarda em memória os últimos `windowMs` (60 s) de telemetria num buffer circular e espelha esses quadros
 * no IndexedDB a cada `persistEveryMs` (gravação em lote, para não escrever 4 vezes por segundo no celular).
 * Quando a conexão com o PC cai de forma brusca, `freeze()` congela a janela num relatório de travamento
 * permanente: é o que a tela "Post-Mortem Crash Inspector" mostra, até o milissegundo da queda.
 */

export interface RecordedFrame {
  /** Momento em que o celular recebeu o quadro (ms, relógio do celular). */
  t: number;
  frame: TelemetryFrame;
}

export type CrashReason = 'stalled' | 'closed' | 'error' | 'recovered';

export interface CrashReport {
  id: string;
  createdAt: number;
  reason: CrashReason;
  /** Último quadro recebido: o instante da queda visto pelo celular. */
  lastFrameAt: number;
  frames: RecordedFrame[];
}

export interface CrashSummaryEntry {
  value: number;
  /** Milissegundos antes da queda em que o pico aconteceu. */
  msBeforeCrash: number;
}

export interface CrashSummary {
  durationMs: number;
  frameCount: number;
  peaks: Partial<
    Record<
      'cpuTempC' | 'gpuTempC' | 'gpuHotspotC' | 'vramUsedMb' | 'systemPowerW' | 'cpuVcoreV' | 'gpuVcoreV',
      CrashSummaryEntry
    >
  >;
  lastFrame: TelemetryFrame | null;
}

export interface FlightRecorderOptions {
  windowMs?: number;
  /** Intervalo mínimo esperado entre quadros (o serviço manda a cada 250 ms; o buffer aguenta até 100 ms). */
  minIntervalMs?: number;
  persistEveryMs?: number;
  maxReports?: number;
  dbName?: string;
  indexedDB?: IDBFactory | null;
  now?: () => number;
}

const DB_VERSION = 1;
const LIVE_STORE = 'live';
const CRASH_STORE = 'crashes';

export class FlightRecorder {
  private readonly windowMs: number;
  private readonly persistEveryMs: number;
  private readonly maxReports: number;
  private readonly dbName: string;
  private readonly factory: IDBFactory | null;
  private readonly now: () => number;
  private readonly buffer: RingBuffer<RecordedFrame>;
  private unsaved: RecordedFrame[] = [];
  private lastPersist = 0;
  private dbPromise: Promise<IDBDatabase> | null = null;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(options: FlightRecorderOptions = {}) {
    this.windowMs = options.windowMs ?? 60_000;
    this.persistEveryMs = options.persistEveryMs ?? 1000;
    this.maxReports = options.maxReports ?? 10;
    this.dbName = options.dbName ?? 'pc-sentinel-blackbox';
    this.factory = options.indexedDB === undefined ? (globalThis.indexedDB ?? null) : options.indexedDB;
    this.now = options.now ?? Date.now;
    this.buffer = new RingBuffer(Math.ceil(this.windowMs / (options.minIntervalMs ?? 100)) + 1);
  }

  /** Quadros em memória, do mais antigo ao mais novo. */
  get frames(): RecordedFrame[] {
    return this.buffer.toArray();
  }

  record(frame: TelemetryFrame, t = this.now()): void {
    const entry: RecordedFrame = { t, frame };
    this.buffer.push(entry);
    while ((this.buffer.peekOldest()?.t ?? t) < t - this.windowMs) this.buffer.shift();

    this.unsaved.push(entry);
    if (t - this.lastPersist >= this.persistEveryMs) {
      this.lastPersist = t;
      void this.flush();
    }
  }

  /** Grava no IndexedDB os quadros pendentes e apaga os que saíram da janela. */
  flush(): Promise<void> {
    if (!this.factory || this.unsaved.length === 0) return this.writeChain;
    const batch = this.unsaved;
    this.unsaved = [];
    const cutoff = (batch[batch.length - 1]?.t ?? this.now()) - this.windowMs;

    return this.enqueue(async (db) => {
      const tx = db.transaction(LIVE_STORE, 'readwrite');
      const store = tx.objectStore(LIVE_STORE);
      for (const entry of batch) store.put(entry);
      store.delete(IDBKeyRange.upperBound(cutoff, true));
      await transactionDone(tx);
    });
  }

  /**
   * Congela a janela atual num relatório de travamento e recomeça a gravação.
   * Devolve null se não havia quadros (ex.: a conexão caiu antes do primeiro quadro).
   */
  async freeze(reason: CrashReason, lastFrameAt?: number | null): Promise<CrashReport | null> {
    const frames = this.buffer.toArray();
    this.buffer.clear();
    this.unsaved = [];
    if (frames.length === 0) return null;

    const report: CrashReport = {
      id: `crash-${(lastFrameAt ?? this.now()).toString(36)}`,
      createdAt: this.now(),
      reason,
      lastFrameAt: lastFrameAt ?? frames[frames.length - 1]!.t,
      frames,
    };

    await this.enqueue(async (db) => {
      const tx = db.transaction([CRASH_STORE, LIVE_STORE], 'readwrite');
      tx.objectStore(CRASH_STORE).put(report);
      tx.objectStore(LIVE_STORE).clear();
      await transactionDone(tx);
      await this.trimReports(db);
    });
    return report;
  }

  /** Descarta a gravação ao vivo (encerramento normal: não há o que analisar). */
  discard(): Promise<void> {
    this.buffer.clear();
    this.unsaved = [];
    return this.enqueue(async (db) => {
      const tx = db.transaction(LIVE_STORE, 'readwrite');
      tx.objectStore(LIVE_STORE).clear();
      await transactionDone(tx);
    });
  }

  /**
   * Ao abrir a página: se ficou gravação de uma sessão anterior que não terminou em congelamento (a aba foi
   * recarregada ou fechada com o PC já travado), transforma essa gravação num relatório.
   */
  async recoverInterrupted(maxAgeMs = 10 * 60_000): Promise<CrashReport | null> {
    if (!this.factory) return null;
    let frames: RecordedFrame[] = [];
    await this.enqueue(async (db) => {
      const tx = db.transaction(LIVE_STORE, 'readonly');
      frames = await requestToPromise(tx.objectStore(LIVE_STORE).getAll() as IDBRequest<RecordedFrame[]>);
    });
    const newest = frames[frames.length - 1];
    if (!newest || this.now() - newest.t > maxAgeMs) return null;

    for (const entry of frames) this.buffer.push(entry);
    return this.freeze('recovered', newest.t);
  }

  async listReports(): Promise<Omit<CrashReport, 'frames'>[]> {
    if (!this.factory) return [];
    let reports: CrashReport[] = [];
    await this.enqueue(async (db) => {
      const tx = db.transaction(CRASH_STORE, 'readonly');
      reports = await requestToPromise(tx.objectStore(CRASH_STORE).getAll() as IDBRequest<CrashReport[]>);
    });
    return reports.map(({ frames: _frames, ...meta }) => meta).sort((a, b) => b.lastFrameAt - a.lastFrameAt);
  }

  async getReport(id: string): Promise<CrashReport | null> {
    if (!this.factory) return null;
    let report: CrashReport | undefined;
    await this.enqueue(async (db) => {
      const tx = db.transaction(CRASH_STORE, 'readonly');
      report = await requestToPromise(tx.objectStore(CRASH_STORE).get(id) as IDBRequest<CrashReport | undefined>);
    });
    return report ?? null;
  }

  async deleteReport(id: string): Promise<void> {
    await this.enqueue(async (db) => {
      const tx = db.transaction(CRASH_STORE, 'readwrite');
      tx.objectStore(CRASH_STORE).delete(id);
      await transactionDone(tx);
    });
  }

  close(): void {
    void this.dbPromise?.then((db) => db.close());
    this.dbPromise = null;
  }

  private async trimReports(db: IDBDatabase): Promise<void> {
    const tx = db.transaction(CRASH_STORE, 'readwrite');
    const store = tx.objectStore(CRASH_STORE);
    const keys = (await requestToPromise(store.index('lastFrameAt').getAllKeys())) as string[];
    // getAllKeys do índice vem em ordem crescente de lastFrameAt: apaga os mais antigos
    for (const key of keys.slice(0, Math.max(0, keys.length - this.maxReports))) store.delete(key);
    await transactionDone(tx);
  }

  /** Serializa as escritas: lotes, congelamentos e leituras nunca se cruzam. */
  private enqueue(work: (db: IDBDatabase) => Promise<void>): Promise<void> {
    const factory = this.factory;
    if (!factory) return Promise.resolve();
    this.dbPromise ??= openDatabase(factory, this.dbName, DB_VERSION, (db) => {
      if (!db.objectStoreNames.contains(LIVE_STORE)) db.createObjectStore(LIVE_STORE, { keyPath: 't' });
      if (!db.objectStoreNames.contains(CRASH_STORE)) {
        db.createObjectStore(CRASH_STORE, { keyPath: 'id' }).createIndex('lastFrameAt', 'lastFrameAt');
      }
    });
    const dbPromise = this.dbPromise;
    this.writeChain = this.writeChain.catch(() => undefined).then(async () => work(await dbPromise));
    return this.writeChain;
  }
}

/** Picos da janela gravada e quanto tempo antes da queda cada um aconteceu. */
export function summarizeCrash(report: Pick<CrashReport, 'frames' | 'lastFrameAt'>): CrashSummary {
  const metrics: Record<keyof CrashSummary['peaks'], (f: TelemetryFrame) => number | null> = {
    cpuTempC: (f) => f.cpu.tempC,
    gpuTempC: (f) => f.gpu.tempC,
    gpuHotspotC: (f) => f.gpu.hotspotC,
    vramUsedMb: (f) => f.gpu.vramUsedMb,
    systemPowerW: (f) => f.energy.systemPowerW,
    cpuVcoreV: (f) => f.cpu.vcoreV,
    gpuVcoreV: (f) => f.gpu.vcoreV,
  };

  const peaks: CrashSummary['peaks'] = {};
  for (const [key, read] of Object.entries(metrics) as [
    keyof CrashSummary['peaks'],
    (f: TelemetryFrame) => number | null,
  ][]) {
    for (const { t, frame } of report.frames) {
      const value = read(frame);
      if (value === null || !Number.isFinite(value)) continue;
      const current = peaks[key];
      // Em empate, fica o mais recente (mais perto da queda)
      if (!current || value >= current.value) peaks[key] = { value, msBeforeCrash: report.lastFrameAt - t };
    }
  }

  const first = report.frames[0];
  const last = report.frames[report.frames.length - 1];
  return {
    durationMs: first && last ? last.t - first.t : 0,
    frameCount: report.frames.length,
    peaks,
    lastFrame: last?.frame ?? null,
  };
}
