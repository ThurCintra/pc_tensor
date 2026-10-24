const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DEFAULT_BOOST_TARGETS } = require('../server/action-router');
const { DEFAULT_PORT } = require('../server/mobile-server');

const DEFAULT_SETTINGS = {
  mobilePort: DEFAULT_PORT,
  alerts: {
    enabled: true,
    cpuTempC: 85,
    gpuTempC: 85,
    cooldownMinutes: 5,
  },
  boostTargets: [...DEFAULT_BOOST_TARGETS],
};

const LIMITS = {
  tempC: { min: 50, max: 105 },
  cooldownMinutes: { min: 1, max: 120 },
  port: { min: 1024, max: 65530 },
};

function clampNumber(value, { min, max }, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/**
 * Normaliza a lista do Boost: só nomes simples de executável, sem curingas
 * nem caminhos, sem duplicatas (case-insensitive).
 */
function sanitizeBoostTargets(list, fallback) {
  if (!Array.isArray(list)) return fallback;
  const seen = new Set();
  const result = [];
  for (const raw of list) {
    let name = String(raw || '').trim();
    if (!name || !/^[\w .()+-]+$/.test(name)) continue;
    if (!name.toLowerCase().endsWith('.exe')) name = `${name}.exe`;
    if (seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    result.push(name);
  }
  return result.slice(0, 50);
}

/**
 * Valida um objeto de configurações (parcial ou completo) sobre uma base,
 * descartando campos desconhecidos e mantendo valores dentro dos limites.
 */
function sanitizeSettings(input = {}, base = DEFAULT_SETTINGS) {
  const alertsIn = input.alerts || {};
  return {
    mobilePort: clampNumber(input.mobilePort ?? base.mobilePort, LIMITS.port, base.mobilePort),
    alerts: {
      enabled: typeof alertsIn.enabled === 'boolean' ? alertsIn.enabled : base.alerts.enabled,
      cpuTempC: clampNumber(alertsIn.cpuTempC ?? base.alerts.cpuTempC, LIMITS.tempC, base.alerts.cpuTempC),
      gpuTempC: clampNumber(alertsIn.gpuTempC ?? base.alerts.gpuTempC, LIMITS.tempC, base.alerts.gpuTempC),
      cooldownMinutes: clampNumber(
        alertsIn.cooldownMinutes ?? base.alerts.cooldownMinutes,
        LIMITS.cooldownMinutes,
        base.alerts.cooldownMinutes,
      ),
    },
    boostTargets: sanitizeBoostTargets(input.boostTargets ?? base.boostTargets, base.boostTargets),
  };
}

/**
 * SettingsStore
 * Preferências do usuário e token de pareamento persistidos em JSON (userData).
 * O token sobrevive a reinícios para o celular não precisar reler o QR Code,
 * e pode ser revogado (rotateToken) para desconectar todos os dispositivos.
 */
class SettingsStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.settings = sanitizeSettings({});
    this.sessionToken = null;
    this.load();
  }

  load() {
    let raw = {};
    try {
      if (this.filePath && fs.existsSync(this.filePath)) {
        raw = JSON.parse(fs.readFileSync(this.filePath, 'utf-8')) || {};
      }
    } catch (err) {
      console.warn('[SettingsStore] Configurações inválidas, usando padrões:', err.message);
      raw = {};
    }
    this.settings = sanitizeSettings(raw);
    this.sessionToken =
      typeof raw.sessionToken === 'string' && raw.sessionToken.length >= 32 ? raw.sessionToken : crypto.randomUUID();
    this.save();
  }

  save() {
    if (!this.filePath) return;
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      const tmp = `${this.filePath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ ...this.settings, sessionToken: this.sessionToken }, null, 2), 'utf-8');
      fs.renameSync(tmp, this.filePath);
    } catch (err) {
      console.error('[SettingsStore] Erro ao salvar configurações:', err.message);
    }
  }

  get() {
    return JSON.parse(JSON.stringify(this.settings));
  }

  update(partial = {}) {
    const merged = {
      ...this.settings,
      ...partial,
      alerts: { ...this.settings.alerts, ...(partial.alerts || {}) },
    };
    this.settings = sanitizeSettings(merged, this.settings);
    this.save();
    return this.get();
  }

  rotateToken() {
    this.sessionToken = crypto.randomUUID();
    this.save();
    return this.sessionToken;
  }
}

module.exports = { SettingsStore, sanitizeSettings, DEFAULT_SETTINGS };
