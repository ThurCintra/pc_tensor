import { describe, it, expect } from 'vitest';
import { fixed, formatBytes, formatMHz, formatUptime, text, maskMac, tempLevel, loadLevel, summarize, DASH } from '../../src/renderer/lib/format';

describe('format', () => {
  it('nunca inventa número para valor ausente', () => {
    expect(fixed(null)).toBe(DASH);
    expect(fixed(undefined, 1)).toBe(DASH);
    expect(fixed(NaN)).toBe(DASH);
    expect(fixed(42.345, 1)).toBe('42.3');
  });

  it('formata bytes, frequência e tempo ligado', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(16 * 1024 ** 3, 0)).toBe('16 GB');
    expect(formatBytes(null)).toBe(DASH);
    expect(formatMHz(3800)).toBe('3.80 GHz');
    expect(formatMHz(800)).toBe('800 MHz');
    expect(formatUptime(90061)).toBe('1 d 1 h');
    expect(formatUptime(3720)).toBe('1 h 2 min');
  });

  it('trata textos genéricos de fabricante como ausentes', () => {
    expect(text('Default string')).toBe(DASH);
    expect(text('  ')).toBe(DASH);
    expect(text('ASUS')).toBe('ASUS');
  });

  it('mascara o endereço MAC por padrão', () => {
    expect(maskMac('AA:BB:CC:DD:EE:FF')).toBe('AA:BB:CC:••:••:••');
    expect(maskMac(null)).toBe(DASH);
  });

  it('classifica temperatura relativa ao limite configurado', () => {
    expect(tempLevel(null, 85)).toBe('none');
    expect(tempLevel(60, 85)).toBe('normal');
    expect(tempLevel(72, 85)).toBe('caution');
    expect(tempLevel(85, 85)).toBe('critical');
    expect(tempLevel(80, 75)).toBe('critical');
    expect(loadLevel(95)).toBe('critical');
    expect(loadLevel(80)).toBe('caution');
  });

  it('resume séries ignorando lacunas sem leitura', () => {
    expect(summarize([50, null, 70, undefined, 60])).toEqual({ min: 50, max: 70, avg: 60 });
    expect(summarize([null, null])).toEqual({ min: null, max: null, avg: null });
  });
});
