using System.Collections.Concurrent;
using System.Diagnostics;
using System.Net;
using PcSentinel.Service.Network;

namespace PcSentinel.Service.Tests;

public class NetworkProbeTests
{
    private static readonly IPAddress Gateway = IPAddress.Parse("192.168.0.1");

    [Theory]
    [InlineData(0, 10, 1000, 990)]   // ciclo rápido: espera o resto do segundo
    [InlineData(0, 1000, 1000, 0)]   // ciclo de exatamente 1 s: segue direto
    [InlineData(0, 2100, 1000, 0)]   // ciclo lento (timeout + fallback TCP): nunca espera negativo
    [InlineData(500, 700, 1000, 800)]
    public void CicloSeguinteSoComecaDepoisDoIntervalo(long started, long now, int interval, int expected) =>
        Assert.Equal(expected, NetworkProbe.DelayUntilNextMs(started, now, interval));

    [Fact]
    public async Task CadaAlvoRecebeNoMaximoUmPingPorIntervalo()
    {
        // Margem folgada para runners de CI lentos: o defeito antigo colava dois pings ao mesmo alvo com poucos
        // milissegundos de diferença; o certo é o intervalo inteiro (um agendador lento só aumenta o espaçamento)
        const int interval = 200;
        const int minimumGap = 150;
        var sent = new ConcurrentDictionary<IPAddress, ConcurrentQueue<double>>();
        var clock = Stopwatch.StartNew();
        int calls = 0;

        // O gateway alterna entre lento e rápido: na versão antiga (pings em sequência) isso colava dois pings
        // seguidos ao 1.1.1.1 com poucos milissegundos de diferença
        async Task<double?> Measure(IPAddress target, CancellationToken ct)
        {
            sent.GetOrAdd(target, _ => new ConcurrentQueue<double>()).Enqueue(clock.Elapsed.TotalMilliseconds);
            bool slow = target.Equals(Gateway) && Interlocked.Increment(ref calls) % 2 == 1;
            await Task.Delay(slow ? 90 : 1, ct);
            return 10;
        }

        await using (var probe = new NetworkProbe(interval, Measure, () => ("Ethernet", Gateway)))
        {
            probe.Start();
            await Task.Delay(1500);
        }

        Assert.Equal(2, sent.Count);
        foreach (var (target, times) in sent)
        {
            var list = times.ToArray();
            // 1,5 s a 200 ms: no máximo 8 ciclos; ao menos 3 mesmo num runner muito lento
            Assert.True(list.Length is >= 3 and <= 8, $"{target}: {list.Length} pings em 1500 ms");
            for (int i = 1; i < list.Length; i++)
            {
                double gap = list[i] - list[i - 1];
                Assert.True(gap >= minimumGap, $"{target}: dois pings com {gap:0.0} ms de intervalo");
            }
        }
    }

    [Fact]
    public async Task LerOSnapshotA4HzNaoDisparaPings()
    {
        int pings = 0;
        Task<double?> Measure(IPAddress target, CancellationToken ct)
        {
            Interlocked.Increment(ref pings);
            return Task.FromResult<double?>(target.Equals(Gateway) ? 2 : 20);
        }

        // Intervalo longo: depois do primeiro ciclo, nenhum ping novo durante as leituras abaixo
        await using var probe = new NetworkProbe(60_000, Measure, () => ("Ethernet", Gateway));
        probe.Start();
        // Espera a primeira leitura de verdade (num runner lento o primeiro ciclo pode levar mais que alguns ms)
        var deadline = DateTime.UtcNow.AddSeconds(5);
        while ((probe.Snapshot().InternetLatencyMs is null || probe.Snapshot().GatewayLatencyMs is null) && DateTime.UtcNow < deadline)
            await Task.Delay(10);
        int before = Volatile.Read(ref pings);
        Assert.Equal(2, before);

        // O TelemetryEngine lê a 250 ms; aqui 100 leituras seguidas, sem nenhum ping a mais por causa delas
        for (int i = 0; i < 100; i++)
        {
            var snapshot = probe.Snapshot();
            Assert.Equal("Ethernet", snapshot.Adapter);
            Assert.Equal(20, snapshot.InternetLatencyMs);
            Assert.Equal(2, snapshot.GatewayLatencyMs);
        }
        Assert.Equal(before, Volatile.Read(ref pings));
    }

    [Fact]
    public void JanelaAguentaEscritaELeituraEmParalelo()
    {
        var window = new PingWindow(capacity: 30);
        Parallel.For(0, 5000, i =>
        {
            window.Add(i % 10 == 0 ? null : i % 50);
            _ = window.JitterMs;
            _ = window.LossPct;
            _ = window.MedianMs;
        });

        // Janela cheia com 30 amostras; perda dentro do possível e nenhuma exceção de coleção modificada
        Assert.InRange(window.LossPct ?? -1, 0, 100);
        Assert.NotNull(window.MedianMs);
    }
}
