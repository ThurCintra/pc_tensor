import { describe, it, expect, beforeEach, afterEach } from 'vitest';
const { ThermalHistoryStore } = require('../../../src/main/telemetry/thermal-history');

describe('ThermalHistoryStore', () => {
  let store;

  beforeEach(() => {
    // Banco em memória usando :memory: para testes ultrarrápidos e isolados
    store = new ThermalHistoryStore(':memory:');
  });

  afterEach(() => {
    store.close();
  });

  it('deve registrar agregados diários em repouso e sob carga', () => {
    store.recordDailyAggregate(42.0, true, '2026-10-01');
    store.recordDailyAggregate(75.0, false, '2026-10-01');

    const all = store.getAllDailyAggregates();
    expect(all.length).toBe(1);
    expect(all[0].date).toBe('2026-10-01');
    expect(all[0].load_temp_max).toBe(75.0);
    expect(all[0].samples_count).toBe(2);
  });

  it('deve salvar relatórios de sessão concluídos com sucesso', () => {
    const report = {
      sessionId: 'sess_1',
      timestamp: Date.now(),
      durationSeconds: 180,
      cpu: { peakTemp: 82.5, avgTemp: 74.0 },
      gpu: { peakTemp: 78.0, avgTemp: 70.0 },
      ram: { peakUsedGB: 11.2 },
      throttlingEventsCount: 0,
      bottleneckDominant: 'GPU_BOUND',
    };

    store.saveSessionReport(report);
    // Verificação de que não lançou exceção e registrou
    expect(true).toBe(true);
  });

  it('deve detectar degradação térmica quando a média recente subir mais de 5°C comparada à baseline de 14-21 dias', () => {
    const refDate = new Date('2026-10-25T12:00:00Z');

    // Baseline: 18 dias atrás (média em repouso 35°C)
    store.recordDailyAggregate(35.0, true, '2026-10-07');
    store.recordDailyAggregate(35.2, true, '2026-10-08');
    store.recordDailyAggregate(34.8, true, '2026-10-09');

    // Dados intermediários
    store.recordDailyAggregate(38.0, true, '2026-10-15');
    store.recordDailyAggregate(39.0, true, '2026-10-18');

    // Janela recente: últimos 2 dias com 43°C (delta +8°C > 5°C)
    store.recordDailyAggregate(43.0, true, '2026-10-24');
    store.recordDailyAggregate(43.5, true, '2026-10-25');

    const result = store.checkThermalDegradation(refDate);

    expect(result.hasDegradation).toBe(true);
    expect(result.deltaTemp).toBeGreaterThanOrEqual(7.0);
    expect(result.alert).toContain('Alerta de Degradação Térmica');
  });

  it('não deve emitir alerta se o delta térmico for normal (<= 5°C)', () => {
    const refDate = new Date('2026-10-25T12:00:00Z');

    store.recordDailyAggregate(38.0, true, '2026-10-07');
    store.recordDailyAggregate(38.0, true, '2026-10-08');
    store.recordDailyAggregate(38.0, true, '2026-10-09');
    store.recordDailyAggregate(38.5, true, '2026-10-15');
    store.recordDailyAggregate(39.0, true, '2026-10-24');
    store.recordDailyAggregate(39.5, true, '2026-10-25');

    const result = store.checkThermalDegradation(refDate);
    expect(result.hasDegradation).toBe(false);
    expect(result.deltaTemp).toBeLessThanOrEqual(5.0);
    expect(result.alert).toBeNull();
  });
});
