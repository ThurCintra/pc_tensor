/** Erro da API com a mensagem em português que o servidor devolveu ({ error: { code, message } }). */
export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

/** fetch para as rotas /api do próprio site, com JSON e erros legíveis. */
export async function apiFetch<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method ?? 'GET',
      headers: options.body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
      cache: 'no-store',
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiRequestError('Sem conexão com o servidor. Verifique a internet.', 0, null);
  }

  if (response.status === 204) return undefined as T;
  const data = (await response.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
  if (!response.ok) {
    if (response.status === 401 && typeof window !== 'undefined' && !path.startsWith('/api/auth')) {
      window.location.href = '/entrar';
    }
    throw new ApiRequestError(
      data?.error?.message ?? `Erro ${response.status}.`,
      response.status,
      data?.error?.code ?? null,
    );
  }
  return data as T;
}
