import { describe, it, expect, vi } from 'vitest';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { AutoLaunch, TASK_NAME, buildTaskXml } = require('../../src/main/auto-launch');

function setup({ isPackaged = true, openAtLogin = false, taskExists = false, createOk = true } = {}) {
  const loginItem = { openAtLogin };
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pcs-auto-'));
  const app = {
    isPackaged,
    getPath: () => userData,
    getLoginItemSettings: () => ({ ...loginItem }),
    setLoginItemSettings: vi.fn((settings) => (loginItem.openAtLogin = settings.openAtLogin)),
  };
  const written = [];
  const run = vi.fn(async (args) => {
    if (args[0] === '/Query') return { ok: taskExists };
    if (args[0] === '/Create') {
      written.push(fs.readFileSync(args[args.indexOf('/XML') + 1]));
      return { ok: createOk };
    }
    return { ok: true };
  });
  const autoLaunch = new AutoLaunch({
    app,
    execPath: 'C:\\Program Files\\PC Sentinel\\PC Sentinel.exe',
    run,
    userId: () => 'PC\\Arthur',
    tempDir: userData,
    log: { warn: vi.fn(), error: vi.fn() },
  });
  return { autoLaunch, app, run, loginItem, written, userData };
}

const calls = (run, verb) => run.mock.calls.filter(([args]) => args[0] === verb);

describe('início com o Windows', () => {
  it('com administrador, cria a tarefa elevada (sem UAC no boot) e desliga a entrada comum', async () => {
    const { autoLaunch, run, loginItem, written } = setup();
    await autoLaunch.init({ isElevated: true });
    await autoLaunch.set(true);

    expect(calls(run, '/Create')[0][0]).toEqual(expect.arrayContaining(['/TN', TASK_NAME, '/F']));
    expect(loginItem.openAtLogin).toBe(false);
    expect(autoLaunch.getState()).toEqual({ supported: true, enabled: true });
    // UTF-16 com BOM, o único formato que o schtasks aceita
    expect([...written[0].subarray(0, 2)]).toEqual([0xff, 0xfe]);
    expect(written[0].subarray(2).toString('utf16le')).toContain('<RunLevel>HighestAvailable</RunLevel>');
  });

  it('migra quem já tinha a entrada antiga, que pedia o UAC a cada boot', async () => {
    const { autoLaunch, run, loginItem } = setup({ openAtLogin: true });
    await autoLaunch.init({ isElevated: true });

    expect(calls(run, '/Create')).toHaveLength(1);
    expect(loginItem.openAtLogin).toBe(false);
    expect(autoLaunch.getState().enabled).toBe(true);
  });

  it('sem administrador, usa a entrada comum e não tenta criar a tarefa', async () => {
    const { autoLaunch, run, loginItem } = setup();
    await autoLaunch.init({ isElevated: false });
    await autoLaunch.set(true);

    expect(calls(run, '/Create')).toHaveLength(0);
    expect(loginItem.openAtLogin).toBe(true);
  });

  it('se o schtasks falhar, mantém a entrada comum para o app ainda abrir no boot', async () => {
    const { autoLaunch, loginItem } = setup({ createOk: false });
    await autoLaunch.init({ isElevated: true });
    await autoLaunch.set(true);

    expect(loginItem.openAtLogin).toBe(true);
    expect(autoLaunch.getState().enabled).toBe(true);
  });

  it('desligar apaga a tarefa e a entrada comum', async () => {
    const { autoLaunch, run, loginItem } = setup({ taskExists: true });
    await autoLaunch.init({ isElevated: true });
    expect(autoLaunch.getState().enabled).toBe(true);

    await autoLaunch.set(false);
    expect(calls(run, '/Delete')[0][0]).toEqual(['/Delete', '/TN', TASK_NAME, '/F']);
    expect(loginItem.openAtLogin).toBe(false);
    expect(autoLaunch.getState().enabled).toBe(false);
  });

  it('em dev não mexe em nada', async () => {
    const { autoLaunch, run, app } = setup({ isPackaged: false });
    await autoLaunch.init({ isElevated: true });
    await autoLaunch.set(true);

    expect(run).not.toHaveBeenCalled();
    expect(app.setLoginItemSettings).not.toHaveBeenCalled();
    expect(autoLaunch.getState()).toEqual({ supported: false, enabled: false });
  });

  it('liga só na primeira execução e depois respeita a escolha do usuário', async () => {
    const { autoLaunch, run } = setup();
    await autoLaunch.init({ isElevated: true });
    await autoLaunch.configureOnFirstRun();
    await autoLaunch.configureOnFirstRun();

    expect(calls(run, '/Create')).toHaveLength(1);
  });

  it('a tarefa não para na bateria nem tem limite de tempo (o padrão encerraria o app em 72 h)', () => {
    const xml = buildTaskXml({ execPath: 'C:\\A & B\\PC Sentinel.exe', userId: 'PC\\Arthur' });
    expect(xml).toContain('<ExecutionTimeLimit>PT0S</ExecutionTimeLimit>');
    expect(xml).toContain('<DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>');
    expect(xml).toContain('<StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>');
    expect(xml).toContain('<Command>C:\\A &amp; B\\PC Sentinel.exe</Command>');
    expect(xml).toContain('<UserId>PC\\Arthur</UserId>');
  });
});
