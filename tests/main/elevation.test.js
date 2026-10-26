import { describe, it, expect } from 'vitest';
const { shouldAutoElevate, ELEVATED_RELAUNCH_FLAG } = require('../../src/main/system');
const pkg = require('../../package.json');

describe('elevação do app instalado', () => {
  it('não marca o executável como requireAdministrator (o Chromium não cria GPU/renderer e o app fecha)', () => {
    expect(pkg.build.win.requestedExecutionLevel ?? 'asInvoker').not.toBe('requireAdministrator');
  });

  it('pede o UAC só no app instalado no Windows, sem administrador', () => {
    const base = { isPackaged: true, platform: 'win32', isElevated: false, argv: ['PC Sentinel.exe'] };
    expect(shouldAutoElevate(base)).toBe(true);
    expect(shouldAutoElevate({ ...base, isElevated: true })).toBe(false);
    expect(shouldAutoElevate({ ...base, isPackaged: false })).toBe(false);
    expect(shouldAutoElevate({ ...base, platform: 'linux' })).toBe(false);
  });

  it('nunca pede de novo na cópia aberta pelo próprio pedido de UAC (sem loop)', () => {
    expect(
      shouldAutoElevate({
        isPackaged: true,
        platform: 'win32',
        isElevated: false,
        argv: ['PC Sentinel.exe', ELEVATED_RELAUNCH_FLAG],
      }),
    ).toBe(false);
  });
});
