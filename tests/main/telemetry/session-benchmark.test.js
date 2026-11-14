import { describe, it, expect, vi } from 'vitest';
const { RingBuffer, SessionBenchmark } = require('../../../src/main/telemetry/session-benchmark');

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

    // Jogo real: carga oscilando, com quedas curtas (menus, carregamentos), lida a cada 1,2 s
    const feedFor = (benchmark, start, ms, loadAt) => {
      let t = start;
      for (; t < start + ms; t += 1200) {
        benchmark.feedSample({
          timestamp: t,
          cpuLoad: 30,
          gpuLoad: loadAt(t),
          cpuTemp: 70,
          gpuTemp: 72,
          ramUsedGB: 10,
        });
      }
      return t;
    };

    it('começa a sessão em jogo com carga oscilando (quedas curtas não zeram a contagem)', () => {
      const benchmark = new SessionBenchmark();
      // 10 s de carga alta e 4 s de queda, repetidos: antes, cada queda zerava a contagem e nunca começava
      const end = feedFor(benchmark, 0, 75_000, (t) => (t % 14_000 < 10_000 ? 85 : 25));
      expect(benchmark.state).toBe('HIGH_LOAD');
      // o relatório conta desde o início da carga alta, não do momento em que a sessão foi confirmada
      expect(benchmark.activeSession.startTime).toBe(0);
      expect(benchmark.activeSession.samples.length).toBeGreaterThan(40);
      expect(end).toBeGreaterThan(60_000);
    });

    it('não começa com picos isolados de carga', () => {
      const benchmark = new SessionBenchmark();
      // pico de 1 leitura a cada 12 s: dentro da tolerância de queda, mas longe da maioria das leituras
      feedFor(benchmark, 0, 180_000, (t) => (t % 12_000 < 1200 ? 90 : 10));
      expect(benchmark.state).toBe('IDLE');
    });

    it('zera a contagem quando a carga cai de verdade', () => {
      const benchmark = new SessionBenchmark();
      let t = feedFor(benchmark, 0, 40_000, () => 85);
      expect(benchmark.feedSample({ timestamp: t, cpuLoad: 10, gpuLoad: 10 }).armingProgress).toBeGreaterThan(0.5);
      t = feedFor(benchmark, t, 20_000, () => 10); // 20 s em repouso: passou da tolerância
      expect(benchmark.highLoadStartTime).toBeNull();
      expect(benchmark.feedSample({ timestamp: t, cpuLoad: 10, gpuLoad: 10 }).armingProgress).toBe(0);
    });

    it('sem sensor de temperatura, o relatório traz vazio em vez de 0 °C', () => {
      const benchmark = new SessionBenchmark({ highLoadDurationMs: 0, cooldownDurationMs: 0 });
      const reports = [];
      benchmark.on('SESSION_REPORT_READY', (r) => reports.push(r));
      benchmark.feedSample({ timestamp: 1, cpuLoad: 90, gpuLoad: null, cpuTemp: null, gpuTemp: null });
      benchmark.feedSample({ timestamp: 2, cpuLoad: 5, gpuLoad: null });
      benchmark.feedSample({ timestamp: 3, cpuLoad: 5, gpuLoad: null });
      expect(reports[0].cpu.peakTemp).toBeNull();
      expect(reports[0].cpu.peakLoad).toBe(90);
    });
  });
});
