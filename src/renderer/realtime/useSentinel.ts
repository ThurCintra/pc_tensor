import { useEffect, useSyncExternalStore } from 'react';
import { resolveEndpoint } from './endpoint';
import { SentinelStore, type SentinelState } from './sentinel-store';

/** Uma conexão por aba, compartilhada por todos os componentes. */
let sharedStore: SentinelStore | null = null;
let consumers = 0;

export function getSentinelStore(): SentinelStore {
  sharedStore ??= new SentinelStore();
  return sharedStore;
}

/**
 * Estado ao vivo do serviço nativo (telemetria, alertas, caixa preta) e as ações do contrato v2.
 * O primeiro componente que usa o hook conecta; quando o último desmonta, a conexão é encerrada.
 */
export function useSentinel(): SentinelState & { store: SentinelStore } {
  const store = getSentinelStore();
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);

  useEffect(() => {
    consumers++;
    let cancelled = false;
    if (consumers === 1) {
      void resolveEndpoint().then((endpoint) => {
        if (!cancelled && endpoint) void store.start(endpoint);
      });
    }

    // Fechar ou recarregar a aba é encerramento limpo: a gravação ao vivo não vira relatório.
    // Se o navegador restaurar a página do cache (voltar/avançar), reconecta.
    const onPageHide = () => store.stop();
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) void resolveEndpoint().then((endpoint) => endpoint && store.start(endpoint));
    };
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      cancelled = true;
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('pageshow', onPageShow);
      consumers--;
      if (consumers === 0) store.stop();
    };
  }, [store]);

  return { ...state, store };
}
