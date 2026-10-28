import { describe, it, expect, vi } from 'vitest';
const { SensorDriverProbe, PAWNIO_KEY } = require('../../../src/main/telemetry/sensor-driver');

/** execFile simulado: responde como o `reg query` (erro = chave inexistente). */
const fakeReg = (found) =>
  vi.fn((_cmd, _args, _opts, callback) => setImmediate(() => callback(found ? null : new Error('exit 1'))));

const settle = () => new Promise((resolve) => setImmediate(resolve));

describe('SensorDriverProbe', () => {
  it('consulta a entrada do PawnIO no registro de 64 bits', async () => {
    const execFileFn = fakeReg(true);
    const probe = new SensorDriverProbe({ execFileFn, platform: 'win32' });

    probe.refresh(1000);
    await settle();

    expect(execFileFn).toHaveBeenCalledWith(
      'reg',
      ['query', PAWNIO_KEY, '/v', 'DisplayVersion', '/reg:64'],
      { windowsHide: true },
      expect.any(Function),
    );
    expect(probe.installed).toBe(true);
  });

  it('sem o driver, confere de novo só depois do intervalo e para quando ele aparece', async () => {
    const execFileFn = fakeReg(false);
    const probe = new SensorDriverProbe({ execFileFn, platform: 'win32', recheckMs: 60_000 });

    probe.refresh(1000);
    await settle();
    expect(probe.installed).toBe(false);

    probe.refresh(30_000);
    expect(execFileFn).toHaveBeenCalledTimes(1);

    execFileFn.mockImplementation((_cmd, _args, _opts, callback) => setImmediate(() => callback(null)));
    probe.refresh(62_000);
    await settle();
    expect(probe.installed).toBe(true);

    probe.refresh(200_000);
    expect(execFileFn).toHaveBeenCalledTimes(2);
  });

  it('fora do Windows não consulta nada e fica como não verificado', () => {
    const execFileFn = fakeReg(true);
    const probe = new SensorDriverProbe({ execFileFn, platform: 'linux' });

    probe.refresh(1000);

    expect(execFileFn).not.toHaveBeenCalled();
    expect(probe.installed).toBeNull();
  });
});
