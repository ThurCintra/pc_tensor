import type { StreamMode } from '@pc-tensor/protocol';

/**
 * Quem está com o painel de cada PC aberto (activeViewers).
 * 0 espectadores → HEARTBEAT (1 resumo por minuto); 1 ou mais → LIVE (quadros a cada 250 ms).
 * Um mesmo navegador com duas abas conta duas vezes: cada aba é um socket.
 *
 * Contagem em memória, por instância: com mais de uma instância do servidor, use o adaptador Redis do
 * Socket.IO e conte com io.in(room).fetchSockets().
 */
export class PresenceTracker {
  private readonly viewers = new Map<string, Set<string>>();

  /** Devolve o novo modo se ele mudou (para avisar o agente), ou null. */
  add(deviceId: string, socketId: string): StreamMode | null {
    const set = this.viewers.get(deviceId) ?? new Set<string>();
    const before = set.size;
    set.add(socketId);
    this.viewers.set(deviceId, set);
    return before === 0 && set.size === 1 ? 'LIVE' : null;
  }

  remove(deviceId: string, socketId: string): StreamMode | null {
    const set = this.viewers.get(deviceId);
    if (!set?.delete(socketId)) return null;
    if (set.size > 0) return null;
    this.viewers.delete(deviceId);
    return 'HEARTBEAT';
  }

  /** Remove o socket de todos os PCs; devolve os PCs que ficaram sem espectador. */
  removeSocket(socketId: string): string[] {
    const emptied: string[] = [];
    for (const deviceId of [...this.viewers.keys()]) {
      if (this.remove(deviceId, socketId) === 'HEARTBEAT') emptied.push(deviceId);
    }
    return emptied;
  }

  count(deviceId: string): number {
    return this.viewers.get(deviceId)?.size ?? 0;
  }

  modeFor(deviceId: string): StreamMode {
    return this.count(deviceId) > 0 ? 'LIVE' : 'HEARTBEAT';
  }
}
