import { describe, it, expect } from 'vitest';
const { ThermalAlertMonitor } = require('../../../src/main/telemetry/thermal-alerts');

function createMonitor(alerts = {}) {
  let now = 0;
  const notified = [];
  const settings = { alerts: { enabled: true, cpuTempC: 85, gpuTempC: 80, cooldownMinutes: 5, ...alerts } };
  const monitor = new ThermalAlertMonitor({
    getSettings: () => settings,
    notify: (alert) => notified.push(alert),
    now: () => now,
  });
  return {
    monitor,
    notified,
    settings,
    tick: (cpu, gpu, advanceMs = 1000) => {
      now += advanceMs;
      return monitor.evaluate({ temperatures: { cpuMain: cpu, gpu } });
    },
  };
}

describe('ThermalAlertMonitor', () => {
  it('deve notificar uma única vez enquanto a temperatura segue acima do limite', () => {
    const { tick, notified } = createMonitor();

    tick(70, 60);
    const first = tick(88, 60);
    tick(90, 60);
    tick(91, 60);

    expect(notified).toHaveLength(1);
    expect(notified[0]).toMatchObject({ sensor: 'cpu', temp: 88, limit: 85 });
    expect(first.fired).toHaveLength(1);
    expect(first.active).toHaveLength(1);
  });

  it('deve exigir resfriamento (histerese) e cooldown antes de notificar de novo', () => {
    const { tick, notified } = createMonitor({ cooldownMinutes: 5 });

    tick(88, 60);
    tick(82, 60); // abaixo do limite, mas dentro da histerese: não rearma
    tick(88, 60);
    expect(notified).toHaveLength(1);

    tick(79, 60); // rearmado (≤ 80)
    tick(88, 60); // ainda dentro do cooldown de 5 min
    expect(notified).toHaveLength(1);

    tick(79, 60, 6 * 60 * 1000);
    tick(88, 60);
    expect(notified).toHaveLength(2);
  });

  it('deve avaliar CPU e GPU de forma independente com limites próprios', () => {
    const { tick, notified } = createMonitor();
    const result = tick(70, 81);

    expect(notified.map((a) => a.sensor)).toEqual(['gpu']);
    expect(result.thresholds).toEqual({ cpuTempC: 85, gpuTempC: 80 });
  });

  it('deve reportar alertas ativos mas não notificar quando desativado', () => {
    const { tick, notified } = createMonitor({ enabled: false });
    const result = tick(95, 95);

    expect(notified).toHaveLength(0);
    expect(result.enabled).toBe(false);
    expect(result.active).toHaveLength(2);
  });

  it('deve ignorar sensores sem leitura', () => {
    const { tick, notified } = createMonitor();
    const result = tick(null, undefined);
    expect(result.active).toEqual([]);
    expect(notified).toHaveLength(0);
  });
});
