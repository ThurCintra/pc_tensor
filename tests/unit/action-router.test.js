import { describe, it, expect } from 'vitest';
const { ActionRouter, POWER_PLANS } = require('../../src/server/action-router');
const { createFakeExec, tasklistOutput } = require('../helpers/fake-exec');

// Nenhum teste executa comandos reais: taskkill, powercfg e powershell são simulados
function createRouter(handlers = {}, options = {}) {
  const execFile = createFakeExec(handlers);
  const router = new ActionRouter({ execFile, ...options });
  return { router, execFile };
}

describe('ActionRouter', () => {
  it('deve bloquear encerramento de processos críticos do Windows para evitar BSOD', async () => {
    const { router, execFile } = createRouter();

    // Teste com PID do sistema
    const resPid = await router.handleAction({
      action: 'KILL_PROCESS',
      pid: 4,
      name: 'System',
    });
    expect(resPid.success).toBe(false);
    expect(resPid.error).toBe('INVALID_PID');

    // Teste com processos críticos da whitelist
    const criticals = ['csrss.exe', 'explorer.exe', 'svchost.exe', 'wininit.exe', 'dwm.exe'];
    for (const proc of criticals) {
      const res = await router.handleAction({
        action: 'KILL_PROCESS',
        pid: 1234,
        name: proc,
      });
      expect(res.success).toBe(false);
      expect(res.error).toBe('CRITICAL_PROCESS_BLOCKED');
      expect(res.message).toContain('essencial para o funcionamento do Windows');
    }

    expect(execFile.calls.some((c) => c.cmd === 'taskkill')).toBe(false);
  });

  it('deve validar o nome REAL do PID e ignorar o nome informado pelo cliente', async () => {
    const { router, execFile } = createRouter({
      tasklist: () => ({ stdout: tasklistOutput('lsass.exe', 700) }),
    });

    const res = await router.handleAction({ action: 'KILL_PROCESS', pid: 700, name: 'inofensivo.exe' });

    expect(res.success).toBe(false);
    expect(res.error).toBe('CRITICAL_PROCESS_BLOCKED');
    expect(res.message).toContain('lsass.exe');
    expect(execFile.calls.some((c) => c.cmd === 'taskkill')).toBe(false);
  });

  it('deve encerrar processo comum usando o nome resolvido pelo tasklist', async () => {
    const { router, execFile } = createRouter({
      tasklist: () => ({ stdout: tasklistOutput('chrome.exe', 5120) }),
    });

    const res = await router.handleAction({ action: 'KILL_PROCESS', pid: 5120 });

    expect(res.success).toBe(true);
    expect(res.name).toBe('chrome.exe');
    const kill = execFile.calls.find((c) => c.cmd === 'taskkill');
    expect(kill.args).toEqual(['/F', '/PID', '5120']);
  });

  it('deve retornar PROCESS_NOT_FOUND quando o PID não existir', async () => {
    const { router, execFile } = createRouter({
      tasklist: () => ({ stdout: 'INFO: No tasks are running which match the specified criteria.\r\n' }),
    });

    const res = await router.handleAction({ action: 'KILL_PROCESS', pid: 99999 });

    expect(res.success).toBe(false);
    expect(res.error).toBe('PROCESS_NOT_FOUND');
    expect(execFile.calls.some((c) => c.cmd === 'taskkill')).toBe(false);
  });

  it('deve impedir que o próprio PC Sentinel seja encerrado', async () => {
    const { router } = createRouter();
    const res = await router.handleAction({ action: 'KILL_PROCESS', pid: process.pid });
    expect(res.success).toBe(false);
    expect(res.error).toBe('CRITICAL_PROCESS_BLOCKED');
  });

  it('deve validar e mapear planos de energia conhecidos', async () => {
    const { router, execFile } = createRouter();

    // Plano desconhecido
    const resInvalid = await router.handleAction({
      action: 'SET_POWER_PLAN',
      plan: 'SUPER_OVERCLOCK_9999',
    });
    expect(resInvalid.success).toBe(false);
    expect(resInvalid.error).toBe('UNKNOWN_PLAN');

    // Mapeamento correto de presets para GUIDs oficiais do Windows
    expect(POWER_PLANS.SAVER.guid).toBe('a1841308-3541-4b94-bc77-74787967c520');
    expect(POWER_PLANS.BALANCED.guid).toBe('381b4222-f694-41f0-9685-ff5bb260df2e');
    expect(POWER_PLANS.HIGH_PERFORMANCE.guid).toBe('8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c');
    expect(POWER_PLANS.ULTIMATE.guid).toBe('e9a42b02-d5df-448d-aa00-03f14749eb61');

    const resOk = await router.handleAction({ action: 'SET_POWER_PLAN', plan: 'BALANCED' });
    expect(resOk.success).toBe(true);
    expect(execFile.calls.find((c) => c.cmd === 'powercfg').args).toEqual(['/setactive', POWER_PLANS.BALANCED.guid]);
  });

  it('deve aceitar no Boost apenas alvos da lista configurada', async () => {
    const { router, execFile } = createRouter();
    // Mistura apps válidos, processos críticos e curingas do taskkill
    const mixedTargets = ['Discord.exe', 'csrss.exe', 'spotify', 'explorer.exe', '*', 'malware*.exe'];

    const res = await router.handleAction({
      action: 'BOOST_CLEANUP',
      targets: mixedTargets,
    });

    expect(res.success).toBe(true);
    expect(res.freedMB).toBeTypeOf('number');
    const killed = execFile.calls.filter((c) => c.cmd === 'taskkill').map((c) => c.args[2]);
    expect(killed.sort()).toEqual(['Discord.exe', 'Spotify.exe']);
    expect(res.rejectedTargets).toEqual(['csrss.exe', 'explorer.exe', '*', 'malware*.exe']);
  });

  it('deve usar a lista padrão no Boost quando nenhum alvo for informado', async () => {
    const { router, execFile } = createRouter({}, { boostTargets: ['OneDrive.exe', 'Teams'] });

    const res = await router.handleAction({ action: 'BOOST_CLEANUP' });

    expect(res.success).toBe(true);
    const killed = execFile.calls.filter((c) => c.cmd === 'taskkill').map((c) => c.args[2]);
    expect(killed.sort()).toEqual(['OneDrive.exe', 'Teams.exe']);
    expect(res.closedProcesses.sort()).toEqual(['OneDrive.exe', 'Teams.exe']);
  });

  it('deve suportar comandos de áudio e mídia', async () => {
    const { router, execFile } = createRouter();

    const commands = ['PLAY_PAUSE', 'MUTE_VOLUME', 'VOLUME_UP', 'VOLUME_DOWN'];
    for (const cmd of commands) {
      const res = await router.handleAction({
        action: 'MEDIA_AUDIO_CONTROL',
        command: cmd,
        requestId: `req_${cmd}`,
      });
      expect(res.success).toBe(true);
      expect(res.requestId).toBe(`req_${cmd}`);
      expect(res.command).toBe(cmd);
    }
    expect(execFile.calls.filter((c) => c.cmd === 'powershell')).toHaveLength(commands.length);

    // MUTE_MIC não é implementado e não pode fingir sucesso
    const resMic = await router.handleAction({ action: 'MEDIA_AUDIO_CONTROL', command: 'MUTE_MIC' });
    expect(resMic.success).toBe(false);
    expect(resMic.error).toBe('NOT_SUPPORTED');

    // Comando inválido
    const resInvalid = await router.handleAction({
      action: 'MEDIA_AUDIO_CONTROL',
      command: 'WARP_SPEED',
    });
    expect(resInvalid.success).toBe(false);
    expect(resInvalid.error).toBe('UNKNOWN_MEDIA_COMMAND');
  });

  it('deve retornar erro para ações não especificadas ou desconhecidas', async () => {
    const { router } = createRouter();

    const resEmpty = await router.handleAction({});
    expect(resEmpty.success).toBe(false);
    expect(resEmpty.error).toBe('NO_ACTION_SPECIFIED');

    const resUnknown = await router.handleAction({ action: 'SELF_DESTRUCT' });
    expect(resUnknown.success).toBe(false);
    expect(resUnknown.error).toBe('UNKNOWN_ACTION');
  });

  it('deve aceitar parâmetros aninhados no objeto params', async () => {
    const { router } = createRouter();

    const resKill = await router.handleAction({
      action: 'KILL_PROCESS',
      params: { pid: 4, processName: 'System' },
    });
    expect(resKill.success).toBe(false);
    expect(resKill.error).toBe('INVALID_PID');

    const resPlan = await router.handleAction({
      action: 'SET_POWER_PLAN',
      params: { plan: 'SUPER_OVERCLOCK_9999' },
    });
    expect(resPlan.success).toBe(false);
    expect(resPlan.error).toBe('UNKNOWN_PLAN');
  });
});
