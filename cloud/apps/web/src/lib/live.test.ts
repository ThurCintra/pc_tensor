import { describe, expect, it } from 'vitest';
import { LAYOUTS } from '../components/pit-wall/layout';
import { liveMonthWh, monthFraction, projectMonth } from './energy';
import { FlightRecorder, droppedUnderLoad, summarizeCrash } from './flight-recorder';
import { HAPTIC_COOLDOWN_MS, HapticService, hapticForAlert, hapticsForFrame } from './haptics';
import { normalizeFrame, type TelemetryFrame } from './telemetry';

function frame(patch: {
  profile?: TelemetryFrame['profile'];
  cpuTemp?: number | null;
  gpuTemp?: number | null;
  cpuLoad?: number | null;
  gpuLoad?: number | null;
  lossPct?: number | null;
  throttleS?: number | null;
  powerW?: number;
}): TelemetryFrame {
  const f = normalizeFrame({
    ts: 1,
    profile: patch.profile ?? 'IDLE',
    cpu: { tempC: patch.cpuTemp ?? 50, loadPct: patch.cpuLoad ?? 10, powerW: 40 },
    gpu: { tempC: patch.gpuTemp ?? 50, loadPct: patch.gpuLoad ?? 10, powerW: 60 },
  });
  f.network.lossPct = patch.lossPct ?? null;
  f.cpu.thermal = { ...f.cpu.thermal, timeToThrottleS: patch.throttleS ?? null };
  if (patch.powerW !== undefined) f.energy.systemPowerW = patch.powerW;
  return f;
}

describe('quadro ao vivo', () => {
  it('completa campos ausentes de um agente antigo sem quebrar', () => {
    const f = normalizeFrame({ ts: 5, profile: 'AAA_GAMING', cpu: { tempC: 70, loadPct: 30, powerW: 50 }, gpu: {} });
    expect(f.profile).toBe('AAA_GAMING');
    expect(f.gpu.tempC).toBeNull();
    expect(f.storage).toEqual([]);
    expect(f.lag.verdict).toBe('NORMAL');
    expect(f.energy.systemPowerW).toBe(50); // sem energia no quadro: soma CPU + GPU
  });

  it('todo perfil tem os 9 cards, sem repetir', () => {
    for (const slots of Object.values(LAYOUTS)) {
      expect(new Set(slots.map((s) => s.id)).size).toBe(9);
    }
  });
});

describe('caixa preta', () => {
  it('guarda só os últimos 60 s e aponta o pico antes da queda', async () => {
    const recorder = new FlightRecorder({ indexedDB: null });
    const start = 1_000_000;
    for (let i = 0; i <= 80; i++) {
      // 81 s de quadros, um por segundo; o pico de GPU acontece 5 s antes do último
      recorder.record(frame({ gpuTemp: i === 75 ? 99 : 60 }), start + i * 1000);
    }
    expect(recorder.frames).toHaveLength(61);

    const report = await recorder.freeze('suspected');
    expect(report?.reason).toBe('suspected');
    expect(recorder.frames).toHaveLength(0);
    const summary = summarizeCrash(report!);
    expect(summary.peaks.gpuTempC).toEqual({ value: 99, msBeforeCrash: 5000 });
    expect(summary.durationMs).toBe(60_000);
  });

  it('queda merece Post-Mortem só em jogo ou sob carga', () => {
    expect(droppedUnderLoad(frame({ profile: 'COMPETITIVE_FPS' }))).toBe(true);
    expect(droppedUnderLoad(frame({ gpuLoad: 85 }))).toBe(true);
    expect(droppedUnderLoad(frame({ cpuLoad: 12, gpuLoad: 3 }))).toBe(false);
  });

  it('sem quadros não há relatório', async () => {
    expect(await new FlightRecorder({ indexedDB: null }).freeze('crash')).toBeNull();
  });
});

describe('vibração', () => {
  const limits = { cpuC: 90, gpuC: 85 };

  it('temperatura acima do limite do site, aviso preditivo e perda de pacotes', () => {
    expect(hapticsForFrame(frame({ gpuTemp: 86 }), limits)).toEqual(['CRITICAL_TEMP']);
    expect(hapticsForFrame(frame({ throttleS: 20 }), limits)).toEqual(['PREDICTIVE_THROTTLE']);
    // Já passou do limite: o preditivo não vibra junto
    expect(hapticsForFrame(frame({ cpuTemp: 95, throttleS: 5 }), limits)).toEqual(['CRITICAL_TEMP']);
    expect(hapticsForFrame(frame({ lossPct: 3 }), limits)).toEqual(['PACKET_LOSS']);
    expect(hapticsForFrame(frame({}), limits)).toEqual([]);
    expect(hapticForAlert('ABRUPT_CRASH')).toBe('CRASH');
    expect(hapticForAlert('DUST_WARNING')).toBeNull();
  });

  it('respeita perfil, intervalo e a preferência do usuário', () => {
    const calls: number[][] = [];
    let now = 0;
    const haptics = new HapticService({ vibrate: (p) => (calls.push(p), true), storage: null, now: () => now });

    expect(haptics.notify('PACKET_LOSS', 'IDLE')).toBeNull(); // fora de jogo, perda de pacote não vibra
    expect(haptics.notify('PACKET_LOSS', 'COMPETITIVE_FPS')).toEqual([100, 50, 100]);
    expect(haptics.notify('PACKET_LOSS', 'COMPETITIVE_FPS')).toBeNull(); // dentro do intervalo
    expect(haptics.notify('CRITICAL_TEMP', 'IDLE')).not.toBeNull(); // crítico vibra em qualquer perfil
    now += HAPTIC_COOLDOWN_MS;
    expect(haptics.notify('PACKET_LOSS', 'AAA_GAMING')).not.toBeNull();

    haptics.setEnabled(false);
    now += HAPTIC_COOLDOWN_MS;
    expect(haptics.notify('CRASH', 'IDLE')).toBeNull();
    expect(calls).toHaveLength(3);
  });
});

describe('taxímetro', () => {
  it('o mês anda junto com a sessão até a próxima busca', () => {
    const month = { wh: 10_000, sessionWhAtFetch: 500, since: 0 };
    expect(liveMonthWh(month, 0.8)).toBe(10_300); // +300 Wh desde a busca
    expect(liveMonthWh(month, 0.1)).toBe(10_000); // sessão zerou: só o banco
    expect(liveMonthWh({ ...month, sessionWhAtFetch: null }, 2)).toBe(10_000);
  });

  it('projeta o mês só depois de um dia', () => {
    const since = new Date(2026, 9, 1).getTime(); // 1º de outubro (31 dias)
    const halfway = since + 15.5 * 86_400_000;
    expect(monthFraction(since, halfway)).toBeCloseTo(0.5, 5);
    expect(projectMonth(50, 0.5)).toBe(100);
    expect(projectMonth(5, 0.01)).toBeNull();
    expect(projectMonth(null, 0.5)).toBeNull();
  });
});
