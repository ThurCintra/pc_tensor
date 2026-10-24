import type { Profile } from '@pc-tensor/protocol';

/** Últimos sinais de vida de um agente, para decidir se a queda foi um travamento. */
export interface LastActivity {
  at: number;
  profile: Profile | null;
  cpuLoadPct: number | null;
  gpuLoadPct: number | null;
  maxTempC: number | null;
}

/**
 * Motivos de desconexão do Socket.IO que indicam conexão cortada sem despedida. "client namespace
 * disconnect" (o agente encerrou) e os motivos do lado do servidor são saídas normais.
 */
const ABRUPT_REASONS = new Set(['transport close', 'ping timeout', 'transport error']);

const UNDER_LOAD_PCT = 50;
const ACTIVITY_WINDOW_MS = 90_000;

export interface CrashAssessment {
  suspected: boolean;
  reason: string;
}

/**
 * Queda abrupta "sob carga" = travamento ou tela azul provável: a conexão caiu sem despedida e, logo antes,
 * o PC estava em jogo ou com CPU/GPU acima de 50%. O servidor ainda espera um tempo de tolerância antes de
 * registrar (um Wi-Fi que piscou reconecta em segundos).
 */
export function assessDisconnect(reason: string, last: LastActivity | null, now: number): CrashAssessment {
  if (!ABRUPT_REASONS.has(reason)) return { suspected: false, reason: 'desconexão normal' };
  if (!last || now - last.at > ACTIVITY_WINDOW_MS) return { suspected: false, reason: 'sem atividade recente' };

  const gaming = last.profile === 'COMPETITIVE_FPS' || last.profile === 'AAA_GAMING';
  const loaded = (last.cpuLoadPct ?? 0) >= UNDER_LOAD_PCT || (last.gpuLoadPct ?? 0) >= UNDER_LOAD_PCT;
  if (!gaming && !loaded) return { suspected: false, reason: 'PC ocioso' };

  return { suspected: true, reason: gaming ? 'queda durante jogo' : 'queda sob carga' };
}
