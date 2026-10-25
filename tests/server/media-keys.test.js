import { describe, it, expect, vi } from 'vitest';
const EventEmitter = require('events');
const { MediaKeySender, MEDIA_KEYS } = require('../../src/server/media-keys');

/** PowerShell simulado: responde "ready" ao abrir e "ok id" para cada linha recebida. */
function fakePowerShell({ answer = true, ready = true } = {}) {
  const spawned = [];
  const spawnFn = vi.fn((cmd, args) => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stdout.setEncoding = () => {};
    child.lines = [];
    child.kill = vi.fn(() => child.emit('exit', 0));
    child.stdin = {
      write: (line) => {
        child.lines.push(line.trim());
        const [id] = line.trim().split(' ');
        if (answer) setImmediate(() => child.stdout.emit('data', `ok ${id}\r\n`));
      },
      end: vi.fn(),
    };
    spawned.push({ cmd, args, child });
    if (ready) setImmediate(() => child.stdout.emit('data', 'ready\r\n'));
    return child;
  });
  return { spawnFn, spawned };
}

describe('MediaKeySender', () => {
  it('abre um PowerShell só e aperta a tecla virtual de cada comando', async () => {
    const { spawnFn, spawned } = fakePowerShell();
    const keys = new MediaKeySender({ spawnFn, platform: 'win32' });

    await keys.press('PLAY_PAUSE');
    await keys.press('VOLUME_UP');
    await keys.press('NEXT_TRACK');

    expect(spawnFn).toHaveBeenCalledTimes(1);
    expect(spawned[0].cmd).toBe('powershell');
    expect(spawned[0].args).toContain('-EncodedCommand');
    expect(spawned[0].child.lines).toEqual([
      `1 ${MEDIA_KEYS.PLAY_PAUSE.vk}`,
      `2 ${MEDIA_KEYS.VOLUME_UP.vk}`,
      `3 ${MEDIA_KEYS.NEXT_TRACK.vk}`,
    ]);
  });

  it('usa os códigos de tecla do Windows para mídia e volume', () => {
    expect(MEDIA_KEYS.PLAY_PAUSE.vk).toBe(0xb3);
    expect(MEDIA_KEYS.NEXT_TRACK.vk).toBe(0xb0);
    expect(MEDIA_KEYS.PREV_TRACK.vk).toBe(0xb1);
    expect(MEDIA_KEYS.VOLUME_MUTE.vk).toBe(0xad);
    expect(MEDIA_KEYS.VOLUME_DOWN.vk).toBe(0xae);
    expect(MEDIA_KEYS.VOLUME_UP.vk).toBe(0xaf);
  });

  it('reabre o ajudante se ele tiver fechado', async () => {
    const { spawnFn, spawned } = fakePowerShell();
    const keys = new MediaKeySender({ spawnFn, platform: 'win32' });

    await keys.press('PLAY_PAUSE');
    spawned[0].child.emit('exit', 1);
    await keys.press('PLAY_PAUSE');

    expect(spawnFn).toHaveBeenCalledTimes(2);
  });

  it('falha com aviso se o Windows não responder a tempo', async () => {
    const { spawnFn } = fakePowerShell({ answer: false });
    const keys = new MediaKeySender({ spawnFn, platform: 'win32', timeoutMs: 30 });

    await expect(keys.press('VOLUME_DOWN')).rejects.toThrow('O Windows não respondeu a tempo.');
  });

  it('recusa tecla desconhecida e sistema que não é Windows sem abrir nada', async () => {
    const { spawnFn } = fakePowerShell();
    await expect(new MediaKeySender({ spawnFn, platform: 'win32' }).press('WARP')).rejects.toThrow('desconhecida');
    await expect(new MediaKeySender({ spawnFn, platform: 'linux' }).press('PLAY_PAUSE')).rejects.toThrow('Windows');
    expect(spawnFn).not.toHaveBeenCalled();
  });

  it('stop() fecha o ajudante', async () => {
    const { spawnFn, spawned } = fakePowerShell();
    const keys = new MediaKeySender({ spawnFn, platform: 'win32' });
    await keys.press('PLAY_PAUSE');

    keys.stop();
    expect(spawned[0].child.stdin.end).toHaveBeenCalled();
    expect(spawned[0].child.kill).toHaveBeenCalled();
  });
});
