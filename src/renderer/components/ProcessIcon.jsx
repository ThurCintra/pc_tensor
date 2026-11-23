import { useEffect, useState } from 'react';
import { AppWindow } from '@phosphor-icons/react';
import { getTransport } from '../lib/transport';

// Um pedido por PID enquanto a tela estiver aberta (o processo principal também guarda por executável)
const requests = new Map();

function loadIcon(pid) {
  const transport = getTransport();
  if (!transport.getProcessIcon) return Promise.resolve(null);
  if (!requests.has(pid)) {
    if (requests.size > 200) requests.clear();
    requests.set(
      pid,
      transport.getProcessIcon(pid).catch(() => null),
    );
  }
  return requests.get(pid);
}

/** Ícone do programa (do próprio .exe); sem ícone ou no celular, um ícone genérico de janela. */
export function ProcessIcon({ pid }) {
  const [src, setSrc] = useState(null);

  useEffect(() => {
    let active = true;
    loadIcon(pid).then((url) => active && setSrc(url));
    return () => {
      active = false;
    };
  }, [pid]);

  return (
    <span className="process-icon" aria-hidden>
      {src ? <img src={src} alt="" width={20} height={20} /> : <AppWindow size={16} />}
    </span>
  );
}
