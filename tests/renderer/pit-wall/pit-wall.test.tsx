// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { thermalColor, thermalHsl } from '../../../src/renderer/pit-wall/thermal-color';
import { LAYOUTS, layoutFor } from '../../../src/renderer/pit-wall/layout';
import { ThermalCard, LagJudgeCard, MaintenanceCard } from '../../../src/renderer/pit-wall/cards';
import { XRayCard } from '../../../src/renderer/pit-wall/XRayCard';
import { EnergyCard } from '../../../src/renderer/pit-wall/EnergyCard';
import { StutterBusterCard } from '../../../src/renderer/pit-wall/StutterBusterCard';
import { PostMortem, crashTime } from '../../../src/renderer/pit-wall/PostMortem';
import { summarizeCrash, type CrashReport } from '../../../src/renderer/realtime/flight-recorder';
import type { SentinelStore } from '../../../src/renderer/realtime/sentinel-store';
import type { HelloData } from '../../../src/renderer/realtime/protocol';
import { makeFrame } from '../realtime/fixtures';

afterEach(cleanup);

const base = makeFrame();

describe('escala térmica', () => {
  it('vai do azul ao vermelho passando por ciano e laranja', () => {
    expect(thermalHsl(20).h).toBe(215);
    expect(thermalHsl(45).h).toBe(188);
    expect(thermalHsl(80).h).toBeCloseTo(28, 0); // entre laranja (38) e laranja-avermelhado (18)
    expect(thermalHsl(120).h).toBe(0);
    expect(thermalColor(null)).toBe('var(--track)');
    expect(thermalColor(95)).toBe('hsl(0 85% 50% / 1)');
  });
});

describe('Bento Grid camaleão', () => {
  it('cada perfil mostra todos os cards, com o principal primeiro', () => {
    for (const slots of Object.values(LAYOUTS)) {
      expect(new Set(slots.map((s) => s.id)).size).toBe(9);
    }
    expect(layoutFor('COMPETITIVE_FPS')[0]).toMatchObject({ id: 'lag', size: 'lg' });
    expect(layoutFor('AAA_GRAPHICS')[0]?.id).toBe('gpu');
    expect(layoutFor('DEV_WORKSTATION')[0]?.id).toBe('cpu');
    expect(layoutFor(null)[0]?.id).toBe('energy');
  });
});

describe('cards', () => {
  it('ThermalCard mostra a contagem regressiva até o throttling', () => {
    const frame = makeFrame({
      cpu: { ...base.cpu, tempC: 88, thermal: { slopeCPerS: 0.5, timeToThrottleS: 14, limitC: 95, throttling: false } },
    });
    render(<ThermalCard component="cpu" frame={frame} />);

    expect(screen.getByText('Chega a 95 °C em 14 s')).toBeTruthy();
    expect(screen.getByText('88')).toBeTruthy();
  });

  it('ThermalCard explica a temperatura do die de E/S sem administrador', () => {
    const frame = makeFrame({
      cpu: { ...base.cpu, tempSource: 'ioDie', thermal: { ...base.cpu.thermal, slopeCPerS: null } },
    });
    render(<ThermalCard component="cpu" frame={frame} />);

    expect(screen.getByText(/die de E\/S/)).toBeTruthy();
    expect(screen.getByText('Tendência só com o sensor dos núcleos')).toBeTruthy();
  });

  it('Juiz de Lag mostra o veredito e o motivo', () => {
    const frame = makeFrame({ lag: { verdict: 'CAUSE_NETWORK', reasons: ['Perda de pacotes de 4%'] } });
    render(<LagJudgeCard frame={frame} />);

    expect(screen.getByText('Culpa da rede')).toBeTruthy();
    expect(screen.getByText('Perda de pacotes de 4%')).toBeTruthy();
  });

  it('Saúde térmica avisa quando é hora de limpar', () => {
    const frame = makeFrame({
      maintenance: { warning: true, component: 'gpu', tempDeltaC: 6.2, fanDeltaPct: 3, baselineAgeDays: 21 },
    });
    render(<MaintenanceCard frame={frame} />);

    expect(screen.getByText('Hora de limpar o PC')).toBeTruthy();
    expect(screen.getByText(/A placa de vídeo está 6,2 °C mais quente que há 21 dias/)).toBeTruthy();
  });

  it('Raio-X colore as zonas pela temperatura e mostra detalhes ao tocar', () => {
    const frame = makeFrame({ gpu: { ...base.gpu, tempC: 95, hotspotC: 104 } });
    const { container } = render(<XRayCard frame={frame} />);

    const gpuStop = container.querySelector('#heat-gpu stop');
    expect(gpuStop?.getAttribute('stop-color')).toBe(thermalColor(95));
    expect(container.querySelector('#heat-ram stop')?.getAttribute('stop-color')).toBe('var(--track)');

    fireEvent.click(screen.getByRole('button', { name: 'GPU: 95 graus' }));
    expect(screen.getByText(/ponto mais quente 104 °C/)).toBeTruthy();
  });
});

function fakeStore(overrides: Partial<SentinelStore> = {}): SentinelStore {
  return {
    setEnergyConfig: vi.fn().mockResolvedValue({ tariffBrlPerKwh: 1.1, baseLoadW: 60 }),
    stutterBuster: vi.fn().mockResolvedValue({
      standbyPurged: true,
      standbyFreedMb: 2310,
      standbyError: null,
      deprioritized: ['chrome.exe', 'Spotify.exe'],
      restoreAfterS: 300,
    }),
    ...overrides,
  } as unknown as SentinelStore;
}

const hello = { capabilities: { stutterBuster: true, foregroundDetection: true, frametime: false } } as HelloData;

describe('Taxímetro', () => {
  it('mostra o custo em reais e salva a tarifa no formato brasileiro', async () => {
    const store = fakeStore();
    render(<EnergyCard frame={makeFrame()} store={store} />);

    expect(screen.getByText(/R\$\s0,10/)).toBeTruthy();
    fireEvent.click(screen.getByText('alterar'));
    fireEvent.change(screen.getByLabelText('Tarifa (R$/kWh)'), { target: { value: '1,10' } });
    fireEvent.click(screen.getByText('Salvar'));

    await waitFor(() => expect(store.setEnergyConfig).toHaveBeenCalledWith({ tariffBrlPerKwh: 1.1 }));
  });
});

describe('Stutter Buster', () => {
  it('executa o comando e mostra o que foi liberado', async () => {
    const store = fakeStore();
    render(<StutterBusterCard store={store} hello={hello} online />);

    fireEvent.click(screen.getByText('Acabar com os engasgos'));

    expect(await screen.findByText(/2\.310 MB de cache liberados/)).toBeTruthy();
    expect(screen.getByText(/chrome\.exe, Spotify\.exe/)).toBeTruthy();
  });

  it('fica desativado sem administrador ou sem conexão', () => {
    const noAdmin = { capabilities: { ...hello.capabilities, stutterBuster: false } } as HelloData;
    render(<StutterBusterCard store={fakeStore()} hello={noAdmin} online />);

    expect((screen.getByText('Acabar com os engasgos') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/como administrador/)).toBeTruthy();
  });
});

describe('Post-Mortem', () => {
  it('mostra data e hora da queda até o milissegundo', () => {
    const ms = new Date(2026, 9, 24, 13, 42, 7, 250).getTime();
    expect(crashTime(ms)).toMatch(/^24\/10\/2026,? 13:42:07[,.]250$/);
  });

  function crashState() {
    const frames = Array.from({ length: 20 }, (_, i) => ({
      t: 1_000_000 + i * 250,
      frame: makeFrame({ cpu: { ...base.cpu, tempC: 70 + i } }),
    }));
    const report: CrashReport = { id: 'crash-1', createdAt: 0, reason: 'stalled', lastFrameAt: 1_004_750, frames };
    return { report, summary: summarizeCrash(report) };
  }

  it('mostra o motivo, os picos e inspeciona cada instante', () => {
    const onClose = vi.fn();
    render(<PostMortem crash={crashState()} onClose={onClose} onDelete={vi.fn()} />);

    expect(screen.getByText(/O PC parou de responder/)).toBeTruthy();
    expect(screen.getByText('89 °C')).toBeTruthy(); // pico da CPU no último quadro

    fireEvent.change(screen.getByLabelText('Instante inspecionado'), { target: { value: '0' } });
    expect(screen.getByText('4,8 s antes')).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: 'Potência' }));
    expect(screen.getByRole('img', { name: 'Linha do tempo: Potência' })).toBeTruthy();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
