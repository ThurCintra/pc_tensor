import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SentinelSocket, type DisconnectInfo } from '../../../src/renderer/realtime/sentinel-socket';
import { RingBuffer } from '../../../src/renderer/realtime/ring-buffer';
import { FakeWebSocket, makeFrame } from './fixtures';

function createSocket() {
  const socket = new SentinelSocket({
    url: 'ws://127.0.0.1:3891/ws',
    token: 'token com espaço',
    WebSocketImpl: FakeWebSocket as unknown as typeof WebSocket,
    now: () => Date.now(),
  });
  const statuses: string[] = [];
  const disconnects: DisconnectInfo[] = [];
  socket.on('status', (s) => statuses.push(s));
  socket.on('disconnect', (d) => disconnects.push(d));
  return { socket, statuses, disconnects };
}

describe('SentinelSocket', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeWebSocket.instances = [];
  });
  afterEach(() => vi.useRealTimers());

  it('conecta com o token na URL e repassa hello, telemetria e alertas', () => {
    const { socket, statuses } = createSocket();
    const hello = vi.fn();
    const telemetry = vi.fn();
    const alert = vi.fn();
    socket.on('hello', hello);
    socket.on('telemetry', telemetry);
    socket.on('alert', alert);

    socket.connect();
    expect(FakeWebSocket.last.url).toBe('ws://127.0.0.1:3891/ws?token=token%20com%20espa%C3%A7o');
    FakeWebSocket.last.serverOpen();
    FakeWebSocket.last.serverSend('hello', { serviceVersion: '1.2.0' });
    FakeWebSocket.last.serverSend('telemetry', makeFrame());
    FakeWebSocket.last.serverSend('alert', { kind: 'THROTTLING', severity: 'critical' });

    expect(statuses).toEqual(['connecting', 'online']);
    expect(hello).toHaveBeenCalledWith({ serviceVersion: '1.2.0' });
    expect(telemetry).toHaveBeenCalledTimes(1);
    expect(alert).toHaveBeenCalledTimes(1);
  });

  it('ignora mensagens de outra versão do contrato ou malformadas', () => {
    const { socket } = createSocket();
    const telemetry = vi.fn();
    socket.on('telemetry', telemetry);
    socket.connect();
    FakeWebSocket.last.serverOpen();

    FakeWebSocket.last.serverSend('telemetry', makeFrame(), 1);
    FakeWebSocket.last.onmessage?.({ data: '{nao é json' });
    FakeWebSocket.last.serverSend('desconhecido', {});

    expect(telemetry).not.toHaveBeenCalled();
  });

  it('detecta PC travado: conexão aberta mas sem quadros por 2 s', () => {
    const { socket, statuses, disconnects } = createSocket();
    socket.connect();
    FakeWebSocket.last.serverOpen();
    FakeWebSocket.last.serverSend('telemetry', makeFrame());
    const frozenAt = Date.now();

    vi.advanceTimersByTime(1999);
    expect(socket.status).toBe('online');
    vi.advanceTimersByTime(1);

    expect(statuses).toContain('stalled');
    expect(disconnects).toEqual([{ abrupt: true, reason: 'stalled', code: null, lastFrameAt: frozenAt }]);
  });

  it('queda anormal é brusca; fechamento normal do serviço não é', () => {
    const { socket, disconnects } = createSocket();
    socket.connect();
    FakeWebSocket.last.serverOpen();
    FakeWebSocket.last.serverClose(1006);
    expect(disconnects[0]).toMatchObject({ abrupt: true, reason: 'closed', code: 1006 });
    expect(socket.status).toBe('offline');

    vi.advanceTimersByTime(1000); // reconecta
    FakeWebSocket.last.serverOpen();
    FakeWebSocket.last.serverClose(1000);
    expect(disconnects[1]).toMatchObject({ abrupt: false, code: 1000 });
  });

  it('falha ao conectar não é queda brusca e reconecta com espera crescente', () => {
    const { socket, disconnects } = createSocket();
    socket.connect();
    FakeWebSocket.last.serverClose(1006); // recusado antes de abrir (token errado, PC desligado)
    expect(disconnects[0]?.abrupt).toBe(false);

    vi.advanceTimersByTime(1000);
    expect(FakeWebSocket.instances).toHaveLength(2);
    FakeWebSocket.last.serverClose(1006);
    vi.advanceTimersByTime(1999);
    expect(FakeWebSocket.instances).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(FakeWebSocket.instances).toHaveLength(3);
  });

  it('envia comandos e resolve pela resposta com o mesmo id', async () => {
    const { socket } = createSocket();
    socket.connect();
    FakeWebSocket.last.serverOpen();

    const ok = socket.send('PING', {});
    const sent = JSON.parse(FakeWebSocket.last.sent[0]!);
    expect(sent).toMatchObject({ v: 2, type: 'command', action: 'PING', params: {} });
    FakeWebSocket.last.serverSend('commandResult', { id: sent.id, ok: true, data: { pong: true }, error: null });
    await expect(ok).resolves.toEqual({ pong: true });

    const fail = socket.send('SET_ENERGY_CONFIG', { tariffBrlPerKwh: -1 });
    const id = JSON.parse(FakeWebSocket.last.sent[1]!).id;
    FakeWebSocket.last.serverSend('commandResult', { id, ok: false, data: null, error: 'Tarifa inválida.' });
    await expect(fail).rejects.toThrow('Tarifa inválida.');
  });

  it('comando sem resposta expira e comandos pendentes falham quando a conexão cai', async () => {
    const { socket } = createSocket();
    socket.connect();
    FakeWebSocket.last.serverOpen();

    const timeout = socket.send('PING', {});
    // Quadros continuam chegando (PC vivo), só o comando fica sem resposta
    for (let i = 0; i < 10; i++) {
      FakeWebSocket.last.serverSend('telemetry', makeFrame());
      vi.advanceTimersByTime(1000);
    }
    await expect(timeout).rejects.toThrow('O PC não respondeu a tempo.');

    FakeWebSocket.last.serverSend('telemetry', makeFrame());
    const pending = socket.send('STUTTER_BUSTER', {});
    FakeWebSocket.last.serverClose(1006);
    await expect(pending).rejects.toThrow('A conexão com o PC caiu.');
    await expect(socket.send('PING', {})).rejects.toThrow('Sem conexão com o PC.');
  });

  it('close() encerra sem contar como queda e sem reconectar', () => {
    const { socket, disconnects } = createSocket();
    socket.connect();
    FakeWebSocket.last.serverOpen();

    socket.close();
    vi.advanceTimersByTime(60_000);

    expect(FakeWebSocket.last.closedWith).toBe(1000);
    expect(disconnects).toEqual([]);
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(socket.status).toBe('idle');
  });
});

describe('RingBuffer', () => {
  it('mantém os itens mais novos na ordem e sobrescreve os mais antigos', () => {
    const buffer = new RingBuffer<number>(3);
    [1, 2, 3, 4, 5].forEach((n) => buffer.push(n));

    expect(buffer.toArray()).toEqual([3, 4, 5]);
    expect(buffer.peekOldest()).toBe(3);
    expect(buffer.peekNewest()).toBe(5);
    expect(buffer.shift()).toBe(3);
    buffer.push(6);
    expect(buffer.toArray()).toEqual([4, 5, 6]);

    buffer.clear();
    expect(buffer.size).toBe(0);
    expect(buffer.toArray()).toEqual([]);
    expect(() => new RingBuffer(0)).toThrow(RangeError);
  });
});
