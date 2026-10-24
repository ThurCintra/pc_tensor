/**
 * Escala térmica do Raio-X: azul (frio) → ciano → verde → laranja → vermelho (crítico).
 * Interpola matiz e luminosidade em HSL entre pontos fixos; HSL dá transições suaves sem passar
 * pelo cinza que a interpolação direta em RGB produz entre azul e laranja.
 */
const STOPS: readonly { tempC: number; h: number; s: number; l: number }[] = [
  { tempC: 25, h: 215, s: 85, l: 55 }, // azul
  { tempC: 45, h: 188, s: 85, l: 48 }, // ciano
  { tempC: 60, h: 140, s: 60, l: 45 }, // verde
  { tempC: 75, h: 38, s: 95, l: 52 }, // laranja
  { tempC: 85, h: 18, s: 95, l: 52 }, // laranja-avermelhado
  { tempC: 95, h: 0, s: 85, l: 50 }, // vermelho
];

export interface Hsl {
  h: number;
  s: number;
  l: number;
}

export function thermalHsl(tempC: number): Hsl {
  const first = STOPS[0]!;
  const last = STOPS[STOPS.length - 1]!;
  if (tempC <= first.tempC) return { h: first.h, s: first.s, l: first.l };
  if (tempC >= last.tempC) return { h: last.h, s: last.s, l: last.l };

  for (let i = 1; i < STOPS.length; i++) {
    const a = STOPS[i - 1]!;
    const b = STOPS[i]!;
    if (tempC <= b.tempC) {
      const k = (tempC - a.tempC) / (b.tempC - a.tempC);
      return { h: a.h + (b.h - a.h) * k, s: a.s + (b.s - a.s) * k, l: a.l + (b.l - a.l) * k };
    }
  }
  return { h: last.h, s: last.s, l: last.l };
}

/** Cor CSS da temperatura; sem leitura, um cinza neutro do tema. */
export function thermalColor(tempC: number | null | undefined, alpha = 1): string {
  if (tempC === null || tempC === undefined || !Number.isFinite(tempC)) return 'var(--track)';
  const { h, s, l } = thermalHsl(tempC);
  return `hsl(${h.toFixed(0)} ${s.toFixed(0)}% ${l.toFixed(0)}% / ${alpha})`;
}
