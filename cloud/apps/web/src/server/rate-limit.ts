import { tooManyRequests } from './errors';

/**
 * Limite de tentativas por chave (IP, e-mail) em janela deslizante, em memória.
 * Vale por instância do servidor: com várias instâncias, troque por um contador no Redis ou no
 * provedor (ex.: Vercel Firewall). Para login e pareamento isso já torna força bruta inviável.
 */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Conta uma tentativa; lança 429 se passar do limite. */
  consume(key: string): void {
    const now = this.now();
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.limit) {
      const retryAfterS = Math.ceil((this.windowMs - (now - recent[0]!)) / 1000);
      this.hits.set(key, recent);
      throw tooManyRequests(retryAfterS);
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 50_000) this.prune(now);
  }

  private prune(now: number): void {
    for (const [key, times] of this.hits) {
      if (times.every((t) => now - t >= this.windowMs)) this.hits.delete(key);
    }
  }
}

export const limits = {
  /** Login e cadastro: 10 por minuto por IP. */
  auth: new RateLimiter(10, 60_000),
  /** Troca de código de pareamento: 10 por minuto por IP (1 milhão de códigos, 5 min de validade). */
  pair: new RateLimiter(10, 60_000),
  /** "Esqueci minha senha": 3 por hora por e-mail. */
  passwordReset: new RateLimiter(3, 60 * 60_000),
};
