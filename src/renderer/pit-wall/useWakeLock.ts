import { useEffect, useRef, useState } from 'react';

/**
 * unsupported: o navegador não tem a API (ex.: Firefox antigo, página sem HTTPS fora do localhost);
 * idle: não está segurando a tela; active: a tela não apaga; denied: o navegador recusou (bateria fraca etc.).
 */
export type WakeLockStatus = 'unsupported' | 'idle' | 'active' | 'denied';

interface WakeLockSentinelLike {
  released: boolean;
  release(): Promise<void>;
  addEventListener(type: 'release', listener: () => void): void;
}

interface WakeLockLike {
  request(type: 'screen'): Promise<WakeLockSentinelLike>;
}

function getWakeLock(): WakeLockLike | null {
  const nav = typeof navigator === 'undefined' ? null : (navigator as Navigator & { wakeLock?: WakeLockLike });
  return nav?.wakeLock ?? null;
}

/**
 * Screen Wake Lock: com o Pit Wall aberto num celular de mesa, a tela não apaga sozinha.
 * Adquire quando `enabled` é verdadeiro, solta ao desmontar ou desligar, e readquire quando a aba volta a ficar
 * visível (o navegador solta o lock sozinho quando a aba some ou a tela é bloqueada). Sem suporte, não faz nada.
 */
export function useWakeLock(enabled: boolean): WakeLockStatus {
  const [status, setStatus] = useState<WakeLockStatus>(() => (getWakeLock() ? 'idle' : 'unsupported'));
  const sentinel = useRef<WakeLockSentinelLike | null>(null);

  useEffect(() => {
    const api = getWakeLock();
    if (!api || !enabled) return undefined;
    let active = true;

    const acquire = async () => {
      if (!active || document.visibilityState !== 'visible') return;
      if (sentinel.current && !sentinel.current.released) return;
      try {
        const lock = await api.request('screen');
        if (!active) {
          await lock.release().catch(() => {});
          return;
        }
        sentinel.current = lock;
        setStatus('active');
        lock.addEventListener('release', () => {
          if (sentinel.current === lock) sentinel.current = null;
          if (active) setStatus('idle');
        });
      } catch {
        // Recusado (economia de bateria, aba sem foco): tenta de novo quando a aba voltar a ficar visível
        if (active) setStatus('denied');
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void acquire();
    };

    void acquire();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', onVisibility);
      const lock = sentinel.current;
      sentinel.current = null;
      if (lock && !lock.released) void lock.release().catch(() => {});
      setStatus('idle');
    };
  }, [enabled]);

  return status;
}

/** Deslocamentos do modo OLED: um quadrado de 1 px, um passo por minuto, sem nunca sair do lugar de verdade. */
export const OLED_SHIFTS: readonly (readonly [number, number])[] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];

/**
 * Proteção OLED: com o celular parado como HUD, os mesmos pixels acesos por horas marcam a tela (burn-in).
 * Move todo o conteúdo 1 px a cada `intervalMs`, num ciclo de 4 posições, imperceptível de perto.
 */
export function useOledShift(enabled: boolean, intervalMs = 60_000): readonly [number, number] {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!enabled) return undefined;
    const timer = setInterval(() => setStep((s) => (s + 1) % OLED_SHIFTS.length), intervalMs);
    return () => {
      clearInterval(timer);
      setStep(0);
    };
  }, [enabled, intervalMs]);

  return enabled ? OLED_SHIFTS[step]! : OLED_SHIFTS[0]!;
}

/** Preferência guardada neste aparelho (cada celular decide a sua). */
export function usePersistentToggle(key: string, initial: boolean): [boolean, (value: boolean) => void] {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored === null ? initial : stored === 'on';
    } catch {
      return initial;
    }
  });
  const update = (next: boolean) => {
    setValue(next);
    try {
      localStorage.setItem(key, next ? 'on' : 'off');
    } catch {
      // armazenamento bloqueado: vale só nesta sessão
    }
  };
  return [value, update];
}
