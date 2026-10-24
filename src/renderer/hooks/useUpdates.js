import { useEffect, useState } from 'react';
import { getTransport } from '../lib/transport';

/** Estado da verificação de atualizações (só no app do PC; no celular devolve null). */
export function useUpdates() {
  const transport = getTransport();
  const [state, setState] = useState(null);

  useEffect(() => {
    if (!transport.capabilities.updates) return undefined;
    let active = true;
    transport.getUpdateState().then((s) => active && setState(s));
    const unsubscribe = transport.subscribeUpdates(setState);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [transport]);

  const check = async () => setState(await transport.checkForUpdates());
  const install = () => transport.installUpdate();

  return { state, check, install };
}

/** Texto de uma linha para cada estado do UpdateService. */
export function describeUpdateState(state) {
  switch (state?.status) {
    case 'unsupported':
      return 'Disponível no app instalado';
    case 'checking':
      return 'Procurando atualizações…';
    case 'downloading':
      return `Baixando a versão ${state.availableVersion || 'nova'} (${state.percent ?? 0}%)`;
    case 'downloaded':
      return `Versão ${state.availableVersion} pronta para instalar`;
    case 'up-to-date':
      return 'Você está usando a versão mais recente';
    case 'error':
      return state.error;
    default:
      return 'Verifica sempre que o app abre';
  }
}
