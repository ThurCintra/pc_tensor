/**
 * formatters.js
 * Utilitários de formatação e degradação graciosa para especificações técnicas de hardware.
 */

export const EMPTY_PLACEHOLDER = ' — ';

/**
 * Formata bytes para visualização amigável (B, KB, MB, GB, TB)
 * Retorna EMPTY_PLACEHOLDER se o valor for nulo ou inválido.
 */
export function formatBytes(bytes, decimals = 1) {
  if (bytes === null || bytes === undefined || typeof bytes !== 'number' || isNaN(bytes) || bytes < 0) {
    return EMPTY_PLACEHOLDER;
  }

  if (bytes === 0) return '0 B';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));
  if (i < 0) return `${bytes} B`;
  const unitIndex = Math.min(i, sizes.length - 1);

  const formatted = (bytes / Math.pow(k, unitIndex)).toFixed(dm);
  return `${formatted} ${sizes[unitIndex]}`;
}

/**
 * Formata frequência em MHz conforme convenção do projeto
 */
export function formatMHz(mhz) {
  if (mhz === null || mhz === undefined || typeof mhz !== 'number' || isNaN(mhz) || mhz <= 0) {
    return EMPTY_PLACEHOLDER;
  }
  return `${Math.round(mhz)} MHz`;
}

/**
 * Formata tempo de atividade (Uptime) em dias, horas, minutos e segundos
 */
export function formatUptime(seconds) {
  if (seconds === null || seconds === undefined || typeof seconds !== 'number' || isNaN(seconds) || seconds < 0) {
    return EMPTY_PLACEHOLDER;
  }

  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (d === 0 && h === 0 && m === 0) {
    return `${s}s`;
  }

  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0 || (d > 0 && h > 0)) parts.push(`${m}m`);
  if (s > 0 && d === 0 && h === 0) parts.push(`${s}s`);

  return parts.join(' ');
}

/**
 * Garante que qualquer texto ou número indisponível exiba ' — '
 */
export function formatFallback(val, unit = '') {
  if (
    val === null || 
    val === undefined || 
    (typeof val === 'string' && val.trim() === '') || 
    val === 'Unknown' || 
    val === 'None' ||
    val === 'Default string'
  ) {
    return EMPTY_PLACEHOLDER;
  }
  return unit ? `${val} ${unit}` : String(val);
}
