/**
 * Onde está o serviço nativo e qual token usar.
 * - desktop (Electron): o processo principal informa (window.sentinelAPI.getServiceEndpoint).
 * - celular/navegador: mesmo host da página, porta 3891 (ou ?servicePort=), token do link do QR Code.
 */

export interface ServiceEndpoint {
  url: string;
  token: string;
}

export const DEFAULT_SERVICE_PORT = 3891;

/** Mesma chave usada por lib/transport.js para guardar o token de pareamento. */
const TOKEN_STORAGE_KEY = 'pc-sentinel-token';

interface DesktopBridge {
  getServiceEndpoint?: () => Promise<ServiceEndpoint | null>;
}

export async function resolveEndpoint(win: Window = window): Promise<ServiceEndpoint | null> {
  const bridge = (win as Window & { sentinelAPI?: DesktopBridge }).sentinelAPI;
  if (bridge?.getServiceEndpoint) return bridge.getServiceEndpoint();

  const params = new URLSearchParams(win.location.search);
  let token = params.get('token');
  if (!token) {
    try {
      token = win.localStorage.getItem(TOKEN_STORAGE_KEY);
    } catch {
      token = null;
    }
  }
  if (!token) return null;

  const port = Number(params.get('servicePort')) || DEFAULT_SERVICE_PORT;
  const protocol = win.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return { url: `${protocol}//${win.location.hostname}:${port}/ws`, token };
}
