import type { TelemetryFrame } from '../../../src/renderer/realtime/protocol';

/** Quadro de telemetria completo com valores típicos; `patch` sobrescreve blocos inteiros. */
export function makeFrame(patch: Partial<TelemetryFrame> = {}): TelemetryFrame {
  const thermal = { slopeCPerS: 0, timeToThrottleS: null, limitC: 95, throttling: false };
  return {
    cpu: {
      name: 'AMD Ryzen 5 9600X',
      tempC: 60,
      tempSource: 'sensor',
      loadPct: 40,
      maxCoreLoadPct: 70,
      powerW: 60,
      clockMhz: 5200,
      vcoreV: 1.2,
      thermal,
    },
    gpu: {
      name: 'AMD Radeon RX 7600',
      tempC: 55,
      hotspotC: 65,
      memoryTempC: 70,
      loadPct: 80,
      powerW: 120,
      clockMhz: 2600,
      vcoreV: 1.1,
      vramUsedMb: 5000,
      vramTotalMb: 8176,
      fanRpm: 1500,
      fanPct: 45,
      thermal: { ...thermal, limitC: 90 },
    },
    memory: { usedMb: 9000, totalMb: 16000, loadPct: 56 },
    board: { name: 'MSI PRO B650M-P', systemTempC: 35, vrmTempC: 50 },
    storage: [],
    fans: [],
    network: {
      adapter: 'Ethernet',
      gateway: '192.168.0.1',
      gatewayLatencyMs: 1,
      internetLatencyMs: 12,
      jitterMs: 1,
      lossPct: 0,
    },
    lag: { verdict: 'NORMAL', reasons: [] },
    context: { profile: 'COMPETITIVE_FPS', foregroundExe: 'cs2.exe', foregroundPid: 100 },
    energy: {
      systemPowerW: 240,
      baseLoadW: 60,
      tariffBrlPerKwh: 0.95,
      sessionKwh: 0.1,
      sessionCostBrl: 0.1,
      monthKwh: 10,
      monthCostBrl: 9.5,
    },
    maintenance: { warning: false, component: null, tempDeltaC: null, fanDeltaPct: null, baselineAgeDays: null },
    efficiency: { cpu: null, gpu: null },
    ...patch,
  };
}

/** WebSocket falso: o teste abre, envia mensagens e fecha a conexão no lugar do servidor. */
export class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.CONNECTING;
  sent: string[] = [];
  closedWith: number | undefined;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  static get last(): FakeWebSocket {
    const ws = FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
    if (!ws) throw new Error('Nenhum WebSocket criado.');
    return ws;
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(code?: number): void {
    this.closedWith = code;
    this.readyState = FakeWebSocket.CLOSED;
  }

  // Ações do "servidor"
  serverOpen(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  serverSend(type: string, data: unknown, v = 2): void {
    this.onmessage?.({ data: JSON.stringify({ v, type, seq: 1, ts: 0, data }) });
  }

  serverClose(code: number): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.({ code });
  }
}
