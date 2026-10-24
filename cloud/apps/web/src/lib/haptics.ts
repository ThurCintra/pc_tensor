import type { AlertType, Profile } from '@pc-tensor/protocol';
import type { TelemetryFrame } from './telemetry';

/**
 * Alertas hápticos no celular: cada situação tem um padrão de vibração diferente, para reconhecer pelo toque,
 * sem olhar a tela, o que está acontecendo no PC durante o jogo. Android vibra; iPhone/Safari não expõe a API.
 */
export type HapticKind = 'CRITICAL_TEMP' | 'PREDICTIVE_THROTTLE' | 'PACKET_LOSS' | 'CRASH';

export const HAPTIC_PATTERNS: Readonly<Record<HapticKind, readonly number[]>> = {
  PACKET_LOSS: [100, 50, 100], // 2 curtas: rede
  PREDICTIVE_THROTTLE: [300, 100, 300, 100, 300], // 3 médias: vai esquentar
  CRITICAL_TEMP: [800, 200, 800], // 2 longas: passou do limite
  CRASH: [1000, 300, 1000, 300, 1000], // 3 longas: o PC caiu
};

/** Avisos que só valem com um jogo em foco (fora dele, perda de pacote não incomoda ninguém). */
const GAMING_ONLY: ReadonlySet<HapticKind> = new Set(['PACKET_LOSS', 'PREDICTIVE_THROTTLE']);
const GAMING: ReadonlySet<Profile> = new Set(['COMPETITIVE_FPS', 'AAA_GAMING']);

/** O mesmo aviso não vibra de novo antes disso (os quadros chegam 4 vezes por segundo). */
export const HAPTIC_COOLDOWN_MS = 30_000;
/** Perda de pacotes a partir da qual o jogo começa a "teleportar". */
export const PACKET_LOSS_PCT = 2;
/** Segundos até o throttling a partir dos quais o aviso preditivo vibra. */
export const THROTTLE_WARNING_S = 30;

const PREF_KEY = 'pc-tensor-haptics';

/** Situações do quadro que merecem vibrar, da mais grave para a mais leve. */
export function hapticsForFrame(frame: TelemetryFrame, limits: { cpuC: number; gpuC: number }): HapticKind[] {
  const kinds: HapticKind[] = [];
  const hot =
    (frame.cpu.tempC !== null && frame.cpu.tempC >= limits.cpuC) ||
    (frame.gpu.tempC !== null && frame.gpu.tempC >= limits.gpuC);
  if (hot) kinds.push('CRITICAL_TEMP');
  const soon = [frame.cpu.thermal.timeToThrottleS, frame.gpu.thermal.timeToThrottleS].some(
    (s) => s !== null && s < THROTTLE_WARNING_S,
  );
  if (!hot && soon) kinds.push('PREDICTIVE_THROTTLE');
  if (frame.network.lossPct !== null && frame.network.lossPct >= PACKET_LOSS_PCT) kinds.push('PACKET_LOSS');
  return kinds;
}

/** Alerta gravado no servidor → vibração correspondente. */
export function hapticForAlert(type: AlertType): HapticKind | null {
  switch (type) {
    case 'OVERHEAT':
      return 'CRITICAL_TEMP';
    case 'PREDICTIVE_THROTTLE':
      return 'PREDICTIVE_THROTTLE';
    case 'ABRUPT_CRASH':
      return 'CRASH';
    default:
      return null; // DUST_WARNING não é urgente
  }
}

export interface HapticServiceOptions {
  vibrate?: ((pattern: number[]) => boolean) | null;
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null;
  now?: () => number;
}

export class HapticService {
  private readonly vibrateFn: ((pattern: number[]) => boolean) | null;
  private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | null;
  private readonly now: () => number;
  private readonly lastFired = new Map<HapticKind, number>();
  private _enabled: boolean;

  constructor(options: HapticServiceOptions = {}) {
    this.vibrateFn =
      options.vibrate !== undefined
        ? options.vibrate
        : typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
          ? (pattern) => navigator.vibrate(pattern)
          : null;
    this.storage = options.storage !== undefined ? options.storage : safeLocalStorage();
    this.now = options.now ?? Date.now;
    this._enabled = this.read() !== 'off';
  }

  get supported(): boolean {
    return this.vibrateFn !== null;
  }

  get enabled(): boolean {
    return this._enabled;
  }

  setEnabled(enabled: boolean): void {
    this._enabled = enabled;
    try {
      this.storage?.setItem(PREF_KEY, enabled ? 'on' : 'off');
    } catch {
      // armazenamento bloqueado (aba anônima): a preferência vale só nesta sessão
    }
  }

  /** Vibra o padrão do aviso, respeitando perfil e intervalo. Devolve o padrão usado, ou null. */
  notify(kind: HapticKind, profile: Profile | null): readonly number[] | null {
    if (!this._enabled || !this.vibrateFn) return null;
    if (GAMING_ONLY.has(kind) && !(profile && GAMING.has(profile))) return null;

    const now = this.now();
    const last = this.lastFired.get(kind);
    if (last !== undefined && now - last < HAPTIC_COOLDOWN_MS) return null;

    const pattern = HAPTIC_PATTERNS[kind];
    if (!this.vibrateFn([...pattern])) return null; // navegador recusou (ex.: ainda sem toque na página)
    this.lastFired.set(kind, now);
    return pattern;
  }

  private read(): string | null {
    try {
      return this.storage?.getItem(PREF_KEY) ?? null;
    } catch {
      return null;
    }
  }
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
