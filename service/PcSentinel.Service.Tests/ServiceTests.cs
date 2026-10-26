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
    [InlineData("PC Sentinel", 85.0, Profiles.Idle)]
    [InlineData("electron", 73.0, Profiles.Idle)]
    [InlineData(null, null, Profiles.Idle)]
    public void ClassificaOExecutavelEmFoco(string? exe, double? gpuLoad, string expected) =>
        Assert.Equal(expected, ForegroundProfiler.Classify(exe, gpuLoad));

    [Fact]
    public void GpuOscilandoEmVoltaDe70NaoTrocaOPerfil()
    {
        // Entra em AAA a partir de 70% e só sai abaixo de 40%
        Assert.Equal(Profiles.Idle, ForegroundProfiler.Classify("jogo-desconhecido", 65, wasHeavy: false));
        Assert.Equal(Profiles.AaaGraphics, ForegroundProfiler.Classify("jogo-desconhecido", 72, wasHeavy: false));
        Assert.Equal(Profiles.AaaGraphics, ForegroundProfiler.Classify("jogo-desconhecido", 55, wasHeavy: true));
        Assert.Equal(Profiles.Idle, ForegroundProfiler.Classify("jogo-desconhecido", 35, wasHeavy: true));
    }

    [Fact]
    public void PerfilSoMudaDepoisDe3SegundosSeguidos()
    {
        var stabilizer = new ProfileStabilizer(holdS: 3);
        Assert.Equal(Profiles.Idle, stabilizer.Update(Profiles.Idle, 0)); // primeira leitura vale na hora

        // Piscando entre dois perfis a cada 250 ms: o layout não se mexe
        for (double t = 0.25; t < 10; t += 0.5)
        {
            Assert.Equal(Profiles.Idle, stabilizer.Update(Profiles.AaaGraphics, t));
            Assert.Equal(Profiles.Idle, stabilizer.Update(Profiles.Idle, t + 0.25));
        }

        // Mudança de verdade (abriu um jogo): troca depois de 3 s seguidos
        Assert.Equal(Profiles.Idle, stabilizer.Update(Profiles.CompetitiveFps, 20));
        Assert.Equal(Profiles.Idle, stabilizer.Update(Profiles.CompetitiveFps, 22.9));
        Assert.Equal(Profiles.CompetitiveFps, stabilizer.Update(Profiles.CompetitiveFps, 23));
    }
}

public class ProfileRuleTests
{
    private static Task<CommandResult> Send(CommandHandler handler, string action, string paramsJson) =>
        handler.HandleAsync(
            Encoding.UTF8.GetBytes($$"""{"v":2,"type":"command","id":"r","action":"{{action}}","params":{{paramsJson}}}"""),
            CancellationToken.None);

    [Theory]
    [InlineData("meu_jogo.exe", "meu_jogo")]
    [InlineData(@"C:\Jogos\Meu Jogo\MeuJogo.EXE", "meujogo")]
    [InlineData("D:/games/Tarkov.exe", "tarkov")]
    [InlineData("  Valorant  ", "valorant")]
    [InlineData("", null)]
    [InlineData("rm -rf /;", null)]
    [InlineData("jogo<script>.exe", null)]
    public void NormalizaONomeDoExecutavel(string input, string? expected) =>
        Assert.Equal(expected, ProfileRuleStore.Normalize(input));

    [Fact]
    public void RegraDoUsuarioVenceAsListasFixasEARegraDaGpu()
    {
        var rules = new ProfileRuleStore();
        Assert.NotNull(rules.Set("meu_jogo.exe", Profiles.CompetitiveFps).Rule);
        Assert.NotNull(rules.Set("cs2.exe", Profiles.Idle).Rule);           // reclassifica um da lista fixa
        Assert.NotNull(rules.Set("blender.exe", Profiles.AaaGraphics).Rule); // e um de trabalho

        // O profiler recebe o nome do processo (sem .exe, com a caixa original)
        Assert.Equal(Profiles.CompetitiveFps, ForegroundProfiler.Classify("Meu_Jogo", 5, rules: rules));
        Assert.Equal(Profiles.Idle, ForegroundProfiler.Classify("cs2", 99, rules: rules));
        Assert.Equal(Profiles.AaaGraphics, ForegroundProfiler.Classify("blender", 3, rules: rules));

        // Sem regra, tudo como antes
        Assert.Equal(Profiles.CompetitiveFps, ForegroundProfiler.Classify("valorant", 10, rules: rules));
        Assert.Equal(Profiles.Idle, ForegroundProfiler.Classify("outro", 10, rules: rules));
        Assert.Equal(Profiles.Idle, ForegroundProfiler.Classify(null, 99, rules: rules));
    }

    [Fact]
    public void RecusaPerfilInvalidoEExecutavelInvalido()
    {
        var rules = new ProfileRuleStore();
        Assert.Contains("Perfil inválido", rules.Set("jogo.exe", "TURBO").Error);
        Assert.Contains("executável", rules.Set("jogo*.exe", Profiles.Idle).Error);
        Assert.Contains("executável", rules.Set(@"C:\Jogos\", Profiles.Idle).Error); // só a pasta, sem arquivo
        Assert.Equal(0, rules.Count);
    }

    [Fact]
    public void RegrasSobrevivemAoReinicioPeloSqlite()
    {
        string path = Path.Combine(Path.GetTempPath(), $"pcs-regras-{Guid.NewGuid():N}.db");
        try
        {
            using (var db = new TelemetryDb(path))
            {
                var rules = new ProfileRuleStore(db);
                rules.Set("meu_jogo.exe", Profiles.CompetitiveFps);
                rules.Set("editor.exe", Profiles.DevWorkstation);
                Assert.True(rules.Remove("EDITOR.exe"));
            }

            using var reopened = new TelemetryDb(path);
            var loaded = new ProfileRuleStore(reopened);
            Assert.Equal([new ProfileRule("meu_jogo", Profiles.CompetitiveFps)], loaded.All());
        }
        finally
        {
            Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
            foreach (var file in new[] { path, path + "-wal", path + "-shm" }) File.Delete(file);
        }
    }

    [Fact]
    public async Task ComandosCriamListamERemovemRegras()
    {
        var db = new TelemetryDb(":memory:");
        var rules = new ProfileRuleStore(db);
        var handler = new CommandHandler(
            new StutterBuster(), db, new EnergySettings(), NullLogger<CommandHandler>.Instance, profileRules: rules);

        var set = await Send(handler, "SET_PROFILE_RULE", """{"exe":"meu_jogo.exe","profile":"COMPETITIVE_FPS"}""");
        Assert.True(set.Ok, set.Error);
        Assert.Equal(Profiles.CompetitiveFps, ForegroundProfiler.Classify("meu_jogo", 0, rules: rules));
        Assert.Equal("COMPETITIVE_FPS", db.GetProfileRules()["meu_jogo"]);

        var list = await Send(handler, "GET_PROFILE_RULES", "{}");
        Assert.Contains("meu_jogo", JsonSerializer.Serialize(list.Data, Protocol.Json));

        var invalid = await Send(handler, "SET_PROFILE_RULE", """{"exe":"meu_jogo.exe","profile":"TURBO"}""");
        Assert.False(invalid.Ok);
        Assert.Contains("Perfil inválido", invalid.Error);

        Assert.True((await Send(handler, "REMOVE_PROFILE_RULE", """{"exe":"MEU_JOGO.EXE"}""")).Ok);
        Assert.Equal(Profiles.Idle, ForegroundProfiler.Classify("meu_jogo", 0, rules: rules));
        Assert.False((await Send(handler, "REMOVE_PROFILE_RULE", """{"exe":"meu_jogo.exe"}""")).Ok);
    }

    [Fact]
    public void ProfilerUsaARegraNoQuadroReal()
    {
        // O processo em foco durante o teste é o próprio test host: uma regra para ele muda o perfil detectado
        var (exe, _) = ForegroundProfiler.GetForegroundProcess();
        if (exe is null) return; // sem janela em foco (CI sem desktop): nada a medir
        var rules = new ProfileRuleStore();
        rules.Set(exe, Profiles.DevWorkstation);
        var profiler = new ForegroundProfiler(rules);
        Assert.Equal(Profiles.DevWorkstation, profiler.Detect(0, 0).Profile);
    }
}
