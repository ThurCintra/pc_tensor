import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, it, expect } from 'vitest';
import { FlightRecorder, summarizeCrash } from '../../../src/renderer/realtime/flight-recorder';
import { HapticService } from '../../../src/renderer/realtime/haptics';
import { makeFrame } from './fixtures';

function createRecorder(options: { maxReports?: number } = {}) {
  let now = 1_000_000;
  const factory = new IDBFactory();
  const recorder = new FlightRecorder({ indexedDB: factory, now: () => now, ...options });
  return { recorder, factory, advance: (ms: number) => (now += ms), at: () => now };
}

/** Grava `seconds` de telemetria a 4 Hz com a temperatura da CPU subindo 1 °C por quadro. */
function recordSeconds(rec: ReturnType<typeof createRecorder>, seconds: number, startTemp = 60) {
  for (let i = 0; i < seconds * 4; i++) {
    rec.advance(250);
    rec.recorder.record(makeFrame({ cpu: { ...makeFrame().cpu, tempC: startTemp + i } }), rec.at());
  }
}

describe('FlightRecorder', () => {
  it('mantém só os últimos 60 segundos', () => {
    const rec = createRecorder();
    recordSeconds(rec, 90);

    const frames = rec.recorder.frames;
    expect(frames).toHaveLength(241); // 60 s a 4 Hz, incluindo as duas pontas
    expect(frames[frames.length - 1]!.t - frames[0]!.t).toBe(60_000);
  });

  it('congela a janela num relatório salvo e recomeça a gravação', async () => {
    const rec = createRecorder();
    recordSeconds(rec, 10);
    const lastFrameAt = rec.at();

    const report = await rec.recorder.freeze('stalled', lastFrameAt);

    expect(report?.frames).toHaveLength(40);
    expect(report?.lastFrameAt).toBe(lastFrameAt);
    expect(rec.recorder.frames).toHaveLength(0);

    const list = await rec.recorder.listReports();
    expect(list).toEqual([expect.objectContaining({ id: report!.id, reason: 'stalled' })]);
    expect(list[0]).not.toHaveProperty('frames');
    expect((await rec.recorder.getReport(report!.id))?.frames).toHaveLength(40);

    await rec.recorder.deleteReport(report!.id);
    expect(await rec.recorder.listReports()).toEqual([]);
  });

  it('não cria relatório sem quadros e guarda no máximo N relatórios', async () => {
    const rec = createRecorder({ maxReports: 2 });
    expect(await rec.recorder.freeze('closed')).toBeNull();

    for (let i = 0; i < 3; i++) {
      recordSeconds(rec, 1);
      await rec.recorder.freeze('closed', rec.at());
    }
    const list = await rec.recorder.listReports();
    expect(list).toHaveLength(2);
    expect(list[0]!.lastFrameAt).toBeGreaterThan(list[1]!.lastFrameAt); // mais recente primeiro
  });

  it('recupera a gravação persistida depois que a página foi fechada', async () => {
    const first = createRecorder();
    recordSeconds(first, 5);
    await first.recorder.flush();

    // Outra instância (página reaberta) usando o mesmo banco
    const reopened = new FlightRecorder({ indexedDB: first.factory, now: () => first.at() + 30_000 });
    const report = await reopened.recoverInterrupted();

    expect(report?.reason).toBe('recovered');
    expect(report?.frames.length).toBeGreaterThan(0);
    expect(await reopened.recoverInterrupted()).toBeNull(); // a gravação ao vivo foi consumida
  });

  it('descarta a gravação num encerramento normal', async () => {
    const rec = createRecorder();
    recordSeconds(rec, 3);
    await rec.recorder.flush();
    await rec.recorder.discard();

    expect(rec.recorder.frames).toHaveLength(0);
    const reopened = new FlightRecorder({ indexedDB: rec.factory, now: () => rec.at() });
    expect(await reopened.recoverInterrupted()).toBeNull();
  });
});

describe('summarizeCrash', () => {
  it('encontra os picos e quanto antes da queda aconteceram', () => {
    const base = makeFrame();
    const frames = [
      { t: 1000, frame: makeFrame({ gpu: { ...base.gpu, vramUsedMb: 8100 }, cpu: { ...base.cpu, tempC: 70 } }) },
      { t: 2000, frame: makeFrame({ cpu: { ...base.cpu, tempC: 94, vcoreV: 1.35 } }) },
      { t: 3000, frame: makeFrame({ cpu: { ...base.cpu, tempC: 90, vcoreV: null } }) },
    ];

    const summary = summarizeCrash({ frames, lastFrameAt: 3000 });

    expect(summary.durationMs).toBe(2000);
    expect(summary.frameCount).toBe(3);
    expect(summary.peaks.cpuTempC).toEqual({ value: 94, msBeforeCrash: 1000 });
    expect(summary.peaks.vramUsedMb).toEqual({ value: 8100, msBeforeCrash: 2000 });
    expect(summary.peaks.cpuVcoreV).toEqual({ value: 1.35, msBeforeCrash: 1000 });
    expect(summary.lastFrame?.cpu.tempC).toBe(90);
  });
});

describe('HapticService', () => {
  function createHaptics(enabled = 'on') {
    let now = 0;
    const vibrate = (_pattern: number[]) => true;
    const calls: number[][] = [];
    const store = new Map([['pc-sentinel-haptics', enabled]]);
    const haptics = new HapticService({
      vibrate: (pattern) => {
        calls.push(pattern);
        return vibrate(pattern);
      },
      storage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v) },
      now: () => now,
    });
    return { haptics, calls, store, advance: (ms: number) => (now += ms) };
  }

  it('usa um padrão por tipo de alerta durante o jogo', () => {
    const { haptics, calls } = createHaptics();
    haptics.notify({ kind: 'NETWORK_SPIKE', severity: 'warning' }, 'COMPETITIVE_FPS');
    haptics.notify({ kind: 'PREDICTIVE_THROTTLE', severity: 'warning' }, 'AAA_GRAPHICS');
    haptics.notify({ kind: 'THROTTLING', severity: 'critical' }, 'AAA_GRAPHICS');

    expect(calls).toEqual([
      [100, 50, 100],
      [300, 100, 300, 100, 300],
      [800, 200, 800],
    ]);
  });

  it('fora do jogo só vibra no crítico; manutenção nunca vibra', () => {
    const { haptics, calls } = createHaptics();
    expect(haptics.notify({ kind: 'NETWORK_SPIKE', severity: 'warning' }, 'DEV_WORKSTATION')).toBeNull();
    expect(haptics.notify({ kind: 'MAINTENANCE', severity: 'info' }, 'COMPETITIVE_FPS')).toBeNull();
    expect(haptics.notify({ kind: 'THROTTLING', severity: 'critical' }, 'IDLE')).toEqual([800, 200, 800]);
    expect(calls).toHaveLength(1);
  });

  it('respeita o intervalo entre vibrações e a preferência do usuário', () => {
    const { haptics, calls, store, advance } = createHaptics();
    const alert = { kind: 'NETWORK_SPIKE', severity: 'warning' } as const;

    haptics.notify(alert, 'COMPETITIVE_FPS');
    advance(4000);
    haptics.notify(alert, 'COMPETITIVE_FPS');
    advance(1000);
    haptics.notify(alert, 'COMPETITIVE_FPS');
    expect(calls).toHaveLength(2);

    haptics.setEnabled(false);
    advance(10_000);
    expect(haptics.notify(alert, 'COMPETITIVE_FPS')).toBeNull();
    expect(store.get('pc-sentinel-haptics')).toBe('off');
    expect(createHaptics('off').haptics.enabled).toBe(false);
  });

  it('sem API de vibração (iPhone) não faz nada', () => {
    const haptics = new HapticService({ vibrate: null, storage: null });
    expect(haptics.supported).toBe(false);
    expect(haptics.notify({ kind: 'THROTTLING', severity: 'critical' }, 'AAA_GRAPHICS')).toBeNull();
  });
});
