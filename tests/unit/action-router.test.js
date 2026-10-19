import { describe, it, expect, vi } from 'vitest';
const { ActionRouter, CRITICAL_SYSTEM_PROCESSES, POWER_PLANS } = require('../../src/server/action-router');

describe('ActionRouter', () => {
  it('deve bloquear encerramento de processos críticos do Windows para evitar BSOD', async () => {
    const router = new ActionRouter();

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
  });

  it('deve validar e mapear planos de energia conhecidos', async () => {
    const router = new ActionRouter();

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
  });

  it('deve ignorar processos críticos na lista de Boost Cleanup', async () => {
    const router = new ActionRouter();
    // Injeta acidentalmente processos críticos junto a apps normais
    const mixedTargets = ['Discord.exe', 'csrss.exe', 'Spotify.exe', 'explorer.exe'];

    // O método não deve lançar erro e deve filtrar os críticos
    const res = await router.handleAction({
      action: 'BOOST_CLEANUP',
      targets: mixedTargets,
    });

    expect(res.success).toBe(true);
    expect(res.freedMB).toBeTypeOf('number');
    expect(Array.isArray(res.closedProcesses)).toBe(true);
    // Não pode ter fechado nenhum crítico
    expect(res.closedProcesses).not.toContain('csrss.exe');
    expect(res.closedProcesses).not.toContain('explorer.exe');
  });

  it('deve suportar comandos de áudio e mídia', async () => {
    const router = new ActionRouter();

    const commands = ['PLAY_PAUSE', 'MUTE_VOLUME', 'VOLUME_UP', 'VOLUME_DOWN', 'MUTE_MIC'];
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

    // Comando inválido
    const resInvalid = await router.handleAction({
      action: 'MEDIA_AUDIO_CONTROL',
      command: 'WARP_SPEED',
    });
    expect(resInvalid.success).toBe(false);
    expect(resInvalid.error).toBe('UNKNOWN_MEDIA_COMMAND');
  });

  it('deve retornar erro para ações não especificadas ou desconhecidas', async () => {
    const router = new ActionRouter();

    const resEmpty = await router.handleAction({});
    expect(resEmpty.success).toBe(false);
    expect(resEmpty.error).toBe('NO_ACTION_SPECIFIED');

    const resUnknown = await router.handleAction({ action: 'SELF_DESTRUCT' });
    expect(resUnknown.success).toBe(false);
    expect(resUnknown.error).toBe('UNKNOWN_ACTION');
  });
});
