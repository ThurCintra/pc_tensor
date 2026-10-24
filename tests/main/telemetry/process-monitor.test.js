import { describe, it, expect, vi } from 'vitest';
const { ProcessMonitor } = require('../../../src/main/telemetry/process-monitor');

describe('ProcessMonitor', () => {
  it('deve extrair e ordenar Top 5 processos com cálculo ponderado', async () => {
    const mockSi = {
      processes: vi.fn().mockResolvedValue({
        list: [
          { pid: 101, name: 'chrome.exe', cpu: 12.5, memRss: 1024 * 1024, user: 'Arthur' },
          { pid: 102, name: 'game.exe', cpu: 65.0, memRss: 4096 * 1024, user: 'Arthur' },
          { pid: 103, name: 'code.exe', cpu: 5.2, memRss: 512 * 1024, user: 'Arthur' },
          { pid: 104, name: 'discord.exe', cpu: 3.1, memRss: 300 * 1024, user: 'Arthur' },
          { pid: 105, name: 'spotify.exe', cpu: 1.0, memRss: 200 * 1024, user: 'Arthur' },
          { pid: 106, name: 'idle.exe', cpu: 0.1, memRss: 50 * 1024, user: 'SYSTEM' },
        ],
      }),
      mem: vi.fn().mockResolvedValue({
        swaptotal: 8 * 1024 * 1024 * 1024,
        swapused: 2 * 1024 * 1024 * 1024,
      }),
    };

    const monitor = new ProcessMonitor(mockSi);
    const top = await monitor.getTopProcesses(true);

    expect(top.length).toBe(5);
    expect(top[0].name).toBe('game');
    expect(top[0].cpuPercent).toBe(65.0);
    expect(top[0].memoryMB).toBe(4096);
  });

  it('deve coletar métricas de Swap corretamente', async () => {
    const mockSi = {
      mem: vi.fn().mockResolvedValue({
        swaptotal: 16 * 1024 * 1024 * 1024,
        swapused: 8 * 1024 * 1024 * 1024,
      }),
    };

    const monitor = new ProcessMonitor(mockSi);
    const swap = await monitor.getSwapMetrics();

    expect(swap.totalMB).toBe(16384);
    expect(swap.usedMB).toBe(8192);
    expect(swap.percentUsed).toBe(50);
  });

  describe('detectBottleneck', () => {
    it('deve identificar RAM_SWAP_RISK quando a RAM física ou swap estiverem saturadas', () => {
      const res = ProcessMonitor.detectBottleneck({ ramPercent: 92, swapPercent: 80, cpuLoad: 40, gpuLoad: 40 });
      expect(res.state).toBe('RAM_SWAP_RISK');
      expect(res.severity).toBe('critical');
    });

    it('deve identificar VRAM_PRESSURE quando a VRAM da GPU estiver acima de 90%', () => {
      const res = ProcessMonitor.detectBottleneck({
        ramPercent: 60,
        swapPercent: 20,
        vramPercent: 95,
        cpuLoad: 50,
        gpuLoad: 80,
      });
      expect(res.state).toBe('VRAM_PRESSURE');
      expect(res.severity).toBe('warning');
    });

    it('deve identificar CPU_BOUND quando a CPU estiver em >85% e a GPU subutilizada', () => {
      const res = ProcessMonitor.detectBottleneck({ cpuLoad: 92, gpuLoad: 45, ramPercent: 50 });
      expect(res.state).toBe('CPU_BOUND');
      expect(res.severity).toBe('warning');
    });

    it('deve identificar GPU_BOUND quando a GPU estiver em >90% e a CPU folgada', () => {
      const res = ProcessMonitor.detectBottleneck({ cpuLoad: 40, gpuLoad: 98, ramPercent: 60 });
      expect(res.state).toBe('GPU_BOUND');
      expect(res.severity).toBe('optimal');
    });

    it('deve identificar BALANCED quando os componentes operarem harmoniosamente', () => {
      const res = ProcessMonitor.detectBottleneck({ cpuLoad: 50, gpuLoad: 65, ramPercent: 55, swapPercent: 10 });
      expect(res.state).toBe('BALANCED');
      expect(res.severity).toBe('stable');
    });
  });
});
