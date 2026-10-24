import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { ApiError, badRequest, unauthorized } from './errors';

/** Lê e valida o corpo JSON; erros de validação viram 400 com a primeira mensagem legível. */
export async function readJson<T extends z.ZodType>(request: Request, schema: T): Promise<z.infer<T>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw badRequest('Corpo da requisição não é JSON válido.');
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? 'Dados inválidos.', 'VALIDATION_ERROR');
  return parsed.data;
}

/** IP do cliente atrás do proxy da hospedagem (Vercel/Render preenchem x-forwarded-for). */
export function clientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'desconhecido'
  );
}

type Handler<C> = (request: NextRequest, context: C) => Promise<Response>;

/**
 * Envolve um handler: ApiError vira JSON com o status certo; qualquer outro erro vira 500 sem vazar detalhes.
 * Formato de erro: { error: { code, message } }.
 */
export function route<C>(handler: Handler<C>): Handler<C> {
  return async (request, context) => {
    try {
      return await handler(request, context);
    } catch (err) {
      if (err instanceof ApiError) {
        const headers = err.status === 429 ? { 'Retry-After': err.message.match(/(\d+) s/)?.[1] ?? '60' } : undefined;
        return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status, headers });
      }
      if (err instanceof z.ZodError) {
        return NextResponse.json(
          { error: { code: 'VALIDATION_ERROR', message: err.issues[0]?.message ?? 'Dados inválidos.' } },
          { status: 400 },
        );
      }
      console.error('[api]', request.method, request.nextUrl.pathname, err);
      return NextResponse.json(
        { error: { code: 'INTERNAL', message: 'Erro interno. Tente de novo.' } },
        { status: 500 },
      );
    }
  };
}

/** userId da sessão do Auth.js, ou 401. */
export async function requireUserId(getSession: () => Promise<{ user?: { id?: string } } | null>): Promise<string> {
  const session = await getSession();
  const id = session?.user?.id;
  if (!id) throw unauthorized();
  return id;
}
