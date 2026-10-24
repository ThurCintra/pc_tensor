import { describe, it, expect, vi, afterEach } from 'vitest';
const EventEmitter = require('events');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { ServiceProcess } = require('../../src/main/service-process');

function fakeChild() {
  const child = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn();
  return child;
}

function setup() {
  const exe = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pcs-')), 'pc-sentinel-service.exe');
  fs.writeFileSync(exe, '');
  const children = [];
  const spawnFn = vi.fn(() => {
    const child = fakeChild();
    children.push(child);
    return child;
  });
  const log = { warn: vi.fn(), error: vi.fn() };
  const service = new ServiceProcess({ dataDir: 'C:/dados', candidates: ['C:/nao/existe.exe', exe], spawnFn, log });
  return { service, spawnFn, children, exe, log };
}

describe('ServiceProcess', () => {
  afterEach(() => vi.useRealTimers());

  it('inicia o primeiro executável encontrado com porta e pasta de dados', () => {
    const { service, spawnFn, exe } = setup();
    service.start();

    expect(spawnFn).toHaveBeenCalledWith(
      exe,
      ['--Port', '3891', '--DataDir', 'C:/dados', '--ParentPid', String(process.pid)],
      expect.objectContaining({ windowsHide: true }),
    );
    expect(service.available).toBe(true);
  });

  it('entre dois executáveis, usa o compilado mais recentemente', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcs-'));
    const published = path.join(dir, 'publicado.exe');
    const debug = path.join(dir, 'debug.exe');
    fs.writeFileSync(published, '');
    fs.writeFileSync(debug, '');
    fs.utimesSync(published, new Date('2026-10-24T13:00:00'), new Date('2026-10-24T13:00:00'));
    fs.utimesSync(debug, new Date('2026-10-24T18:00:00'), new Date('2026-10-24T18:00:00'));

    const service = new ServiceProcess({ dataDir: 'x', candidates: [published, debug] });
    expect(service.executable).toBe(debug);
  });

  it('reinicia com espera crescente se o serviço cair', () => {
    vi.useFakeTimers();
    const { service, spawnFn, children } = setup();
    service.start();

    children[0].emit('exit', 1);
    vi.advanceTimersByTime(999);
    expect(spawnFn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(spawnFn).toHaveBeenCalledTimes(2);

    children[1].emit('exit', 1);
    vi.advanceTimersByTime(1000);
    expect(spawnFn).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(2000);
    expect(spawnFn).toHaveBeenCalledTimes(3);
  });

  it('stop() encerra o processo e não reinicia', () => {
    vi.useFakeTimers();
    const { service, spawnFn, children } = setup();
    service.start();
    service.stop();
    children[0].emit('exit', null);
    vi.advanceTimersByTime(60_000);

    expect(children[0].kill).toHaveBeenCalled();
    expect(spawnFn).toHaveBeenCalledTimes(1);
  });

  it('sem executável só avisa', () => {
    const spawnFn = vi.fn();
    const log = { warn: vi.fn(), error: vi.fn() };
    const service = new ServiceProcess({ dataDir: 'x', candidates: ['C:/nao/existe.exe'], spawnFn, log });
    service.start();

    expect(service.available).toBe(false);
    expect(spawnFn).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalled();
  });
});
