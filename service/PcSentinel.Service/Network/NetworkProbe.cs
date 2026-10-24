using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using PcSentinel.Service.Contracts;

namespace PcSentinel.Service.Network;

/// <summary>
/// Janela deslizante de pings para um alvo: latência média, jitter e perda.
/// Jitter = média das diferenças absolutas entre pings consecutivos (como no RFC 3550).
/// </summary>
public sealed class PingWindow(int capacity = 30)
{
    private readonly Queue<double?> _samples = new();
    private readonly object _lock = new();

    /// <summary>Latência típica (mediana das respostas da janela), base do "pico" do Juiz de Lag.</summary>
    public double? MedianMs
    {
        get
        {
            lock (_lock)
            {
                var ok = _samples.OfType<double>().Order().ToArray();
                return ok.Length == 0 ? null : ok[ok.Length / 2];
            }
        }
    }

    public void Add(double? rttMs)
    {
        lock (_lock)
        {
            _samples.Enqueue(rttMs);
            while (_samples.Count > capacity) _samples.Dequeue();
        }
    }

    /// <summary>Latência média das últimas <paramref name="recent"/> respostas.</summary>
    public double? RecentAverageMs(int recent = 3)
    {
        lock (_lock)
        {
            var ok = _samples.Reverse().OfType<double>().Take(recent).ToArray();
            return ok.Length == 0 ? null : Math.Round(ok.Average(), 1);
        }
    }

    public double? JitterMs
    {
        get
        {
            lock (_lock)
            {
                var ok = _samples.OfType<double>().ToArray();
                if (ok.Length < 2) return null;
                double sum = 0;
                for (int i = 1; i < ok.Length; i++) sum += Math.Abs(ok[i] - ok[i - 1]);
                return Math.Round(sum / (ok.Length - 1), 1);
            }
        }
    }

    public double? LossPct
    {
        get
        {
            lock (_lock)
            {
                if (_samples.Count == 0) return null;
                return Math.Round(_samples.Count(s => s is null) * 100.0 / _samples.Count, 1);
            }
        }
    }
}

/// <summary>
/// Mede a rede da interface ativa uma vez por segundo: ICMP para o gateway (rede local) e para um servidor
/// de referência (internet). Se o ICMP for bloqueado, usa o tempo do handshake TCP na porta 443.
/// </summary>
public sealed class NetworkProbe : IAsyncDisposable
{
    private const int TimeoutMs = 1000;
    private static readonly IPAddress InternetTarget = IPAddress.Parse("1.1.1.1");

    private readonly PingWindow _gateway = new();
    private readonly PingWindow _internet = new();
    private readonly CancellationTokenSource _cts = new();
    private Task? _loop;
    private string? _adapter;
    private IPAddress? _gatewayAddress;

    public PingWindow Internet => _internet;

    public void Start() => _loop ??= Task.Run(() => RunAsync(_cts.Token));

    public NetworkData Snapshot() => new(
        _adapter,
        _gatewayAddress?.ToString(),
        _gateway.RecentAverageMs(),
        _internet.RecentAverageMs(),
        _internet.JitterMs,
        _internet.LossPct);

    private async Task RunAsync(CancellationToken ct)
    {
        using var ping = new Ping();
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(1));
        int tick = 0;
        do
        {
            if (tick++ % 30 == 0) RefreshActiveInterface();

            if (_gatewayAddress is not null) _gateway.Add(await MeasureAsync(ping, _gatewayAddress, ct));
            _internet.Add(await MeasureAsync(ping, InternetTarget, ct));
        }
        while (await timer.WaitForNextTickAsync(ct).ConfigureAwait(false));
    }

    private static async Task<double?> MeasureAsync(Ping ping, IPAddress target, CancellationToken ct)
    {
        try
        {
            var reply = await ping.SendPingAsync(target, TimeSpan.FromMilliseconds(TimeoutMs), cancellationToken: ct);
            if (reply.Status == IPStatus.Success) return reply.RoundtripTime;
        }
        catch (PingException)
        {
            // ICMP bloqueado: tenta o handshake TCP abaixo
        }

        try
        {
            using var socket = new Socket(target.AddressFamily, SocketType.Stream, ProtocolType.Tcp);
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
            timeout.CancelAfter(TimeoutMs);
            long start = Environment.TickCount64;
            await socket.ConnectAsync(new IPEndPoint(target, 443), timeout.Token);
            return Environment.TickCount64 - start;
        }
        catch (Exception ex) when (ex is SocketException or OperationCanceledException && !ct.IsCancellationRequested)
        {
            return null; // pacote perdido
        }
    }

    /// <summary>VPNs, máquinas virtuais e afins (mesma lista do servidor do celular em src/server).</summary>
    private static readonly System.Text.RegularExpressions.Regex VirtualAdapter = new(
        "vethernet|wsl|hyper-v|virtualbox|vbox|vmware|docker|loopback|bluetooth|tailscale|zerotier|hamachi|radmin|npcap|teredo|wireguard|openvpn|tap-windows",
        System.Text.RegularExpressions.RegexOptions.IgnoreCase | System.Text.RegularExpressions.RegexOptions.Compiled);

    /// <summary>
    /// Interface ativa = placa Ethernet ou Wi-Fi física que está "Up" e tem gateway IPv4.
    /// Adaptadores de VPN (Radmin, Tailscale…) também têm gateway, mas não são o caminho do jogo.
    /// </summary>
    private void RefreshActiveInterface()
    {
        foreach (var nic in NetworkInterface.GetAllNetworkInterfaces())
        {
            if (nic.OperationalStatus != OperationalStatus.Up) continue;
            if (nic.NetworkInterfaceType is not (NetworkInterfaceType.Ethernet or NetworkInterfaceType.Wireless80211 or NetworkInterfaceType.GigabitEthernet)) continue;
            if (VirtualAdapter.IsMatch(nic.Name) || VirtualAdapter.IsMatch(nic.Description)) continue;
            var gateway = nic.GetIPProperties().GatewayAddresses
                .Select(g => g.Address)
                .FirstOrDefault(a => a.AddressFamily == AddressFamily.InterNetwork && !a.Equals(IPAddress.Any));
            if (gateway is null) continue;

            _adapter = nic.Name;
            _gatewayAddress = gateway;
            return;
        }
        _adapter = null;
        _gatewayAddress = null;
    }

    public async ValueTask DisposeAsync()
    {
        await _cts.CancelAsync();
        if (_loop is not null)
        {
            try { await _loop; } catch (OperationCanceledException) { }
        }
        _cts.Dispose();
    }
}
