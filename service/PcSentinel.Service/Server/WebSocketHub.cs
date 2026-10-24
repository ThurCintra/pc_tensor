using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Text.Json;
using System.Threading.Channels;
using PcSentinel.Service.Contracts;

namespace PcSentinel.Service.Server;

/// <summary>
/// Clientes WebSocket conectados. Cada cliente tem uma fila limitada (8 quadros, descarta os mais antigos):
/// um celular com Wi-Fi ruim perde quadros em vez de atrasar os outros clientes ou acumular memória.
/// </summary>
public sealed class WebSocketHub(CommandHandler commands, ILogger<WebSocketHub> logger)
{
    private const int QueueCapacity = 8;
    private const int MaxClientMessageBytes = 16 * 1024;

    private readonly ConcurrentDictionary<Guid, Channel<byte[]>> _clients = new();
    private long _seq;

    public int ClientCount => _clients.Count;

    public void Broadcast(string type, object data)
    {
        if (_clients.IsEmpty) return;
        byte[] payload = Serialize(type, data);
        foreach (var channel in _clients.Values) channel.Writer.TryWrite(payload);
    }

    private byte[] Serialize(string type, object data) =>
        JsonSerializer.SerializeToUtf8Bytes(
            ServerEnvelope.Create(type, Interlocked.Increment(ref _seq), data), Protocol.Json);

    /// <summary>Atende um cliente até ele desconectar.</summary>
    public async Task RunClientAsync(WebSocket socket, HelloData hello, CancellationToken ct)
    {
        var id = Guid.NewGuid();
        var channel = Channel.CreateBounded<byte[]>(new BoundedChannelOptions(QueueCapacity)
        {
            FullMode = BoundedChannelFullMode.DropOldest,
            SingleReader = true,
        });
        channel.Writer.TryWrite(Serialize(MessageTypes.Hello, hello));
        _clients[id] = channel;
        logger.LogInformation("Cliente {Id} conectado ({Count} no total)", id, _clients.Count);

        using var linked = CancellationTokenSource.CreateLinkedTokenSource(ct);
        try
        {
            var send = SendLoopAsync(socket, channel.Reader, linked.Token);
            await ReceiveLoopAsync(socket, channel.Writer, linked.Token);
            await linked.CancelAsync();
            await send;
        }
        catch (Exception ex) when (ex is WebSocketException or OperationCanceledException)
        {
            // Conexão caiu (celular saiu do Wi-Fi, app fechado): só remove o cliente
        }
        finally
        {
            _clients.TryRemove(id, out _);
            channel.Writer.TryComplete();
            logger.LogInformation("Cliente {Id} desconectado", id);
            if (socket.State == WebSocketState.Open)
            {
                using var closeTimeout = new CancellationTokenSource(TimeSpan.FromSeconds(2));
                try
                {
                    await socket.CloseAsync(WebSocketCloseStatus.NormalClosure, null, closeTimeout.Token);
                }
                catch (Exception ex) when (ex is WebSocketException or OperationCanceledException) { }
            }
        }
    }

    private static async Task SendLoopAsync(WebSocket socket, ChannelReader<byte[]> reader, CancellationToken ct)
    {
        try
        {
            await foreach (var payload in reader.ReadAllAsync(ct))
            {
                await socket.SendAsync(payload, WebSocketMessageType.Text, endOfMessage: true, ct);
            }
        }
        catch (OperationCanceledException) { }
    }

    private async Task ReceiveLoopAsync(WebSocket socket, ChannelWriter<byte[]> replies, CancellationToken ct)
    {
        var buffer = new byte[MaxClientMessageBytes];
        while (socket.State == WebSocketState.Open && !ct.IsCancellationRequested)
        {
            int length = 0;
            ValueWebSocketReceiveResult result;
            do
            {
                if (length >= buffer.Length)
                {
                    await socket.CloseAsync(WebSocketCloseStatus.MessageTooBig, "Mensagem acima de 16 KB", ct);
                    return;
                }
                result = await socket.ReceiveAsync(buffer.AsMemory(length), ct);
                length += result.Count;
            }
            while (!result.EndOfMessage);

            if (result.MessageType == WebSocketMessageType.Close) return;
            if (result.MessageType != WebSocketMessageType.Text) continue;

            var reply = await commands.HandleAsync(buffer.AsMemory(0, length), ct);
            replies.TryWrite(Serialize(MessageTypes.CommandResult, reply));
        }
    }
}
