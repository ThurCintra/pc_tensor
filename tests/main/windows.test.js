import { describe, it, expect, vi } from 'vitest';
const EventEmitter = require('events');
const { WindowManager } = require('../../src/main/windows');

/** Janela simulada do Electron: visível/minimizada controláveis e registro do que foi enviado. */
function fakeWindow() {
  const win = new EventEmitter();
  win.visible = true;
  win.minimized = false;
  win.sent = [];
  win.isDestroyed = () => false;
  win.isVisible = () => win.visible;
  win.isMinimized = () => win.minimized;
  win.webContents = { send: vi.fn((channel, payload) => win.sent.push([channel, payload])) };
  return win;
}

function managerWith(win) {
  const manager = new WindowManager({});
  manager.mainWindow = win;
  // Liga só os eventos que o modo eco usa (createMain abriria uma janela de verdade)
  win.on('restore', () => manager.flushMetrics());
  win.on('show', () => manager.flushMetrics());
  return manager;
}

describe('WindowManager: modo eco das métricas', () => {
  it('entrega as métricas com a janela na tela', () => {
    const win = fakeWindow();
    const manager = managerWith(win);

    expect(manager.sendMetrics({ cpu: 1 })).toBe(true);
    expect(win.sent).toEqual([['metrics:update', { cpu: 1 }]]);
  });

  it('minimizada ou escondida na bandeja, não manda nada para o renderer', () => {
    const win = fakeWindow();
    const manager = managerWith(win);

    win.minimized = true;
    expect(manager.sendMetrics({ cpu: 1 })).toBe(false);
    win.minimized = false;
    win.visible = false;
    expect(manager.sendMetrics({ cpu: 2 })).toBe(false);
    expect(win.webContents.send).not.toHaveBeenCalled();
  });

  it('ao restaurar, entrega na hora a leitura mais recente (sem esperar o próximo ciclo)', () => {
    const win = fakeWindow();
    const manager = managerWith(win);
    win.minimized = true;
    manager.sendMetrics({ cpu: 1 });
    manager.sendMetrics({ cpu: 2 });

    win.minimized = false;
    win.emit('restore');
    expect(win.sent).toEqual([['metrics:update', { cpu: 2 }]]);

    win.visible = false;
    manager.sendMetrics({ cpu: 3 });
    win.visible = true;
    win.emit('show');
    expect(win.sent.at(-1)).toEqual(['metrics:update', { cpu: 3 }]);
  });

  it('o mini-widget continua recebendo (fica sempre à vista)', () => {
    const win = fakeWindow();
    const manager = managerWith(win);
    manager.isMiniWidget = true;
    expect(manager.sendMetrics({ cpu: 1 })).toBe(true);
  });

  it('sem janela (fechada para a bandeja), só guarda a leitura', () => {
    const manager = new WindowManager({});
    expect(manager.sendMetrics({ cpu: 1 })).toBe(false);
    expect(manager.lastMetrics).toEqual({ cpu: 1 });
    expect(() => manager.flushMetrics()).not.toThrow();
  });

  it('outros eventos (relatório de sessão, atualizações) continuam chegando com a janela minimizada', () => {
    const win = fakeWindow();
    const manager = managerWith(win);
    win.minimized = true;
    manager.send('updates:state', { status: 'downloaded' });
    expect(win.sent).toEqual([['updates:state', { status: 'downloaded' }]]);
  });
});
