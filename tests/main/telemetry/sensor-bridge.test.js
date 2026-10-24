import { describe, it, expect } from 'vitest';
const { SensorBridge, STALE_AFTER_MS } = require('../../../src/main/telemetry/sensor-bridge');

describe('SensorBridge', () => {
  it('guarda a última linha JSON válida enviada pela ponte', () => {
    let now = 1000;
    const bridge = new SensorBridge({ candidates: [], now: () => now });

    bridge.ingestLine('{"success":true,"cpu":{"temp":51.5}}\r');
    expect(bridge.getFreshData()).toEqual({ success: true, cpu: { temp: 51.5 } });

    // Linhas inválidas, incompletas ou sem sucesso não substituem a leitura anterior
    bridge.ingestLine('{"success":false}');
    bridge.ingestLine('{"success":true,');
    bridge.ingestLine('Aviso: driver sem permissão');
    expect(bridge.getFreshData().cpu.temp).toBe(51.5);

    now += STALE_AFTER_MS;
    expect(bridge.getFreshData()).toBeNull();
  });

  it('não tenta iniciar quando o executável não existe', () => {
    let spawned = false;
    const bridge = new SensorBridge({
      candidates: ['C:/nao-existe/pc-sensor-bridge.exe'],
      spawnFn: () => (spawned = true),
    });

    bridge.start();
    expect(spawned).toBe(false);
    expect(bridge.process).toBeNull();
  });
});
