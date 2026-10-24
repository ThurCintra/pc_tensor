using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging.Abstractions;
using PcSentinel.Service.Analytics;
using PcSentinel.Service.Context;
using PcSentinel.Service.Contracts;
using PcSentinel.Service.Control;
using PcSentinel.Service.Network;
using PcSentinel.Service.Persistence;
using PcSentinel.Service.Server;

namespace PcSentinel.Service.Tests;

public class TelemetryDbTests
{
    [Fact]
    public void SomaEnergiaPorDiaEMes()
    {
        using var db = new TelemetryDb(":memory:");
        db.AddEnergy(new DateOnly(2026, 10, 1), 1.5);
        db.AddEnergy(new DateOnly(2026, 10, 1), 0.5);
        db.AddEnergy(new DateOnly(2026, 10, 24), 3);
        db.AddEnergy(new DateOnly(2026, 9, 30), 10);

        Assert.Equal(5, db.GetMonthKwh(new DateOnly(2026, 10, 15)), precision: 9);
    }

    [Fact]
    public void JuntaLinhasDeBaseSoDeSemanasAnterioresAoCorte()
    {
        using var db = new TelemetryDb(":memory:");
        var old = new BaselineBucket();
        for (int i = 0; i < 10; i++) { old.DeltaC.Add(30); old.FanPct.Add(40); }
        var recent = new BaselineBucket();
        for (int i = 0; i < 10; i++) { recent.DeltaC.Add(50); recent.FanPct.Add(80); }

        db.MergeBaseline("cpu", 80, new DateOnly(2026, 9, 7), old);
        db.MergeBaseline("cpu", 80, new DateOnly(2026, 9, 7), old);
        db.MergeBaseline("cpu", 80, new DateOnly(2026, 10, 19), recent);

        var baseline = db.GetBaseline("cpu", 80, new DateOnly(2026, 10, 5))!;
        Assert.Equal(20, baseline.DeltaC.Count);
        Assert.Equal(30, baseline.DeltaC.Mean, precision: 9);
        Assert.Equal(new DateOnly(2026, 9, 7), baseline.OldestWeek);
        Assert.Null(db.GetBaseline("gpu", 80, new DateOnly(2026, 10, 5)));
    }

    [Fact]
    public void GuardaCurvaDeSilicioEConfiguracoes()
    {
        using var db = new TelemetryDb(":memory:");
        var bucket = new SiliconBucket();
        bucket.Vcore.Add(1.25);
        bucket.Power.Add(90);
        db.MergeSilicon("cpu", 5300, bucket);
        db.MergeSilicon("cpu", 5300, bucket);

        var point = Assert.Single(db.GetSiliconCurve("cpu"));
        Assert.Equal(new SiliconCurvePoint(5300, 1.25, 90, 2), point);

        Assert.Equal(0.95, db.GetSetting("energy.tariffBrlPerKwh", 0.95));
        db.SetSetting("energy.tariffBrlPerKwh", 1.12);
        Assert.Equal(1.12, db.GetSetting("energy.tariffBrlPerKwh", 0.95));
    }
}

public class CommandHandlerTests
{
    private static CommandHandler Create(out EnergySettings energy, out TelemetryDb db)
    {
        energy = new EnergySettings();
        db = new TelemetryDb(":memory:");
        return new CommandHandler(new StutterBuster(), db, energy, NullLogger<CommandHandler>.Instance);
    }

    private static Task<CommandResult> Send(CommandHandler handler, string json) =>
        handler.HandleAsync(Encoding.UTF8.GetBytes(json), CancellationToken.None);

    [Fact]
    public async Task RespondePingEValidaVersaoEFormato()
    {
        var handler = Create(out _, out var db);
        using var scope = db;

        var ping = await Send(handler, """{"v":2,"type":"command","id":"a","action":"PING","params":{}}""");
        Assert.True(ping.Ok);
        Assert.Equal("a", ping.Id);

        Assert.False((await Send(handler, "{nao é json")).Ok);
        Assert.False((await Send(handler, """{"v":1,"type":"command","id":"b","action":"PING"}""")).Ok);
        var unknown = await Send(handler, """{"v":2,"type":"command","id":"c","action":"FORMAT_C"}""");
        Assert.Equal("Comando desconhecido: FORMAT_C.", unknown.Error);
    }

    [Fact]
    public async Task SalvaConfiguracaoDeEnergiaValida()
    {
        var handler = Create(out var energy, out var db);
        using var scope = db;

        var ok = await Send(handler, """{"v":2,"type":"command","id":"1","action":"SET_ENERGY_CONFIG","params":{"tariffBrlPerKwh":1.1,"baseLoadW":45}}""");
        Assert.True(ok.Ok);
        Assert.Equal(1.1, energy.TariffBrlPerKwh);
        Assert.Equal(45, db.GetSetting(EnergySettings.BaseLoadKey, 0));

        var invalid = await Send(handler, """{"v":2,"type":"command","id":"2","action":"SET_ENERGY_CONFIG","params":{"tariffBrlPerKwh":-3}}""");
        Assert.False(invalid.Ok);
        Assert.Equal(1.1, energy.TariffBrlPerKwh);
    }

    [Fact]
    public async Task DevolveCurvaDeSilicioSoParaCpuOuGpu()
    {
        var handler = Create(out _, out var db);
        using var scope = db;

        var ok = await Send(handler, """{"v":2,"type":"command","id":"1","action":"GET_SILICON_CURVE","params":{"component":"gpu"}}""");
        Assert.True(ok.Ok);
        var json = JsonSerializer.Serialize(ok.Data, Protocol.Json);
        Assert.Contains("\"points\":[]", json);

        Assert.False((await Send(handler, """{"v":2,"type":"command","id":"2","action":"GET_SILICON_CURVE","params":{"component":"ram"}}""")).Ok);
    }
}

public class AlertTrackerTests
{
    private static TelemetryFrame Frame(ThermalTrend cpu, string lag = LagVerdicts.Normal) => new(
        new CpuData("CPU", 80, TempSources.Sensor, 50, 60, 80, 5000, 1.2, cpu),
        new GpuData("GPU", 60, 70, 70, 50, 100, 2500, 1.1, 4000, 8000, 1500, 50, new ThermalTrend(0, null, 90, false)),
        new MemoryData(8000, 16000, 50),
        new BoardData("Placa", 35, 50),
        [],
        [],
        new NetworkData("Ethernet", "192.168.0.1", 1, 20, 2, 0),
        new LagData(lag, lag == LagVerdicts.Network ? ["Perda de pacotes de 5%"] : []),
        new ContextData(Profiles.Idle, null, null),
        new EnergyData(200, 60, 0.95, 0.1, 0.1, 1, 0.95),
        new MaintenanceData(false, null, null, null, null),
        new EfficiencyData(null, null));

    [Fact]
    public void AlertaPreditivoSaiUmaVezPorOcorrencia()
    {
        var tracker = new AlertTracker();
        var hot = Frame(new ThermalTrend(0.8, 20, 95, false));

        var first = Assert.Single(tracker.Evaluate(hot));
        Assert.Equal(AlertKinds.PredictiveThrottle, first.Kind);
        Assert.Equal("CPU deve chegar a 95 °C em 20 s", first.Message);
        Assert.Empty(tracker.Evaluate(hot));

        tracker.Evaluate(Frame(new ThermalTrend(0, null, 95, false)));
        Assert.Single(tracker.Evaluate(hot));
    }

    [Fact]
    public void ThrottlingEPicoDeRedeGeramAlertasProprios()
    {
        var tracker = new AlertTracker();
        var alerts = tracker.Evaluate(Frame(new ThermalTrend(0.1, null, 95, true), LagVerdicts.Network));

        Assert.Contains(alerts, a => a.Kind == AlertKinds.Throttling && a.Severity == "critical");
        Assert.Contains(alerts, a => a.Kind == AlertKinds.NetworkSpike && a.Message == "Perda de pacotes de 5%");
        Assert.DoesNotContain(alerts, a => a.Kind == AlertKinds.PredictiveThrottle);
    }
}

public class NetworkAndProfileTests
{
    [Fact]
    public void JanelaDePingCalculaJitterPerdaEMediana()
    {
        var window = new PingWindow();
        foreach (var rtt in new double?[] { 20, 24, null, 22, 30 }) window.Add(rtt);

        Assert.Equal(20, window.LossPct);
        Assert.Equal(4.7, window.JitterMs); // |24−20| + |22−24| + |30−22| = 14 ÷ 3
        Assert.Equal(24, window.MedianMs);
        Assert.Equal(25.3, window.RecentAverageMs());
    }

    [Theory]
    [InlineData("cs2", 50.0, Profiles.CompetitiveFps)]
    [InlineData("Cyberpunk2077", 99.0, Profiles.AaaGraphics)]
    [InlineData("code", 5.0, Profiles.DevWorkstation)]
    [InlineData("explorer", 5.0, Profiles.Idle)]
    [InlineData("jogo-desconhecido", 95.0, Profiles.AaaGraphics)]
    [InlineData("notepad", 3.0, Profiles.Idle)]
    [InlineData(null, null, Profiles.Idle)]
    public void ClassificaOExecutavelEmFoco(string? exe, double? gpuLoad, string expected) =>
        Assert.Equal(expected, ForegroundProfiler.Classify(exe, gpuLoad));
}
