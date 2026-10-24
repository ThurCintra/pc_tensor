export const DASH = '—';

export function num(value: number | null | undefined, digits = 0): string {
  return value === null || value === undefined || !Number.isFinite(value)
    ? DASH
    : value.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function brl(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value) ? DASH : BRL.format(value);
}

/** "-12,3 s" a partir de milissegundos antes da queda. */
export function beforeCrash(ms: number): string {
  return ms <= 0
    ? 'no instante da queda'
    : `${(ms / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} s antes`;
}
