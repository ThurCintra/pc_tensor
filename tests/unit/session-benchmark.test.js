import { describe, it, expect, vi } from 'vitest';
const { RingBuffer, SessionBenchmark } = require('../../src/main/session-benchmark');

describe('SessionBenchmark & RingBuffer', () => {
  describe('RingBuffer', () => {
    it('deve armazenar itens respeitando a capacidade máxima circular', () => {
      const rb = new RingBuffer(3);
      rb.push({ cpuTemp: 40 });
      rb.push({ cpuTemp: 50 });
      rb.push({ cpuTemp: 60 });
      rb.push({ cpuTemp: 70 }); // Descarta o 40

      expect(rb.size).toBe(3);
      const arr = rb.toArray();
      expect(arr.length).toBe(3);
      expect(arr[0].cpuTemp).toBe(50);
      expect(arr[2].cpuTemp).toBe(70);
    });

    it('deve calcular estatísticas de min, max e avg corretamente', () => {
      const rb = new RingBuffer(5);
      rb.push({ timestamp: 1000, cpuTemp: 40, gpuTemp: 50, cpuLoad: 20, ramUsedGB: 8 });
      rb.push({ timestamp: 2000, cpuTemp: 60, gpuTemp: 70, cpuLoad: 80, ramUsedGB: 12 });

      const stats = rb.getStats();
      expect(stats.cpuTemp.min).toBe(40);
      expect(stats.cpuTemp.max).toBe(60);
      expect(stats.cpuTemp.avg).toBe(50);
      expect(stats.gpuTemp.avg).toBe(60);
      expect(stats.ramUsedGB.max).toBe(12);
    });
  });

  describe('SessionBenchmark State Machine', () => {
    it('deve transicionar de IDLE -> HIGH_LOAD -> COOLDOWN -> IDLE e emitir SESSION_REPORT_READY', () => {
      const benchmark = new SessionBenchmark({
        highLoadThreshold: 60,
        highLoadDurationMs: 100, // 100ms para teste ágil
        idleThreshold: 30,
        cooldownDurationMs: 50,
        throttleTempThreshold: 85,
      });

      const reportHandler = vi.fn();
      benchmark.on('SESSION_REPORT_READY', reportHandler);

      let t = 1000;

      // 1. Amostra em IDLE
      benchmark.feedSample({ timestamp: t, cpuLoad: 20, gpuLoad: 20, cpuTemp: 45, gpuTemp: 50, ramUsedGB: 8 });
      expect(benchmark.state).toBe('IDLE');

      // 2. Início de carga alta
      t += 50;
      benchmark.feedSample({ timestamp: t, cpuLoad: 75, gpuLoad: 80, cpuTemp: 70, gpuTemp: 75, ramUsedGB: 10 });
      expect(benchmark.state).toBe('IDLE'); // Ainda não deu o tempo de duração

      // 3. Completa o tempo de carga alta -> Transiciona para HIGH_LOAD
      t += 110;
      benchmark.feedSample({ timestamp: t, cpuLoad: 80, gpuLoad: 85, cpuTemp: 86, gpuTemp: 82, ramUsedGB: 12 });
      expect(benchmark.state).toBe('HIGH_LOAD');

      // 4. Carga cai para idle -> Transiciona para COOLDOWN
      t += 100;
      benchmark.feedSample({ timestamp: t, cpuLoad: 20, gpuLoad: 15, cpuTemp: 50, gpuTemp: 55, ramUsedGB: 9 });
      expect(benchmark.state).toBe('COOLDOWN');

      // 5. Permanece em repouso além do tempo de cooldown -> Finaliza e emite evento
      t += 60;
      benchmark.feedSample({ timestamp: t, cpuLoad: 18, gpuLoad: 15, cpuTemp: 45, gpuTemp: 50, ramUsedGB: 9 });
      expect(benchmark.state).toBe('IDLE');
      expect(reportHandler).toHaveBeenCalledTimes(1);

      const report = reportHandler.mock.calls[0][0];
      expect(report).toBeDefined();
      expect(report.cpu.peakTemp).toBe(86);
      expect(report.throttlingEventsCount).toBeGreaterThanOrEqual(1);
    });
  });
});
