// Endereço do servidor Sentinel no modo web (navegador, sem window.sentinelAPI).
// Porta e token vêm da URL (?port=3891&token=...) porque o servidor pode cair
// em uma porta alternativa e toda a API exige o token de sessão.
const params = new URLSearchParams(window.location.search);

export const backendHost = window.location.hostname || '127.0.0.1';
export const backendPort = params.get('port') || '3890';
export const sessionToken = params.get('token') || '';

export function backendUrl(pathname) {
  return `http://${backendHost}:${backendPort}${pathname}`;
}

export function backendWsUrl() {
  const query = sessionToken ? `/?token=${encodeURIComponent(sessionToken)}` : '';
  return `ws://${backendHost}:${backendPort}${query}`;
}

export function authHeaders(extra = {}) {
  return sessionToken ? { ...extra, Authorization: `Bearer ${sessionToken}` } : extra;
}
