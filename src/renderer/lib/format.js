/**
 * Formatação de valores da telemetria. Valor ausente (sem sensor) vira null ou '—',
 * nunca um número inventado.
 */

export const DASH = '—';

export function isNum(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

export function fixed(value, digits = 0) {
  return isNum(value) ? value.toFixed(digits) : DASH;
}

export function formatBytes(bytes, digits = 1) {
  if (!isNum(bytes) || bytes < 0) return DASH;
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : digits)} ${units[i]}`;
}

export function formatMHz(mhz) {
  if (!isNum(mhz) || mhz <= 0) return DASH;
  return mhz >= 1000 ? `${(mhz / 1000).toFixed(2)} GHz` : `${Math.round(mhz)} MHz`;
}

export function formatUptime(seconds) {
  if (!isNum(seconds) || seconds < 0) return DASH;
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d} d ${h} h`;
  if (h > 0) return `${h} h ${m} min`;
  return `${m} min`;
}

export function text(value) {
  if (value === null || value === undefined) return DASH;
  const str = String(value).trim();
  if (!str || ['unknown', 'none', 'default string', 'n/a'].includes(str.toLowerCase())) return DASH;
  return str;
}

export function maskMac(mac) {
  if (!mac || typeof mac !== 'string') return DASH;
  const parts = mac.split(/[:-]/);
  if (parts.length < 6) return mac;
  return `${parts.slice(0, 3).join(':')}:••:••:••`;
}

/**
 * Nível de temperatura relativo ao limite de alerta configurado.
 * 'critical' a partir do limite, 'caution' até 14 °C abaixo dele.
 */
export function tempLevel(temp, limit = 85) {
  if (!isNum(temp)) return 'none';
  if (temp >= limit) return 'critical';
  if (temp >= limit - 14) return 'caution';
  return 'normal';
}

export function loadLevel(percent) {
  if (!isNum(percent)) return 'normal';
  if (percent >= 90) return 'critical';
  if (percent >= 75) return 'caution';
  return 'normal';
}

export function clockTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function summarize(values) {
  const nums = values.filter(isNum);
  if (nums.length === 0) return { min: null, max: null, avg: null };
  const sum = nums.reduce((a, b) => a + b, 0);
  return { min: Math.min(...nums), max: Math.max(...nums), avg: sum / nums.length };
}
