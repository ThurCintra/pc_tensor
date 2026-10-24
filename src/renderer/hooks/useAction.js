import { useCallback, useState } from 'react';
import { getTransport } from '../lib/transport';

/**
 * Executa uma ação remota (encerrar processo, plano de energia, Boost, mídia)
 * e guarda o resultado para exibir numa barra de aviso.
 */
export function useAction() {
  const [busy, setBusy] = useState(null);
  const [result, setResult] = useState(null);

  const run = useCallback(async (action, params = {}, busyKey = action) => {
    setBusy(busyKey);
    try {
      const res = await getTransport().executeAction(action, params);
      setResult({ tone: res?.success ? 'success' : 'critical', message: res?.message || 'Ação concluída.' });
      return res;
    } catch (err) {
      setResult({ tone: 'critical', message: err.message });
      return null;
    } finally {
      setBusy(null);
    }
  }, []);

  return { run, busy, result, clearResult: () => setResult(null) };
}
