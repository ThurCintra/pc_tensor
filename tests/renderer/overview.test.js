// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const transport = vi.hoisted(() => ({ openSensorDriverPage: vi.fn() }));
vi.mock('../../src/renderer/lib/transport', () => ({ getTransport: () => transport }));

import { Overview } from '../../src/renderer/pages/Overview';

const renderOverview = (temperatures) =>
  render(createElement(Overview, { metrics: metricsWith(temperatures), history: [] }));

const metricsWith = (temperatures) => ({
  temperatures: { cpuMain: null, gpu: null, ...temperatures },
  cpu: { loadPercent: 5, cores: [5, 5] },
  memory: { totalGB: 12, usedGB: 4.6, percentUsed: 39 },
  network: {},
  disks: [],
  processes: [],
});

describe('Overview', () => {
  afterEach(() => {
    cleanup();
    transport.openSensorDriverPage.mockClear();
  });

  it('explica que falta o driver PawnIO e abre a página dele', () => {
    renderOverview({ sensorDriverMissing: true, requiresElevation: false });

    expect(screen.getByText('Temperatura da CPU indisponível: falta o driver PawnIO.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Baixar o PawnIO' }));
    expect(transport.openSensorDriverPage).toHaveBeenCalledTimes(1);
  });

  it('sem administrador, mostra só o aviso de privilégio (o driver não carrega sem ele)', () => {
    renderOverview({ sensorDriverMissing: true, requiresElevation: true });

    expect(screen.getByText('Temperaturas indisponíveis.')).toBeTruthy();
    expect(screen.queryByText(/falta o driver PawnIO/)).toBeNull();
  });

  it('com o driver instalado, não mostra o aviso', () => {
    renderOverview({ cpuMain: 52, sensorDriverMissing: false });

    expect(screen.queryByText(/falta o driver PawnIO/)).toBeNull();
  });
});
