const { app, Notification } = require('electron');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { paths } = require('./paths');

/** `net session` só funciona em um processo com privilégio de Administrador. */
function detectElevation() {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve(false);
    execFile('net', ['session'], { windowsHide: true }, (error) => resolve(!error));
  });
}

/** Abre o PC Sentinel de novo pedindo administrador (UAC). Resolve false se o usuário recusar. */
function launchElevatedCopy() {
  const quote = (value) => `'${String(value).replace(/'/g, "''")}'`;
  const args = process.argv.slice(1).filter(Boolean);
  const argList = args.length > 0 ? ` -ArgumentList ${args.map(quote).join(',')}` : '';
  const command = `Start-Process -FilePath ${quote(process.execPath)}${argList} -WorkingDirectory ${quote(process.cwd())} -Verb RunAs`;

  return new Promise((resolve) => {
    execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true }, (error) =>
      resolve(!error),
    );
  });
}

/**
 * Iniciar com o Windows. Só existe no app instalado: em dev o atalho apontaria para o electron.exe.
 * Na primeira execução fica ligado; depois a escolha é do usuário e nunca é sobrescrita.
 */
const autoLaunch = {
  getState() {
    return {
      supported: Boolean(app.isPackaged),
      enabled: app.isPackaged ? app.getLoginItemSettings().openAtLogin : false,
    };
  },

  set(enabled) {
    if (!app.isPackaged) return;
    app.setLoginItemSettings({ openAtLogin: Boolean(enabled), path: process.execPath, args: [] });
  },

  configureOnFirstRun() {
    if (!app.isPackaged) return;
    const marker = path.join(app.getPath('userData'), 'autolaunch-configured');
    if (fs.existsSync(marker)) return;
    try {
      this.set(true);
      fs.mkdirSync(path.dirname(marker), { recursive: true });
      fs.writeFileSync(marker, new Date().toISOString(), 'utf-8');
    } catch (err) {
      console.error('[PC Sentinel] Erro ao configurar o início com o Windows:', err);
    }
  },
};

/**
 * Histórico térmico em %APPDATA%: o diretório de trabalho do app instalado (System32 ou
 * Program Files) não é gravável. Copia o histórico de versões antigas, que gravavam no cwd.
 */
function resolveThermalDbPath() {
  const dir = app.getPath('userData');
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, 'thermal_history.db');

  const legacyJson = path.join(process.cwd(), 'thermal_history.json');
  const targetJson = target.replace(/\.db$/i, '.json');
  try {
    if (!fs.existsSync(targetJson) && fs.existsSync(legacyJson)) fs.copyFileSync(legacyJson, targetJson);
  } catch {
    // sem histórico antigo para migrar
  }
  return target;
}

function notify({ title, body, urgency }) {
  if (!Notification.isSupported()) return;
  new Notification({
    title,
    body,
    urgency,
    icon: fs.existsSync(paths.icon) ? paths.icon : undefined,
  }).show();
}

module.exports = { detectElevation, launchElevatedCopy, autoLaunch, resolveThermalDbPath, notify };
