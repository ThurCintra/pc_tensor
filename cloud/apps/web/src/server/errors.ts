/** Erro com status HTTP e mensagem segura para mostrar ao usuário. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const badRequest = (message: string, code = 'BAD_REQUEST') => new ApiError(400, code, message);
export const unauthorized = (message = 'Entre na sua conta para continuar.') =>
  new ApiError(401, 'UNAUTHORIZED', message);
/** 404 também para recursos de outro usuário: não revela que o ID existe. */
export const notFound = (message = 'Não encontrado.') => new ApiError(404, 'NOT_FOUND', message);
export const conflict = (message: string, code = 'CONFLICT') => new ApiError(409, code, message);
export const tooManyRequests = (retryAfterS: number) =>
  new ApiError(429, 'RATE_LIMITED', `Muitas tentativas. Tente de novo em ${retryAfterS} s.`);
