import { describe, it, expect, vi, afterEach } from 'vitest';
const EventEmitter = require('events');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { SensorBridge, STALE_AFTER_MS } = require('../../../src/main/telemetry/sensor-bridge');
const {
  HybridSensorSource,
  ServiceSensorSource,
  frameToBridgeData,
  STARTUP_GRACE_MS,
  HEALTHY_FOR_MS,
} = require('../../../src/main/telemetry/hybrid-sensors');

/** Quadro do contrato v2 com o mínimo que o coletor usa. */
const FRAME = {
  cpu: { name: 'AMD Ryzen 5 9600X', tempC: 61.5, loadPct: 40, powerW: 70 },
  gpu: {
    name: 'AMD Radeon RX 7600',
    tempC: 58,
    hotspotC: 70,
    memoryTempC: 66,
    loadPct: 85,
    powerW: 120,
    vramUsedMb: 4096,
    vramTotalMb: 8192,
    fanRpm: 1500,
  },
  board: { name: 'PRO B650M-P', systemTempC: 38, vrmTempC: null },
  storage: [{ name: 'KINGSTON SNV3S500G', tempC: 44 }],
  fans: [{ name: 'CPU Fan', rpm: 1100, pct: 40 }],
};

/** Quadro de um serviço rodando como administrador: ele também mede o disco. */
const FRAME_WITH_DISK = {
  ...FRAME,
  storage: [
    { name: 'KINGSTON SNV3S500G', tempC: 44, readBps: 2000000, writeBps: 500000, activityPct: 12.5 },
    { name: 'HDD', tempC: 35, readBps: 1000000, writeBps: null, activityPct: 3 },
  ],
};

/** Ponte simulada: guarda o modo e responde com uma leitura do modo atual. */
function fakeBridge() {
  const bridge = {
    mode: 'full',
    modes: [],
    started: 0,
    stopped: false,
    start: vi.fn(() => bridge.started++),
    stop: vi.fn(() => (bridge.stopped = true)),
    setMode: vi.fn((mode) => {
      if (mode !== bridge.mode) bridge.modes.push(mode);
      bridge.mode = mode;
    }),
    getFreshData: () =>
      bridge.mode === 'counters'
        ? { success: true, hardware: false, diskIo: { readBytesSec: 1048576, writeBytesSec: 0 }, storage: { load: 7 } }
        : { success: true, hardware: true, cpu: { temp: 60 }, diskIo: { readBytesSec: 0, writeBytesSec: 0 } },
    latest: null,
  };
  return bridge;
}

/** Serviço simulado: disponível ou não, com ou sem dados recentes. */
function fakeService({ available = true } = {}) {
  return {
    available,
    data: null,
    start: vi.fn(),
    stop: vi.fn(),
    getFreshData() {
      return this.data;
    },
  };
}

describe('frameToBridgeData', () => {
  it('converte o quadro v2 para o formato que o coletor entende', () => {
    const data = frameToBridgeData(FRAME, true);
    expect(data).toMatchObject({
      success: true,
      source: 'service',
      isAdmin: true,
      cpu: { name: 'AMD Ryzen 5 9600X', temp: 61.5, load: 40, powerWatts: 70, requiresElevation: false },
      gpu: { temp: 58, hotspotTemp: 70, memoryTemp: 66, load: 85, vramUsedMB: 4096, vramTotalMB: 8192 },
      motherboard: { name: 'PRO B650M-P', temp: 38 },
      storage: { name: 'KINGSTON SNV3S500G', temp: 44 },
      fanRpm: 1100,
      realSensors: { cpu: true, gpu: true, motherboard: true, storage: true },
    });
  });

  it('soma a leitura e a gravação de todos os discos e usa a atividade do principal', () => {
    const data = frameToBridgeData(FRAME_WITH_DISK, true);
    expect(data.diskIo).toEqual({ readBytesSec: 3000000, writeBytesSec: 500000 });
    expect(data.storage.load).toBe(12.5);
  });

  it('sem os campos de disco (serviço sem administrador), não inventa I/O', () => {
    expect(frameToBridgeData(FRAME, false).diskIo).toBeNull();
  });

  it('sem administrador e sem leitura, pede elevação como a ponte fazia', () => {
    const data = frameToBridgeData({ ...FRAME, cpu: { ...FRAME.cpu, tempC: null } }, false);
    expect(data.cpu.requiresElevation).toBe(true);
    expect(data.realSensors.cpu).toBe(false);
  });
});

describe('HybridSensorSource', () => {
  it('com o serviço medindo o disco, a ponte fica desligada (menos um processo na memória)', () => {
    let now = 0;
    const service = fakeService();
    const bridge = fakeBridge();
    const hybrid = new HybridSensorSource({ service, bridge, now: () => now });

    hybrid.start();
    expect(bridge.mode).toBe('off'); // nunca abre o LibreHardwareMonitor enquanto espera o serviço
    expect(service.start).toHaveBeenCalled();

    service.data = frameToBridgeData(FRAME_WITH_DISK, true);
    const data = hybrid.getFreshData();
    expect(hybrid.source).toBe('service');
    expect(bridge.mode).toBe('off');
    expect(bridge.modes).toEqual([]);
    expect(data.diskIo).toEqual({ readBytesSec: 3000000, writeBytesSec: 500000 }); // I/O do serviço
    expect(data.storage).toMatchObject({ temp: 44, load: 12.5 });
  });

  it('com o serviço sem medir o disco (sem administrador), a ponte roda só os contadores de disco', () => {
    let now = 0;
    const service = fakeService();
    const bridge = fakeBridge();
    const hybrid = new HybridSensorSource({ service, bridge, now: () => now });
    hybrid.start();

    service.data = frameToBridgeData(FRAME, true);
    const data = hybrid.getFreshData();
    expect(hybrid.source).toBe('service');
    expect(bridge.mode).toBe('counters');
    expect(data.cpu.temp).toBe(61.5);
    expect(data.diskIo).toEqual({ readBytesSec: 1048576, writeBytesSec: 0 }); // I/O da ponte
    expect(data.storage).toMatchObject({ temp: 44, load: 7 });
  });

  it('se o serviço não sobe no tempo de tolerância, a ponte assume os sensores', () => {
    let now = 0;
    const bridge = fakeBridge();
    const hybrid = new HybridSensorSource({ service: fakeService(), bridge, now: () => now });
    hybrid.start();

    now = STARTUP_GRACE_MS - 1;
    hybrid.getFreshData();
    expect(bridge.mode).toBe('off');

    now = STARTUP_GRACE_MS;
    const data = hybrid.getFreshData();
    expect(bridge.mode).toBe('full');
    expect(hybrid.source).toBe('bridge');
    expect(data.cpu.temp).toBe(60);
  });

  it('sem executável do serviço, a ponte começa direto no modo completo', () => {
    const bridge = fakeBridge();
    bridge.mode = 'counters';
    const service = fakeService({ available: false });
    new HybridSensorSource({ service, bridge }).start();
    expect(bridge.mode).toBe('full');
    expect(service.start).not.toHaveBeenCalled();
  });

  it('quando o serviço cai, a ponte assume na hora; quando volta, só depois de estável', () => {
    let now = 0;
    const service = fakeService();
    const bridge = fakeBridge();
    const hybrid = new HybridSensorSource({ service, bridge, now: () => now });
    hybrid.start();
    service.data = frameToBridgeData(FRAME, true);
    hybrid.getFreshData();

    // Caiu (depois do tempo de tolerância da abertura)
    now = STARTUP_GRACE_MS + 1000;
    service.data = null;
    hybrid.getFreshData();
    expect(bridge.mode).toBe('full');

    // Voltou: espera HEALTHY_FOR_MS antes de largar os sensores, para não ficar trocando
    service.data = frameToBridgeData(FRAME, true);
    hybrid.getFreshData();
    expect(bridge.mode).toBe('full');
    now += HEALTHY_FOR_MS;
    expect(hybrid.getFreshData().cpu.temp).toBe(61.5);
    expect(bridge.mode).toBe('counters');
    expect(bridge.modes).toEqual(['counters', 'full', 'counters']);
  });

  it('stop() encerra o serviço e a ponte', () => {
    const service = fakeService();
    const bridge = fakeBridge();
    const hybrid = new HybridSensorSource({ service, bridge });
    hybrid.stop();
    expect(service.stop).toHaveBeenCalled();
    expect(bridge.stop).toHaveBeenCalled();
  });
});

describe('ServiceSensorSource', () => {
  afterEach(() => vi.useRealTimers());

  class FakeSocket extends EventEmitter {
    static instances = [];
    constructor(url) {
      super();
      this.url = url;
      this.close = vi.fn(() => this.emit('close'));
      FakeSocket.instances.push(this);
    }
  }

  it('lê hello e telemetria do serviço e expira a leitura parada', () => {
    let now = 0;
    FakeSocket.instances = [];
    const source = new ServiceSensorSource({
      getEndpoint: () => ({ url: 'ws://127.0.0.1:3891/ws', token: 'abc 123' }),
      WebSocketImpl: FakeSocket,
      now: () => now,
    });
    source.start();
    const socket = FakeSocket.instances[0];
    expect(socket.url).toBe('ws://127.0.0.1:3891/ws?token=abc%20123');

    socket.emit('message', Buffer.from(JSON.stringify({ type: 'hello', data: { isElevated: true } })));
    socket.emit('message', Buffer.from(JSON.stringify({ type: 'telemetry', data: FRAME })));
    socket.emit('message', Buffer.from('lixo'));
    expect(source.getFreshData()).toMatchObject({ isAdmin: true, cpu: { temp: 61.5 } });

    now += STALE_AFTER_MS;
    expect(source.getFreshData()).toBeNull();
    source.stop();
  });

  it('reconecta sozinho quando o serviço reinicia', () => {
    vi.useFakeTimers();
    FakeSocket.instances = [];
    const source = new ServiceSensorSource({
      getEndpoint: () => ({ url: 'ws://127.0.0.1:3891/ws', token: 't' }),
      WebSocketImpl: FakeSocket,
    });
    source.start();
    FakeSocket.instances[0].emit('close');
    vi.advanceTimersByTime(1000);
    expect(FakeSocket.instances).toHaveLength(2);

    source.stop();
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.instances).toHaveLength(2); // parado: não tenta mais
  });
});

describe('SensorBridge.setMode', () => {
  function fakeChild() {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.kill = vi.fn(() => child.emit('exit', 0));
    return child;
  }

  it('reinicia a ponte com --no-hardware e ignora linhas do processo antigo', () => {
    const exe = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pcs-bridge-')), 'pc-sensor-bridge.exe');
    fs.writeFileSync(exe, '');
    const children = [];
    const spawnFn = vi.fn(() => {
      const child = fakeChild();
      children.push(child);
      return child;
    });
    const bridge = new SensorBridge({ candidates: [exe], spawnFn });

    bridge.start();
    expect(spawnFn.mock.calls[0][1]).toEqual(['--stream']);
    children[0].stdout.emit('data', Buffer.from('{"success":true,"hardware":true}\n'));
    expect(bridge.getFreshData()).toMatchObject({ hardware: true });

    bridge.setMode('counters');
    expect(children[0].kill).toHaveBeenCalled();
    expect(spawnFn.mock.calls[1][1]).toEqual(['--stream', '--no-hardware']);
    expect(bridge.getFreshData()).toBeNull(); // leitura do modo antigo descartada

    // Linha atrasada do processo antigo não vira leitura
    children[0].stdout.emit('data', Buffer.from('{"success":true,"hardware":true}\n'));
    expect(bridge.getFreshData()).toBeNull();
    children[1].stdout.emit('data', Buffer.from('{"success":true,"hardware":false}\n'));
    expect(bridge.getFreshData()).toMatchObject({ hardware: false });
    bridge.stop();
  });

  it("no modo 'off' encerra o processo e não abre outro (nem depois de ele sair)", () => {
    vi.useFakeTimers();
    const exe = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pcs-bridge-')), 'pc-sensor-bridge.exe');
    fs.writeFileSync(exe, '');
    const children = [];
    const spawnFn = vi.fn(() => {
      const child = fakeChild();
      children.push(child);
      return child;
    });
    const bridge = new SensorBridge({ candidates: [exe], spawnFn, mode: 'counters' });
    bridge.start();
    expect(spawnFn).toHaveBeenCalledTimes(1);

    bridge.setMode('off');
    expect(children[0].kill).toHaveBeenCalled();
    vi.advanceTimersByTime(60_000);
    expect(spawnFn).toHaveBeenCalledTimes(1);
    expect(bridge.getFreshData()).toBeNull();

    bridge.setMode('full'); // o serviço caiu: a ponte volta
    expect(spawnFn).toHaveBeenCalledTimes(2);
    expect(spawnFn.mock.calls[1][1]).toEqual(['--stream']);
    bridge.stop();
    vi.useRealTimers();
  });
});
