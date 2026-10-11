import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

interface ErrorBody {
  error: {
    code: string;
    message: string;
  };
}

function sendError(reply: FastifyReply, statusCode: number, code: string, message: string): void {
  const body: ErrorBody = { error: { code, message } };
  void reply.status(statusCode).send(body);
}

export function errorHandler(
  error: FastifyError | AppError | Error,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  if (error instanceof AppError) {
    request.log.warn({ code: error.code }, error.message);
    sendError(reply, error.statusCode, error.code, error.message);
    return;
  }

  const fastifyError = error as FastifyError;
  if (fastifyError.code === 'FST_ERR_VALIDATION') {
    request.log.warn('Request validation failed');
    sendError(reply, 400, 'VALIDATION_ERROR', 'Invalid request payload');
    return;
  }

  if (fastifyError.statusCode === 429) {
    sendError(reply, 429, 'RATE_LIMITED', 'Too many requests');
    return;
  }

  if (fastifyError.statusCode === 404) {
    sendError(reply, 404, 'NOT_FOUND', 'Route not found');
    return;
  }

  request.log.error(error);
  sendError(reply, 500, 'INTERNAL_ERROR', 'Internal server error');
}
