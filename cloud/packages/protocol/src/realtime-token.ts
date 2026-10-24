import { SignJWT, jwtVerify } from 'jose';

/**
 * Token curto que o site entrega ao navegador para conectar no servidor de tempo real (outro domínio,
 * sem acesso ao cookie de sessão). HS256 com REALTIME_JWT_SECRET, igual nos dois serviços.
 */
export const REALTIME_TOKEN = {
  issuer: 'pc-tensor-web',
  audience: 'pc-tensor-realtime',
  ttlSeconds: 300,
} as const;

function key(secret: string): Uint8Array {
  if (secret.length < 32) throw new Error('REALTIME_JWT_SECRET precisa de pelo menos 32 caracteres.');
  return new TextEncoder().encode(secret);
}

export async function signRealtimeToken(userId: string, secret: string, now = Date.now()): Promise<string> {
  const iat = Math.floor(now / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuer(REALTIME_TOKEN.issuer)
    .setAudience(REALTIME_TOKEN.audience)
    .setIssuedAt(iat)
    .setExpirationTime(iat + REALTIME_TOKEN.ttlSeconds)
    .sign(key(secret));
}

/** Devolve o userId, ou null se o token for inválido, de outro emissor ou estiver vencido. */
export async function verifyRealtimeToken(token: string, secret: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, key(secret), {
      issuer: REALTIME_TOKEN.issuer,
      audience: REALTIME_TOKEN.audience,
      algorithms: ['HS256'],
    });
    return typeof payload.sub === 'string' && payload.sub.length > 0 ? payload.sub : null;
  } catch {
    return null;
  }
}
