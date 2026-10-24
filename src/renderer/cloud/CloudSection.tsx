import { useEffect, useState, type FormEvent } from 'react';
import { useSentinel } from '../realtime/useSentinel';
import type { CloudStatus } from '../realtime/protocol';

const STATE_TEXT: Record<CloudStatus['state'], string> = {
  UNPAIRED: 'Este PC não está vinculado a uma conta.',
  CONNECTING: 'Conectando à nuvem…',
  CONNECTED: 'Conectado',
  OFFLINE: 'Sem conexão com a nuvem; tentando de novo',
  UNAUTHORIZED: 'Este PC foi removido da conta no site. Vincule de novo.',
};

const API_URL_KEY = 'pc-sentinel-cloud-url';

function readSavedUrl(): string {
  try {
    return window.localStorage.getItem(API_URL_KEY) ?? '';
  } catch {
    return '';
  }
}

/**
 * Configurações → pc_tensor Cloud: vincula este PC à conta do site com o código de 6 dígitos (uma vez) e
 * mostra o estado da conexão. O pedido vai para o serviço nativo, que guarda o token cifrado (DPAPI).
 */
export function CloudSection() {
  const { store, status: connection } = useSentinel();
  const [cloud, setCloud] = useState<CloudStatus | null>(null);
  const [apiUrl, setApiUrl] = useState(readSavedUrl);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // O estado da nuvem muda sozinho (reconexões, modo ao vivo): consulta a cada 3 s enquanto a tela está aberta
  useEffect(() => {
    if (connection !== 'online') return undefined;
    let active = true;
    const refresh = () =>
      store
        .send('CLOUD_STATUS', {})
        .then((s) => active && setCloud(s))
        .catch(() => undefined);
    refresh();
    const timer = window.setInterval(refresh, 3000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [store, connection]);

  const pair = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const url = apiUrl.trim().replace(/\/$/, '');
      setCloud(await store.send('CLOUD_PAIR', { code: code.trim(), apiUrl: url }));
      setCode('');
      try {
        window.localStorage.setItem(API_URL_KEY, url);
      } catch {
        // sem armazenamento: só não lembra o endereço
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível vincular.');
    } finally {
      setBusy(false);
    }
  };

  const unpair = async () => {
    setBusy(true);
    try {
      setCloud(await store.send('CLOUD_UNPAIR', {}));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível desvincular.');
    } finally {
      setBusy(false);
    }
  };

  if (connection !== 'online' || !cloud) {
    return <p className="setting-desc">Aguardando o serviço de telemetria do PC…</p>;
  }

  const paired = cloud.state !== 'UNPAIRED' && cloud.state !== 'UNAUTHORIZED';
  const description =
    cloud.state === 'CONNECTED'
      ? `${STATE_TEXT.CONNECTED} a ${cloud.apiUrl} · ${cloud.mode === 'LIVE' ? 'alguém está vendo ao vivo' : 'enviando um resumo por minuto'}`
      : cloud.state === 'OFFLINE' && cloud.lastError
        ? `${STATE_TEXT.OFFLINE} (${cloud.lastError})`
        : STATE_TEXT[cloud.state];

  return (
    <div>
      <div className="setting">
        <div className="setting-text">
          <div>Conta na nuvem</div>
          <div className="setting-desc">{description}</div>
        </div>
        {paired && (
          <button className="btn" onClick={unpair} disabled={busy}>
            Desvincular
          </button>
        )}
      </div>

      {!paired && (
        <form className="setting" style={{ display: 'block' }} onSubmit={pair}>
          <div className="setting-desc" style={{ marginBottom: 8 }}>
            No site, abra <b>Meus Computadores → Adicionar computador</b> e digite aqui o código de 6 dígitos.
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <input
              className="input"
              style={{ flex: '2 1 220px' }}
              type="url"
              placeholder="https://endereço-do-site"
              aria-label="Endereço do site"
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              required
            />
            <input
              className="input"
              style={{ flex: '1 1 120px', letterSpacing: 4, fontFamily: 'var(--mono)' }}
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              placeholder="000000"
              aria-label="Código de 6 dígitos"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              required
            />
            <button className="btn accent" type="submit" disabled={busy || code.length !== 6}>
              {busy ? 'Vinculando…' : 'Vincular'}
            </button>
          </div>
          {error && (
            <div className="setting-desc" style={{ color: 'var(--critical)', marginTop: 8 }} role="alert">
              {error}
            </div>
          )}
        </form>
      )}
    </div>
  );
}
