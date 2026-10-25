const { spawn } = require('child_process');

/** Teclas virtuais do Windows para mídia e volume (as mesmas das teclas de mídia do teclado). */
const MEDIA_KEYS = {
  PLAY_PAUSE: { vk: 0xb3, label: 'Reproduzir / pausar' },
  NEXT_TRACK: { vk: 0xb0, label: 'Próxima faixa' },
  PREV_TRACK: { vk: 0xb1, label: 'Faixa anterior' },
  VOLUME_MUTE: { vk: 0xad, label: 'Silenciar' },
  VOLUME_DOWN: { vk: 0xae, label: 'Diminuir volume' },
  VOLUME_UP: { vk: 0xaf, label: 'Aumentar volume' },
};

const COMMAND_TIMEOUT_MS = 5000;

/**
 * Programa do ajudante: carrega keybd_event (user32) uma vez e fica lendo "id vk" da entrada padrão.
 * Cada linha aperta e solta a tecla (KEYEVENTF_EXTENDEDKEY = 1, KEYUP = 2) e responde "ok id".
 * Quando o app fecha, a entrada padrão termina e o ajudante sai sozinho.
 */
const HELPER_SCRIPT = `
$ErrorActionPreference = 'Stop'
Add-Type -Namespace PcSentinel -Name Keys -MemberDefinition '[DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);'
[Console]::Out.WriteLine('ready')
while ($null -ne ($line = [Console]::In.ReadLine())) {
  $parts = $line.Split(' ')
  if ($parts.Length -ne 2) { continue }
  $vk = [byte]$parts[1]
  [PcSentinel.Keys]::keybd_event($vk, 0, 1, [UIntPtr]::Zero)
  [PcSentinel.Keys]::keybd_event($vk, 0, 3, [UIntPtr]::Zero)
  [Console]::Out.WriteLine('ok ' + $parts[0])
}
`;

/**
 * MediaKeySender
 * Aperta as teclas de mídia e volume do Windows. Antes o app usava WScript.Shell.SendKeys([char]179), que digita
 * o caractere "³" em vez de apertar a tecla, e abria um PowerShell novo a cada clique (até 1 s de espera).
 * Agora um único PowerShell fica aberto em segundo plano chamando keybd_event, e cada clique leva milissegundos.
 */
class MediaKeySender {
  constructor({ spawnFn = spawn, platform = process.platform, timeoutMs = COMMAND_TIMEOUT_MS } = {}) {
    this.spawnFn = spawnFn;
    this.platform = platform;
    this.timeoutMs = timeoutMs;
    this.child = null;
    this.ready = null;
    this.pending = new Map();
    this.nextId = 1;
    this.buffer = '';
  }

  get supported() {
    return this.platform === 'win32';
  }

  /** Aperta a tecla do comando (chave de MEDIA_KEYS). */
  async press(command) {
    const key = MEDIA_KEYS[command];
    if (!key) throw new Error(`Tecla de mídia desconhecida: ${command}`);
    if (!this.supported) throw new Error('Teclas de mídia só funcionam no Windows.');

    await this.start();
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('O Windows não respondeu a tempo.'));
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(`${id} ${key.vk}\n`);
    });
  }

  /** Abre o ajudante na primeira tecla (e de novo se ele tiver caído). */
  start() {
    if (this.ready) return this.ready;

    const encoded = Buffer.from(HELPER_SCRIPT, 'utf16le').toString('base64');
    const child = this.spawnFn(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] },
    );
    this.child = child;
    this.buffer = '';

    this.ready = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.reset(new Error('O ajudante de mídia não iniciou.'));
        reject(new Error('O ajudante de mídia não iniciou.'));
      }, this.timeoutMs * 2);

      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        this.buffer += chunk;
        let index;
        while ((index = this.buffer.indexOf('\n')) >= 0) {
          const line = this.buffer.slice(0, index).trim();
          this.buffer = this.buffer.slice(index + 1);
          if (line === 'ready') {
            clearTimeout(timer);
            resolve();
          } else if (line.startsWith('ok ')) {
            this.settle(Number(line.slice(3)));
          }
        }
      });
      child.on('error', (err) => {
        clearTimeout(timer);
        if (this.child === child) this.reset(err);
        reject(err);
      });
      child.on('exit', () => {
        clearTimeout(timer);
        if (this.child === child) this.reset(new Error('O ajudante de mídia fechou.'));
        reject(new Error('O ajudante de mídia fechou.'));
      });
    });
    // Sem ninguém esperando o "ready", uma falha não pode virar rejeição sem tratamento
    this.ready.catch(() => {});
    return this.ready;
  }

  settle(id) {
    const entry = this.pending.get(id);
    if (!entry) return;
    clearTimeout(entry.timer);
    this.pending.delete(id);
    entry.resolve();
  }

  /** Ajudante caiu: falha o que estava esperando e deixa a próxima tecla abrir outro. */
  reset(err) {
    for (const { reject, timer } of this.pending.values()) {
      clearTimeout(timer);
      reject(err);
    }
    this.pending.clear();
    this.child = null;
    this.ready = null;
  }

  stop() {
    const child = this.child;
    this.reset(new Error('Encerrado.'));
    if (child) {
      child.stdin.end();
      child.kill();
    }
  }
}

module.exports = { MediaKeySender, MEDIA_KEYS };
