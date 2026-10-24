using System.Collections.Concurrent;
using System.Diagnostics;
using System.Text.Json;
using System.Text.Json.Nodes;
using PcSentinel.Service.Contracts;
using PcSentinel.Service.Control;
using PcSentinel.Service.Server;
using SocketIOClient;

namespace PcSentinel.Service.Cloud;

public sealed class CloudOptions
{
    public TimeSpan HeartbeatInterval { get; set; } = TimeSpan.FromSeconds(60);
    public TimeSpan LiveInterval { get; set; } = TimeSpan.FromMilliseconds(250);
    /// <summary>Resumos guardados enquanto a nuvem está fora (2 horas de minutos).</summary>
    public int MaxQueuedHeartbeats { get; set; } = 120;
    public int MaxQueuedAlerts { get; set; } = 50;
}

/// <summary>Estado da conexão com a nuvem, mostrado no app (Configurações) e pelo comando CLOUD_STATUS.</summary>
public sealed record CloudStatus(
    string State,
    string? ApiUrl,
    string? DeviceId,
    string? Mode,
    string? LastError,
    DateTimeOffset? ConnectedSince);

public static class CloudStates
{
    public const string Unpaired = "UNPAIRED";
    public const string Connecting = "CONNECTING";
    public const string Connected = "CONNECTED";
    public const string Offline = "OFFLINE";
    public const string Unauthorized = "UNAUTHORIZED";
}

/// <summary>
/// Agente do pc_tensor Cloud dentro do serviço nativo.
///
/// O PC abre a conexão de dentro para fora (wss para o servidor de tempo real), então funciona atrás de NAT e
/// firewall sem abrir portas. O servidor diz o modo: HEARTBEAT (ninguém olhando, 1 resumo por minuto) ou LIVE
/// (alguém com o painel aberto, quadro a cada 250 ms). Resumos e alertas que não puderam sair ficam numa fila
/// e são enviados quando a conexão volta. Reconecta com espera exponencial e variação aleatória (para mil PCs
/// não voltarem todos no mesmo segundo depois de uma queda do servidor).
/// </summary>
public sealed class CloudConnector : BackgroundService
{
    private static readonly TimeSpan[] Backoff =
        [TimeSpan.FromSeconds(1), TimeSpan.FromSeconds(2), TimeSpan.FromSeconds(4), TimeSpan.FromSeconds(8),
         TimeSpan.FromSeconds(16), TimeSpan.FromSeconds(30), TimeSpan.FromSeconds(60)];

    private readonly TelemetryEngine _engine;
    private readonly CloudCredentialStore _store;
    private readonly CloudApiClient _api;
    private readonly CloudOptions _options;
    private readonly ILogger<CloudConnector> _logger;
    private readonly CommandDispatcher _dispatcher;
    private readonly HeartbeatAggregator _aggregator = new();
    private readonly OverheatMonitor _overheat = new();
    private readonly ConcurrentQueue<CloudHeartbeat> _heartbeats = new();
    private readonly ConcurrentQueue<CloudAlert> _alerts = new();
    private readonly SemaphoreSlim _work = new(0);
    private readonly SemaphoreSlim _credentialsChanged = new(0);
    private readonly object _lock = new();
    private readonly Stopwatch _clock = Stopwatch.StartNew();

    private CancellationTokenSource? _session;
    private TelemetryFrame? _liveFrame;
    private double _lastLiveSentS = double.NegativeInfinity;
    private double _lastHeartbeatS;
    private volatile bool _connected;
    private volatile string _mode = "HEARTBEAT";
    private CloudStatus _status = new(CloudStates.Unpaired, null, null, null, null, null);

    public CloudConnector(
        TelemetryEngine engine,
        CloudCredentialStore store,
        CloudApiClient api,
        StutterBuster buster,
        CloudOptions options,
        ILogger<CloudConnector> logger)
    {
        _engine = engine;
        _store = store;
        _api = api;
        _options = options;
        _logger = logger;
        _dispatcher = CommandDispatcher.Create(buster, UpdateLimits, () => _overheat.Limits);
        _engine.FrameProduced += OnFrame;
    }

    public CloudStatus Status
    {
        get
        {
            lock (_lock) return _status;
        }
    }

    // Pareamento --------------------------------------------------------------------------------

    /// <summary>Troca o código de 6 dígitos do site pelo DeviceToken e conecta. O hardware vai para o cadastro.</summary>
    public async Task<CloudStatus> PairAsync(Uri apiUrl, string code, CancellationToken ct)
    {
        // Logo depois de o serviço abrir, os sensores ainda não leram nada: espera a primeira leitura (até 10 s)
        // para o cadastro no site já sair com CPU, GPU e memória
        for (int i = 0; i < 40 && _engine.Latest is null; i++) await Task.Delay(250, ct);
        var hardware = HardwareForPairing(_engine.Latest);
        var credentials = await _api.PairAsync(apiUrl, code, hardware, ct);
        _store.Save(credentials, AlertLimits.Default);
        _logger.LogInformation("PC pareado com {Api} como {DeviceId}", apiUrl, credentials.DeviceId);
        SetStatus(CloudStates.Connecting, credentials, null, null);
        Restart();
        return Status;
    }

    public void Unpair()
    {
        _store.Clear();
        _logger.LogInformation("PC desvinculado da nuvem");
        Restart();
    }

    public static PairingHardware HardwareForPairing(TelemetryFrame? frame) => new(
        Environment.MachineName,
        frame?.Cpu.Name,
        frame?.Gpu.Name,
        frame?.Memory.TotalMb is double mb ? Math.Round(mb / 1024, 1) : null);

    /// <summary>Encerra a sessão atual para o laço reler as credenciais (novo pareamento ou desvínculo).</summary>
    private void Restart()
    {
        lock (_lock) _session?.Cancel();
        _credentialsChanged.Release();
    }

    // Quadros do laço de telemetria (4 Hz): só acumula e enfileira, nunca espera a rede ---------

    private void OnFrame(TelemetryFrame frame, IReadOnlyList<AlertData> localAlerts, double t)
    {
        _aggregator.Add(frame, t);
        if (t - _lastHeartbeatS >= _options.HeartbeatInterval.TotalSeconds)
        {
            _lastHeartbeatS = t;
            if (_aggregator.Take(DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()) is { } hb) Enqueue(_heartbeats, hb, _options.MaxQueuedHeartbeats);
        }

        foreach (var alert in _overheat.Evaluate(frame)) Enqueue(_alerts, alert, _options.MaxQueuedAlerts);
        foreach (var local in localAlerts)
        {
            if (OverheatMonitor.FromLocal(local) is { } alert && _overheat.Limits.AlertsEnabled) Enqueue(_alerts, alert, _options.MaxQueuedAlerts);
        }

        if (_connected && _mode == "LIVE" && t - _lastLiveSentS >= _options.LiveInterval.TotalSeconds * 0.9)
        {
            _lastLiveSentS = t;
            Volatile.Write(ref _liveFrame, frame);
        }

        if (_connected && (!_heartbeats.IsEmpty || !_alerts.IsEmpty || _liveFrame is not null)) _work.Release();
    }

    private static void Enqueue<T>(ConcurrentQueue<T> queue, T item, int max)
    {
        queue.Enqueue(item);
        while (queue.Count > max) queue.TryDequeue(out _); // descarta os mais antigos
    }

    private void UpdateLimits(AlertLimits limits)
    {
        _overheat.Limits = limits;
        _store.SaveLimits(limits);
    }

    // Conexão -----------------------------------------------------------------------------------

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        int attempt = 0;
        while (!stoppingToken.IsCancellationRequested)
        {
            var loaded = _store.Load();
            if (loaded is null)
            {
                SetStatus(CloudStates.Unpaired, null, null, null);
                await WaitForCredentialsAsync(stoppingToken);
                continue;
            }

            var (credentials, limits) = loaded.Value;
            _overheat.Limits = limits;
            using var session = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
            lock (_lock) _session = session;

            try
            {
                SetStatus(CloudStates.Connecting, credentials, null, null);
                var info = await _api.GetAgentInfoAsync(credentials, session.Token);
                UpdateLimits(new AlertLimits(info.MaxCpuTempAlert, info.MaxGpuTempAlert, info.AlertsEnabled));
                if (string.IsNullOrWhiteSpace(info.RealtimeUrl) || !Uri.TryCreate(info.RealtimeUrl, UriKind.Absolute, out var realtimeUrl))
                    throw new CloudApiException("O site não informou o endereço do servidor de tempo real.");

                await RunSessionAsync(credentials, realtimeUrl, () => attempt = 0, session.Token);
                if (!stoppingToken.IsCancellationRequested) SetStatus(CloudStates.Offline, credentials, null, "Conexão com a nuvem caiu.");
            }
            catch (CloudUnauthorizedException ex)
            {
                // PC removido no site: apaga o token e espera um novo pareamento, sem insistir
                _store.Clear();
                SetStatus(CloudStates.Unauthorized, credentials, null, ex.Message);
                await WaitForCredentialsAsync(stoppingToken);
                continue;
            }
            catch (OperationCanceledException) when (!stoppingToken.IsCancellationRequested)
            {
                continue; // credenciais trocadas: recomeça na hora
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogWarning("Nuvem indisponível: {Message}", ex.Message);
                SetStatus(CloudStates.Offline, credentials, null, ex.Message);
            }
            finally
            {
                lock (_lock) _session = null;
            }

            var delay = Backoff[Math.Min(attempt, Backoff.Length - 1)] * (0.8 + Random.Shared.NextDouble() * 0.4);
            attempt++;
            try
            {
                await Task.WhenAny(Task.Delay(delay, stoppingToken), _credentialsChanged.WaitAsync(stoppingToken));
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }

    private async Task WaitForCredentialsAsync(CancellationToken ct)
    {
        try
        {
            await _credentialsChanged.WaitAsync(ct);
        }
        catch (OperationCanceledException)
        {
            // serviço encerrando
        }
    }

    private async Task RunSessionAsync(CloudCredentials credentials, Uri realtimeUrl, Action onConnected, CancellationToken ct)
    {
        using var client = new SocketIO(new Uri(realtimeUrl, "/agent"), new SocketIOOptions
        {
            Auth = new Dictionary<string, string> { ["token"] = credentials.DeviceToken },
            Transport = SocketIOClient.Common.TransportProtocol.WebSocket,
            Reconnection = false, // a reconexão é deste laço, com espera exponencial
            ConnectionTimeout = TimeSpan.FromSeconds(15),
        });

        var disconnected = new TaskCompletionSource<string>(TaskCreationOptions.RunContinuationsAsynchronously);
        client.OnDisconnected += (_, reason) => disconnected.TrySetResult(reason);
        client.OnError += (_, error) =>
        {
            _logger.LogWarning("Erro do servidor de tempo real: {Error}", error);
            disconnected.TrySetResult(error);
        };

        client.On("stream:mode", ctx =>
        {
            var payload = ctx.GetValue<JsonElement>(0);
            if (payload.TryGetProperty("mode", out var m) && m.GetString() is "LIVE" or "HEARTBEAT")
            {
                _mode = m.GetString()!;
                _logger.LogInformation("Modo da nuvem: {Mode}", _mode);
                SetStatus(CloudStates.Connected, credentials, _mode, null);
            }
            return Task.CompletedTask;
        });

        client.On("command", async ctx =>
        {
            CloudCommandResult result;
            try
            {
                result = await Task.Run(() => _dispatcher.Execute(ctx.GetValue<JsonElement>(0)), ct);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogError(ex, "Falha ao executar comando da nuvem");
                result = new CloudCommandResult(false, "Erro ao executar o comando no PC.");
            }
            await ctx.SendAckDataAsync([JsonSerializer.SerializeToNode(result, AckJson)!]);
        });

        try
        {
            await client.ConnectAsync(ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            if (ex.Message.Contains("UNAUTHORIZED", StringComparison.OrdinalIgnoreCase))
                throw new CloudUnauthorizedException("O servidor recusou o token deste PC. Pareie de novo.");
            throw new CloudApiException($"Não foi possível conectar ao servidor de tempo real ({ex.Message}).");
        }

        _connected = true;
        onConnected();
        SetStatus(CloudStates.Connected, credentials, _mode, null);
        _logger.LogInformation("Conectado à nuvem ({Url})", realtimeUrl);

        try
        {
            while (!ct.IsCancellationRequested && !disconnected.Task.IsCompleted)
            {
                await Task.WhenAny(_work.WaitAsync(TimeSpan.FromSeconds(1), ct), disconnected.Task);
                await FlushAsync(client, ct);
            }
        }
        finally
        {
            _connected = false;
            _mode = "HEARTBEAT";
            if (client.Connected)
            {
                try
                {
                    await client.DisconnectAsync(CancellationToken.None);
                }
                catch (Exception ex) when (ex is not OutOfMemoryException)
                {
                    // já desconectado
                }
            }
        }

        if (disconnected.Task.IsCompleted && (await disconnected.Task).Contains("UNAUTHORIZED", StringComparison.OrdinalIgnoreCase))
            throw new CloudUnauthorizedException("O servidor recusou o token deste PC. Pareie de novo.");
    }

    /// <summary>Envia o quadro ao vivo mais recente, os resumos pendentes (com confirmação) e os alertas.</summary>
    private async Task FlushAsync(SocketIO client, CancellationToken ct)
    {
        if (!client.Connected) return;

        var live = Interlocked.Exchange(ref _liveFrame, null);
        if (live is not null && _mode == "LIVE")
            await client.EmitAsync("telemetry:live", [CloudFrames.Live(live, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds())], ct);

        while (_heartbeats.TryPeek(out var hb) && client.Connected)
        {
            var ack = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
            await client.EmitAsync("telemetry:heartbeat", [Node(hb)], a =>
            {
                ack.TrySetResult(a.GetValue<bool>(0));
                return Task.CompletedTask;
            }, ct);

            var done = await Task.WhenAny(ack.Task, Task.Delay(TimeSpan.FromSeconds(10), ct));
            if (done != ack.Task) break; // sem confirmação: tenta de novo no próximo ciclo
            _heartbeats.TryDequeue(out _);
            if (!ack.Task.Result) _logger.LogWarning("Resumo recusado pela nuvem: {Ts}", hb.Ts);
        }

        while (_alerts.TryDequeue(out var alert) && client.Connected)
            await client.EmitAsync("alert", [Node(alert)], ct);
    }

    private static JsonNode Node<T>(T value) => JsonSerializer.SerializeToNode(value, Protocol.Json)!;

    /// <summary>Resposta de comando: campos vazios são omitidos (o protocolo trata "data" como opcional).</summary>
    private static readonly JsonSerializerOptions AckJson = new(Protocol.Json)
    {
        DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull,
    };

    private void SetStatus(string state, CloudCredentials? credentials, string? mode, string? error)
    {
        lock (_lock)
        {
            var since = state == CloudStates.Connected ? _status.ConnectedSince ?? DateTimeOffset.UtcNow : (DateTimeOffset?)null;
            _status = new CloudStatus(state, credentials?.ApiUrl.ToString(), credentials?.DeviceId, mode, error, since);
        }
    }

    public override void Dispose()
    {
        _engine.FrameProduced -= OnFrame;
        base.Dispose();
    }
}
