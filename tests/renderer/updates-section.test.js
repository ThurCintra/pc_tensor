import { describe, it, expect } from 'vitest';
import { lastCheckedText } from '../../src/renderer/pages/UpdatesSection';

describe('lastCheckedText', () => {
  const now = new Date(2026, 9, 24, 18, 0).getTime();

  it('mostra há quanto tempo foi a última verificação', () => {
    expect(lastCheckedText(null, now)).toBe('Ainda não verificado nesta sessão');
    expect(lastCheckedText(now - 20_000, now)).toBe('Verificado agora há pouco');
    expect(lastCheckedText(now - 5 * 60_000, now)).toBe('Verificado há 5 min');
    expect(lastCheckedText(now - 3 * 3_600_000, now)).toBe('Verificado há 3 h');
    expect(lastCheckedText(new Date(2026, 9, 22, 13, 42).getTime(), now)).toBe('Verificado em 22/10 às 13:42');
  });
});
