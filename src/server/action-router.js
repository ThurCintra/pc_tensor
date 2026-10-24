const { execFile } = require('child_process');
const os = require('os');

/**
 * Whitelist de processos críticos do Windows que NUNCA podem ser encerrados
 * para evitar telas azuis (BSOD) ou instabilidade crítica do sistema.
 */
const CRITICAL_SYSTEM_PROCESSES = new Set([
  'system',
  'system idle process',
  'idle',
  'smss.exe',
  'csrss.exe',
  'wininit.exe',
  'services.exe',
  'lsass.exe',
  'svchost.exe',
  'winlogon.exe',
  'dwm.exe',
  'explorer.exe',
  'fontdrvhost.exe',
  'runtimebroker.exe',
  'sihost.exe',
  'taskhostw.exe',
  'conhost.exe',
  'ctfmon.exe',
]);

/**
 * GUIDs oficiais dos Planos de Energia do Windows
 */
const POWER_PLANS = {
  SAVER: {
    name: 'Economia de Energia',
    guid: 'a1841308-3541-4b94-bc77-74787967c520',
  },
  BALANCED: {
    name: 'Equilibrado',
    guid: '381b4222-f694-41f0-9685-ff5bb260df2e',
  },
  HIGH_PERFORMANCE: {
    name: 'Alto Desempenho',
    guid: '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c',
  },
  ULTIMATE: {
    name: 'Desempenho Máximo',
    guid: 'e9a42b02-d5df-448d-aa00-03f14749eb61',
  },
};

/**
 * Processos em segundo plano comuns recomendados para Boost Cleanup
 */
const DEFAULT_BOOST_TARGETS = [
  'Spotify.exe',
  'Discord.exe',
  'EpicGamesLauncher.exe',
  'SteamWebHelper.exe',
  'OneDrive.exe',
  'Teams.exe',
  'Dropbox.exe',
  'Cortana.exe',
];

/**
 * ActionRouter
 * Roteador assíncrono e seguro para execução de comandos remotos disparados pelo Mobile HUD.
 * Aplica validação estrita, proteção contra BSOD e execução não-bloqueante (zero-overhead).
 */
class ActionRouter {
  constructor(options = {}) {
    this.criticalProcesses = new Set(
      (options.criticalProcesses || Array.from(CRITICAL_SYSTEM_PROCESSES)).map((p) => p.toLowerCase())
    );
    this.boostTargets = options.boostTargets || [...DEFAULT_BOOST_TARGETS];
    this.powerPlans = options.powerPlans || POWER_PLANS;
    this.collector = options.collector || null;
    // Injeção do executor permite testar sem disparar comandos reais no sistema
    this.execFile = options.execFile || execFile;
  }

  /**
   * Resolve o nome real do executável de um PID via tasklist.
   * Retorna null se o processo não existir.
   */
  getProcessName(pid) {
    return new Promise((resolve) => {
      this.execFile('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], { windowsHide: true }, (error, stdout) => {
        if (error) return resolve(null);
        const match = String(stdout || '').match(/^"([^"]+)","(\d+)"/m);
        resolve(match && Number(match[2]) === pid ? match[1] : null);
      });
    });
  }

  setCollector(collector) {
    this.collector = collector;
  }

  /**
   * Ponto de entrada para processamento seguro de mensagens de comando
   */
  async handleAction(payload = {}) {
    const action = payload.action || payload.type;
    const requestId = payload.requestId || null;

    const params = payload.params || {};

    if (!action) {
      return {
        success: false,
        requestId,
        error: 'NO_ACTION_SPECIFIED',
        message: 'Nenhuma ação foi especificada.',
      };
    }

    try {
      switch (action.toUpperCase()) {
        case 'KILL_PROCESS': {
          const pid = payload.pid !== undefined ? payload.pid : params.pid;
          const name = payload.name || payload.processName || params.name || params.processName;
          return await this.killProcess(pid, name, requestId);
        }

        case 'SET_POWER_PLAN': {
          const plan = payload.plan || payload.guid || params.plan || params.guid;
          return await this.setPowerPlan(plan, requestId);
        }

        case 'BOOST_CLEANUP': {
          const targets = payload.targets || params.targets;
          return await this.boostCleanup(targets, requestId);
        }

        case 'MEDIA_AUDIO_CONTROL': {
          const command = payload.command || params.command;
          return await this.mediaAudioControl(command, requestId);
        }

        default:
          return {
            success: false,
            requestId,
            error: 'UNKNOWN_ACTION',
            message: `Ação desconhecida: ${action}`,
          };
      }
    } catch (err) {
      return {
        success: false,
        requestId,
        error: 'EXECUTION_ERROR',
        message: err.message || 'Erro inesperado ao executar ação.',
      };
    }
  }

  /**
   * Encerra um processo específico de forma segura (KILL_PROCESS)
   */
  async killProcess(pid, procName = null, requestId = null) {
    const numPid = Number(pid);
    if (!numPid || isNaN(numPid) || numPid <= 4) {
      return {
        success: false,
        requestId,
        error: 'INVALID_PID',
        message: 'PID inválido ou processo protegido do sistema (PID <= 4).',
      };
    }

    if (numPid === process.pid || numPid === process.ppid) {
      return {
        success: false,
        requestId,
        error: 'CRITICAL_PROCESS_BLOCKED',
        message: 'O próprio PC Sentinel não pode ser encerrado remotamente.',
      };
    }

    const isCritical = (name) => {
      const n = (name || '').toLowerCase().trim();
      if (!n) return false;
      return this.criticalProcesses.has(n) || this.criticalProcesses.has(n.endsWith('.exe') ? n : `${n}.exe`);
    };

    // 1. Rejeita de imediato nomes críticos informados pelo cliente
    if (isCritical(procName)) {
      return {
        success: false,
        requestId,
        error: 'CRITICAL_PROCESS_BLOCKED',
        message: `O processo "${procName}" é essencial para o funcionamento do Windows e não pode ser encerrado.`,
      };
    }

    // 2. Valida o nome REAL do PID: o nome enviado pelo cliente não é confiável
    const realName = await this.getProcessName(numPid);
    if (!realName) {
      return {
        success: false,
        requestId,
        error: 'PROCESS_NOT_FOUND',
        message: `Nenhum processo encontrado com o PID ${numPid}.`,
      };
    }
    if (isCritical(realName)) {
      return {
        success: false,
        requestId,
        error: 'CRITICAL_PROCESS_BLOCKED',
        message: `O processo "${realName}" é essencial para o funcionamento do Windows e não pode ser encerrado.`,
      };
    }
    procName = realName;

    // 3. Executa encerramento assíncrono via taskkill não-bloqueante
    return new Promise((resolve) => {
      this.execFile('taskkill', ['/F', '/PID', String(numPid)], { windowsHide: true }, (error, stdout, stderr) => {
        if (error) {
          return resolve({
            success: false,
            requestId,
            error: 'TASKKILL_FAILED',
            message: `Não foi possível encerrar o PID ${numPid}: ${stderr || error.message}`.trim(),
          });
        }

        resolve({
          success: true,
          requestId,
          pid: numPid,
          name: procName,
          message: `Processo ${procName ? `${procName} ` : ''}(PID ${numPid}) finalizado com sucesso.`,
        });
      });
    });
  }

  /**
   * Alterna planos de energia do Windows via powercfg (SET_POWER_PLAN)
   */
  async setPowerPlan(planInput, requestId = null) {
    if (!planInput) {
      return {
        success: false,
        requestId,
        error: 'INVALID_PLAN',
        message: 'Identificador do plano de energia não fornecido.',
      };
    }

    let targetGuid = null;
    let targetName = planInput;

    const key = String(planInput).toUpperCase().replace(/\s+/g, '_');
    if (this.powerPlans[key]) {
      targetGuid = this.powerPlans[key].guid;
      targetName = this.powerPlans[key].name;
    } else {
      // Verifica se o próprio input já é um GUID válido
      const isGuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(planInput);
      if (isGuid) {
        targetGuid = planInput;
      } else {
        return {
          success: false,
          requestId,
          error: 'UNKNOWN_PLAN',
          message: `Plano de energia "${planInput}" não reconhecido. Use: SAVER, BALANCED, HIGH_PERFORMANCE ou ULTIMATE.`,
        };
      }
    }

    return new Promise((resolve) => {
      this.execFile('powercfg', ['/setactive', targetGuid], { windowsHide: true }, (error, stdout, stderr) => {
        if (error) {
          return resolve({
            success: false,
            requestId,
            error: 'POWERCFG_FAILED',
            message: `Falha ao aplicar plano de energia: ${stderr || error.message}`.trim(),
          });
        }

        resolve({
          success: true,
          requestId,
          plan: key,
          guid: targetGuid,
          name: targetName,
          message: `Plano de energia alterado para: ${targetName}.`,
        });
      });
    });
  }

  /**
   * Encerra aplicações secundárias em segundo plano e calcula RAM liberada (BOOST_CLEANUP)
   */
  async boostCleanup(customTargets = null, requestId = null) {
    // Alvos remotos só são aceitos se fizerem parte da lista configurada de Boost:
    // impede curingas do taskkill (ex.: "*") e nomes arbitrários vindos da rede.
    const allowed = new Map(
      this.boostTargets.map((t) => {
        const exe = t.toLowerCase().endsWith('.exe') ? t : `${t}.exe`;
        return [exe.toLowerCase(), exe];
      })
    );
    const rejectedTargets = [];
    let targets = Array.from(allowed.values());

    if (Array.isArray(customTargets) && customTargets.length > 0) {
      targets = [];
      for (const raw of customTargets) {
        const name = String(raw || '').trim();
        const exe = name.toLowerCase().endsWith('.exe') ? name : `${name}.exe`;
        const canonical = allowed.get(exe.toLowerCase());
        if (canonical && !targets.includes(canonical)) {
          targets.push(canonical);
        } else if (!canonical) {
          rejectedTargets.push(name);
        }
      }
    }

    const initialFree = os.freemem();
    const closedList = [];

    // Encerra cada alvo da lista assincronamente
    await Promise.all(
      targets.map(
        (exeName) =>
          new Promise((resolve) => {
            // Protege contra inclusão acidental de processo crítico na configuração
            if (this.criticalProcesses.has(exeName.toLowerCase())) {
              return resolve();
            }

            this.execFile('taskkill', ['/F', '/IM', exeName], { windowsHide: true }, (error) => {
              if (!error) {
                closedList.push(exeName);
              }
              resolve();
            });
          })
      )
    );

    // Pequena pausa assíncrona não-bloqueante para o SO desalocar a memória das páginas
    await new Promise((r) => setTimeout(r, 400));

    const finalFree = os.freemem();
    const freedBytes = Math.max(0, finalFree - initialFree);
    const freedMB = Number((freedBytes / (1024 * 1024)).toFixed(0));

    return {
      success: true,
      requestId,
      freedMB,
      closedProcesses: closedList,
      rejectedTargets,
      message: closedList.length > 0
        ? `Modo Boost ativado: ${closedList.length} processo(s) finalizados. Aprox. ${freedMB} MB de RAM liberados.`
        : 'Nenhum processo em segundo plano da lista estava em execução.',
    };
  }

  /**
   * Controle de Áudio e Mídia via PowerShell SendKeys nativo não-bloqueante (MEDIA_AUDIO_CONTROL)
   */
  async mediaAudioControl(command, requestId = null) {
    const cmd = String(command || '').toUpperCase();

    // Mapeamento para teclas virtuais do Windows (Virtual Key Codes via WScript.Shell SendKeys)
    let charCode = null;
    let label = '';

    switch (cmd) {
      case 'PLAY_PAUSE':
      case 'MEDIA_PLAY_PAUSE':
        charCode = 179; // VK_MEDIA_PLAY_PAUSE
        label = 'Play / Pause';
        break;

      case 'MUTE_VOLUME':
      case 'VOLUME_MUTE':
        charCode = 173; // VK_VOLUME_MUTE
        label = 'Mudo de Volume';
        break;

      case 'VOLUME_UP':
        charCode = 175; // VK_VOLUME_UP
        label = 'Aumentar Volume';
        break;

      case 'VOLUME_DOWN':
        charCode = 174; // VK_VOLUME_DOWN
        label = 'Diminuir Volume';
        break;

      case 'NEXT_TRACK':
        charCode = 176; // VK_MEDIA_NEXT_TRACK
        label = 'Próxima Faixa';
        break;

      case 'PREV_TRACK':
        charCode = 177; // VK_MEDIA_PREV_TRACK
        label = 'Faixa Anterior';
        break;

      case 'MUTE_MIC':
        // Windows não expõe tecla virtual global para mutar o microfone
        return {
          success: false,
          requestId,
          command: cmd,
          error: 'NOT_SUPPORTED',
          message: 'Mutar o microfone ainda não é suportado.',
        };

      default:
        return {
          success: false,
          requestId,
          error: 'UNKNOWN_MEDIA_COMMAND',
          message: `Comando de mídia não suportado: ${command}`,
        };
    }

    const psScript = `(New-Object -ComObject WScript.Shell).SendKeys([char]${charCode})`;

    return new Promise((resolve) => {
      this.execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', psScript], { windowsHide: true }, (error) => {
        if (error) {
          return resolve({
            success: false,
            requestId,
            error: 'MEDIA_COMMAND_FAILED',
            message: `Falha ao acionar comando de mídia: ${error.message}`,
          });
        }

        resolve({
          success: true,
          requestId,
          command: cmd,
          label,
          message: `${label} acionado com sucesso.`,
        });
      });
    });
  }
}

module.exports = {
  ActionRouter,
  CRITICAL_SYSTEM_PROCESSES,
  POWER_PLANS,
  DEFAULT_BOOST_TARGETS,
};
