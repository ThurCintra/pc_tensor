const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const TASK_NAME = 'PC Sentinel';

const escapeXml = (value) =>
  String(value).replace(
    /[<>&'"]/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c],
  );

/**
 * Tarefa agendada que abre o app ao entrar no Windows já como administrador (RunLevel HighestAvailable), sem o
 * UAC. Sem limite de tempo de execução nem parada na bateria: o padrão do Agendador encerraria o app em 72 h.
 */
function buildTaskXml({ execPath, userId }) {
  const user = escapeXml(userId);
  return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>Abre o PC Sentinel como administrador ao entrar no Windows, sem pedir o UAC.</Description>
  </RegistrationInfo>
  <Triggers>
    <LogonTrigger>
      <Enabled>true</Enabled>
      <UserId>${user}</UserId>
      <Delay>PT5S</Delay>
    </LogonTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>${user}</UserId>
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>HighestAvailable</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>false</StartWhenAvailable>
    <IdleSettings>
      <StopOnIdleEnd>false</StopOnIdleEnd>
      <RestartOnIdle>false</RestartOnIdle>
    </IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Priority>4</Priority>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>${escapeXml(execPath)}</Command>
      <WorkingDirectory>${escapeXml(path.dirname(execPath))}</WorkingDirectory>
    </Exec>
  </Actions>
</Task>
`;
}

function runSchtasks(args) {
  return new Promise((resolve) => {
    execFile('schtasks', args, { windowsHide: true }, (error, stdout) =>
      resolve({ ok: !error, stdout: String(stdout) }),
    );
  });
}

function currentUserId() {
  const user = os.userInfo().username;
  return process.env.USERDOMAIN ? `${process.env.USERDOMAIN}\\${user}` : user;
}

/**
 * Iniciar com o Windows. Só existe no app instalado: em dev o atalho apontaria para o electron.exe.
 * Com administrador (o caso normal: o app se reabre pedindo o UAC), usa a tarefa agendada elevada e não pede o
 * UAC a cada boot. Sem administrador, cai para a entrada comum de inicialização, que pede o UAC ao abrir.
 * Na primeira execução fica ligado; depois a escolha é do usuário e nunca é sobrescrita.
 */
class AutoLaunch {
  constructor({
    app,
    execPath = process.execPath,
    run = runSchtasks,
    userId = currentUserId,
    tempDir = os.tmpdir(),
    log = console,
  }) {
    this.app = app;
    this.execPath = execPath;
    this.run = run;
    this.userId = userId;
    this.tempDir = tempDir;
    this.log = log;
    this.isElevated = false;
    this.taskEnabled = false;
  }

  get supported() {
    return Boolean(this.app.isPackaged);
  }

  loginItemEnabled() {
    return this.app.getLoginItemSettings().openAtLogin;
  }

  setLoginItem(enabled) {
    this.app.setLoginItemSettings({ openAtLogin: Boolean(enabled), path: this.execPath, args: [] });
  }

  /** Lê se a tarefa existe e migra a entrada antiga (que pedia o UAC a cada boot) para a tarefa elevada. */
  async init({ isElevated }) {
    this.isElevated = Boolean(isElevated);
    if (!this.supported) return;
    this.taskEnabled = (await this.run(['/Query', '/TN', TASK_NAME])).ok;
    if (this.isElevated && this.loginItemEnabled()) await this.set(true);
  }

  getState() {
    return { supported: this.supported, enabled: this.supported && (this.taskEnabled || this.loginItemEnabled()) };
  }

  async set(enabled) {
    if (!this.supported) return;
    if (!enabled) {
      if (this.taskEnabled) this.taskEnabled = !(await this.run(['/Delete', '/TN', TASK_NAME, '/F'])).ok;
      this.setLoginItem(false);
      return;
    }
    if (this.isElevated && (await this.createTask())) {
      this.taskEnabled = true;
      this.setLoginItem(false); // a tarefa substitui a entrada comum: abrir duas vezes pediria o UAC de novo
      return;
    }
    this.setLoginItem(true);
  }

  async createTask() {
    // O schtasks só aceita o XML em UTF-16 com BOM
    const file = path.join(this.tempDir, `pc-sentinel-task-${process.pid}.xml`);
    try {
      const xml = buildTaskXml({ execPath: this.execPath, userId: this.userId() });
      fs.writeFileSync(file, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(xml, 'utf16le')]));
      const { ok } = await this.run(['/Create', '/TN', TASK_NAME, '/XML', file, '/F']);
      if (!ok) this.log.warn('[PC Sentinel] Não foi possível criar a tarefa de início com o Windows.');
      return ok;
    } catch (err) {
      this.log.error('[PC Sentinel] Erro ao criar a tarefa de início com o Windows:', err);
      return false;
    } finally {
      fs.rmSync(file, { force: true });
    }
  }

  async configureOnFirstRun() {
    if (!this.supported) return;
    const marker = path.join(this.app.getPath('userData'), 'autolaunch-configured');
    if (fs.existsSync(marker)) return;
    try {
      await this.set(true);
      fs.mkdirSync(path.dirname(marker), { recursive: true });
      fs.writeFileSync(marker, new Date().toISOString(), 'utf-8');
    } catch (err) {
      this.log.error('[PC Sentinel] Erro ao configurar o início com o Windows:', err);
    }
  }
}

module.exports = { AutoLaunch, TASK_NAME, buildTaskXml };
