import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SentinelStore } from '../../../src/renderer/realtime/sentinel-store';
import { SentinelSocket } from '../../../src/renderer/realtime/sentinel-socket';
import { FlightRecorder } from '../../../src/renderer/realtime/flight-recorder';
import { HapticService } from '../../../src/renderer/realtime/haptics';
import { FakeWebSocket, makeFrame } from './fixtures';

function createStore(storage = new Map<string, string>(), factory = new IDBFactory()) {
  const vibrations: number[][] = [];
  const store = new SentinelStore({
    createSocket: (options) =>
      new SentinelSocket({ ...options, WebSocketImpl: FakeWebSocket as unknown as typeof WebSocket }),
    recorder: new FlightRecorder({ indexedDB: factory }),
    haptics: new HapticService({ vibrate: (p) => (vibrations.push(p), true), storage: null }),
    storage: {
      getItem: (k) => storage.get(k) ?? null,
      setItem: (k, v) => void storage.set(k, v),
      removeItem: (k) => void storage.delete(k),
    },
  });
  return { store, vibrations, storage, factory };
}

const endpoint = { url: 'ws://127.0.0.1:3891/ws', token: 'x'.repeat(36) };

describe('SentinelStore', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    FakeWebSocket.instances = [];
  });
  afterEach(() => vi.useRealTimers());

  it('mantém o último quadro, os alertas e vibra conforme o perfil em foco', async () => {
    const { store, vibrations } = createStore();
    await store.start(endpoint);
    FakeWebSocket.last.serverOpen();
    FakeWebSocket.last.serverSend('telemetry', makeFrame());
    FakeWebSocket.last.serverSend('alert', { kind: 'NETWORK_SPIKE', severity: 'warning', message: 'Perda de 5%' });

    const state = store.getState();
    expect(state.status).toBe('online');
    expect(state.frame?.cpu.name).toBe('AMD Ryzen 5 9600X');
    expect(state.alerts[0]).toMatchObject({ kind: 'NETWORK_SPIKE', message: 'Perda de 5%' });
    expect(vibrations).toEqual([[100, 50, 100]]);
  });

  it('abre o Post-Mortem quando o PC trava no meio da sessão', async () => {
    const { store, vibrations, storage } = createStore();
    await store.start(endpoint);
    FakeWebSocket.last.serverOpen();
    for (let i = 0; i < 8; i++) {
      FakeWebSocket.last.serverSend('telemetry', makeFrame({ cpu: { ...makeFrame().cpu, tempC: 80 + i } }));
      vi.advanceTimersByTime(250);
    }
    expect(storage.get('pc-sentinel-live-session')).toBe('1');

    await vi.advanceTimersByTimeAsync(2000); // sem quadros: PC congelado
    await vi.waitFor(() => expect(store.getState().crash).not.toBeNull());

    const crash = store.getState().crash;
    expect(crash?.report.reason).toBe('stalled');
    expect(crash?.report.frames).toHaveLength(8);
    expect(crash?.summary.peaks.cpuTempC?.value).toBe(87);
    expect(vibrations).toContainEqual([800, 200, 800]);
    expect(storage.has('pc-sentinel-live-session')).toBe(false);

    store.dismissCrash();
    expect(store.getState().crash).toBeNull();
    expect(await store.recorder.listReports()).toHaveLength(1);
  });

  it('desligamento normal do serviço não gera relatório', async () => {
    const { store } = createStore();
    await store.start(endpoint);
    FakeWebSocket.last.serverOpen();
    FakeWebSocket.last.serverSend('telemetry', makeFrame());
    FakeWebSocket.last.serverClose(1000);
    await vi.advanceTimersByTimeAsync(0);

    expect(store.getState().crash).toBeNull();
    expect(await store.recorder.listReports()).toEqual([]);
    store.stop();
  });

  it('recupera a sessão se a aba anterior terminou sem encerramento limpo', async () => {
    const storage = new Map<string, string>();
    const factory = new IDBFactory();
    const first = createStore(storage, factory);
    await first.store.start(endpoint);
    FakeWebSocket.last.serverOpen();
    FakeWebSocket.last.serverSend('telemetry', makeFrame());
    await first.store.recorder.flush();
    // a aba morreu (sem stop): marca de sessão ao vivo continua gravada

    const second = createStore(storage, factory);
    await second.store.start(endpoint);

    expect(second.store.getState().crash?.report.reason).toBe('recovered');
  });

  it('encaminha os comandos do contrato', async () => {
    const { store } = createStore();
    await expect(store.stutterBuster()).rejects.toThrow('Sem conexão com o PC.');

    await store.start(endpoint);
    FakeWebSocket.last.serverOpen();
    const result = store.setEnergyConfig({ tariffBrlPerKwh: 1.1 });
    const sent = JSON.parse(FakeWebSocket.last.sent[0]!);
    expect(sent).toMatchObject({ action: 'SET_ENERGY_CONFIG', params: { tariffBrlPerKwh: 1.1 } });
    FakeWebSocket.last.serverSend('commandResult', {
      id: sent.id,
      ok: true,
      data: { tariffBrlPerKwh: 1.1, baseLoadW: 60 },
      error: null,
    });
    await expect(result).resolves.toEqual({ tariffBrlPerKwh: 1.1, baseLoadW: 60 });
  });
});
