const { ProcessIconCache } = require('../../src/main/process-icons');

const image = (url) => ({ isEmpty: () => !url, toDataURL: () => url });

describe('ProcessIconCache', () => {
  const paths = { 10: 'C:\\Apps\\Jogo.exe', 11: 'c:\\apps\\JOGO.EXE', 12: null };
  const setup = (getFileIcon = vi.fn(async () => image('data:image/png;base64,AAA'))) => {
    const cache = new ProcessIconCache({ getExecutablePath: (pid) => paths[pid] ?? null, getFileIcon });
    return { cache, getFileIcon };
  };

  it('extrai o ícone do executável do processo e reaproveita para o mesmo .exe', async () => {
    const { cache, getFileIcon } = setup();
    expect(await cache.get(10)).toBe('data:image/png;base64,AAA');
    expect(await cache.get(11)).toBe('data:image/png;base64,AAA');
    expect(getFileIcon).toHaveBeenCalledTimes(1);
    expect(getFileIcon).toHaveBeenCalledWith('C:\\Apps\\Jogo.exe');
  });

  it('não lê nada para processos fora da lista, do sistema ou com PID inválido', async () => {
    const { cache, getFileIcon } = setup();
    expect(await cache.get(12)).toBeNull();
    expect(await cache.get(999)).toBeNull();
    expect(await cache.get('C:\\Windows\\notepad.exe')).toBeNull();
    expect(getFileIcon).not.toHaveBeenCalled();
  });

  it('devolve null se o Windows não tiver ícone ou a extração falhar', async () => {
    expect(await setup(vi.fn(async () => image(''))).cache.get(10)).toBeNull();
    expect(
      await setup(
        vi.fn(async () => {
          throw new Error('sem acesso');
        }),
      ).cache.get(10),
    ).toBeNull();
  });
});
