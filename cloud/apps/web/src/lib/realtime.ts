'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { io, type Socket } from 'socket.io-client';
import { NAMESPACES, type ClientClientToServer, type ClientServerToClient } from '@pc-tensor/protocol';

export type RealtimeSocket = Socket<ClientServerToClient, ClientClientToServer>;
export type ConnectionState = 'connecting' | 'online' | 'offline';

interface TokenResponse {
  token: string;
  url: string | null;
}

async function fetchToken(): Promise<TokenResponse> {
  const response = await fetch('/api/realtime-token', { cache: 'no-store' });
  if (response.status === 401) {
    window.location.href = '/entrar';
    throw new Error('Sessão expirada.');
  }
  if (!response.ok) throw new Error('Tempo real indisponível.');
  return response.json();
}

/**
 * Uma conexão Socket.IO por aba com o servidor de tempo real. O token (5 minutos) é buscado de novo a cada
 * reconexão, pelo callback de auth, então a conexão sobrevive a quedas de rede e a sessões longas.
 */
let socket: RealtimeSocket | null = null;
let connecting: Promise<RealtimeSocket> | null = null;
let state: ConnectionState = 'connecting';
const listeners = new Set<() => void>();

function setState(next: ConnectionState) {
  state = next;
  listeners.forEach((l) => l());
}

export function getRealtimeSocket(): Promise<RealtimeSocket> {
  if (socket) return Promise.resolve(socket);
  connecting ??= fetchToken().then(({ url }) => {
    if (!url) throw new Error('REALTIME_URL não configurada no site.');
    const s: RealtimeSocket = io(url + NAMESPACES.client, {
      transports: ['websocket'],
      auth: (cb) => {
        fetchToken()
          .then(({ token }) => cb({ token }))
          .catch(() => cb({ token: '' }));
      },
      reconnectionDelay: 1000,
      reconnectionDelayMax: 15_000,
    });
    s.on('connect', () => setState('online'));
    s.on('disconnect', () => setState('offline'));
    s.on('connect_error', () => setState('offline'));
    socket = s;
    return s;
  });
  return connecting;
}

/** O socket (null até conectar) e o estado da conexão, para mostrar "ao vivo"/"reconectando". */
export function useRealtime(): { socket: RealtimeSocket | null; connection: ConnectionState } {
  const [current, setCurrent] = useState<RealtimeSocket | null>(socket);
  const connection = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => 'connecting' as ConnectionState,
  );

  useEffect(() => {
    let active = true;
    getRealtimeSocket()
      .then((s) => active && setCurrent(s))
      .catch(() => setState('offline'));
    return () => {
      active = false;
    };
  }, []);

  return { socket: current, connection };
}
