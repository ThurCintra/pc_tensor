import { describe, it, expect, beforeEach, afterEach } from 'vitest';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { SettingsStore, sanitizeSettings, DEFAULT_SETTINGS } = require('../../src/main/settings-store');

describe('SettingsStore', () => {
  let dir;
  let file;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-settings-'));
    file = path.join(dir, 'settings.json');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('deve criar o arquivo com padrões e um token de sessão na primeira execução', () => {
    const store = new SettingsStore(file);

    expect(store.get()).toEqual(DEFAULT_SETTINGS);
    expect(store.sessionToken).toMatch(/^[0-9a-f-]{36}$/);
    const saved = JSON.parse(fs.readFileSync(file, 'utf-8'));
    expect(saved.sessionToken).toBe(store.sessionToken);
  });

  it('deve manter o token entre reinicializações e trocá-lo ao revogar', () => {
    const first = new SettingsStore(file);
    const second = new SettingsStore(file);
    expect(second.sessionToken).toBe(first.sessionToken);

    const rotated = second.rotateToken();
    expect(rotated).not.toBe(first.sessionToken);
    expect(new SettingsStore(file).sessionToken).toBe(rotated);
  });

  it('deve persistir atualizações parciais sem perder os demais campos', () => {
    const store = new SettingsStore(file);
    store.update({ alerts: { cpuTempC: 90 } });

    const reloaded = new SettingsStore(file).get();
    expect(reloaded.alerts.cpuTempC).toBe(90);
    expect(reloaded.alerts.gpuTempC).toBe(DEFAULT_SETTINGS.alerts.gpuTempC);
    expect(reloaded.alerts.enabled).toBe(true);
  });

  it('deve recuperar de um arquivo corrompido usando os padrões', () => {
    fs.writeFileSync(file, '{ isto não é json', 'utf-8');
    const store = new SettingsStore(file);
    expect(store.get()).toEqual(DEFAULT_SETTINGS);
    expect(store.sessionToken).toBeTruthy();
  });
});

describe('sanitizeSettings', () => {
  it('deve limitar temperaturas, cooldown e porta às faixas válidas', () => {
    const result = sanitizeSettings({
      mobilePort: 80,
      alerts: { cpuTempC: 300, gpuTempC: 10, cooldownMinutes: 0, enabled: 'sim' },
    });
    expect(result.mobilePort).toBe(1024);
    expect(result.alerts.cpuTempC).toBe(105);
    expect(result.alerts.gpuTempC).toBe(50);
    expect(result.alerts.cooldownMinutes).toBe(1);
    expect(result.alerts.enabled).toBe(true);
  });

  it('deve manter o valor anterior quando o número for inválido', () => {
    const result = sanitizeSettings({ alerts: { cpuTempC: 'quente' } });
    expect(result.alerts.cpuTempC).toBe(DEFAULT_SETTINGS.alerts.cpuTempC);
  });

  it('deve limpar a lista do Boost de curingas, caminhos e duplicatas', () => {
    const result = sanitizeSettings({
      boostTargets: ['Discord', 'discord.exe', '*', 'C:\\Windows\\evil.exe', 'malware*.exe', ' Steam.exe ', ''],
    });
    expect(result.boostTargets).toEqual(['Discord.exe', 'Steam.exe']);
  });

  it('deve descartar campos desconhecidos', () => {
    const result = sanitizeSettings({ sessionToken: 'x', foo: 'bar' });
    expect(result).not.toHaveProperty('foo');
    expect(result).not.toHaveProperty('sessionToken');
  });
});
