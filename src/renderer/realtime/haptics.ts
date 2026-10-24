import type { AlertData, AlertKind, Profile } from './protocol';

/**
 * "Código Morse de hardware": cada tipo de alerta tem um padrão de vibração diferente, para o usuário
 * reconhecer pelo toque, sem olhar o celular, o que está acontecendo no PC durante o jogo.
 */
export const HAPTIC_PATTERNS: Readonly<Partial<Record<AlertKind, readonly number[]>>> = {
  NETWORK_SPIKE: [100, 50, 100], // 2 curtas: rede
  PREDICTIVE_THROTTLE: [300, 100, 300, 100, 300], // 3 médias: vai esquentar
  THROTTLING: [800, 200, 800], // longa: crítico
};

/** Perfis em que o usuário está jogando (fora deles o celular não vibra). */
const GAMING_PROFILES: ReadonlySet<Profile> = new Set(['COMPETITIVE_FPS', 'AAA_GRAPHICS']);

/** O mesmo tipo de alerta não vibra de novo antes disso (evita o celular "zumbir" sem parar). */
const COOLDOWN_MS = 5000;

const PREF_KEY = 'pc-sentinel-haptics';

export interface HapticServiceOptions {
  vibrate?: ((pattern: number[]) => boolean) | null;
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null;
  now?: () => number;
}

export class HapticService {
  private readonly vibrateFn: ((pattern: number[]) => boolean) | null;
  private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | null;
  private readonly now: () => number;
  private readonly lastFired = new Map<AlertKind, number>();
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

  /** O aparelho tem motor de vibração acessível (Android sim; iPhone/Safari não expõe a API). */
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

  /**
   * Vibra conforme o alerta. Crítico (THROTTLING) vibra em qualquer perfil; os demais só com um jogo em foco.
   * Devolve o padrão usado, ou null se não vibrou.
   */
  notify(alert: Pick<AlertData, 'kind' | 'severity'>, profile: Profile | null): readonly number[] | null {
    const pattern = HAPTIC_PATTERNS[alert.kind];
    if (!pattern || !this._enabled || !this.vibrateFn) return null;
    if (alert.severity !== 'critical' && !(profile && GAMING_PROFILES.has(profile))) return null;

    const now = this.now();
    const last = this.lastFired.get(alert.kind);
    if (last !== undefined && now - last < COOLDOWN_MS) return null;

    if (!this.vibrateFn([...pattern])) return null; // navegador recusou (ex.: sem interação do usuário ainda)
    this.lastFired.set(alert.kind, now);
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
