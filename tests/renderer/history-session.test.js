import { describe, it, expect } from 'vitest';
import { sessionStatusText } from '../../src/renderer/pages/History.jsx';

describe('estado da sessão de carga no Histórico', () => {
  it('em repouso não mostra nada', () => {
    expect(sessionStatusText({ state: 'IDLE', armingProgress: 0 })).toBeNull();
  });

  it('mostra que detectou carga alta antes de a sessão começar', () => {
    expect(sessionStatusText({ state: 'IDLE', armingProgress: 0.42 })).toContain('42%');
  });

  it('mostra a sessão em andamento e o resfriamento', () => {
    const start = new Date('2026-11-14T20:05:00').getTime();
    expect(sessionStatusText({ state: 'HIGH_LOAD', sessionStartTime: start })).toBe('Sessão em andamento desde 20:05.');
    expect(sessionStatusText({ state: 'COOLDOWN', sessionStartTime: start })).toContain('encerra em 1 min');
  });
});
