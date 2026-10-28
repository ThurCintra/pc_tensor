using PcSentinel.Service.Analytics;
using PcSentinel.Service.Contracts;

namespace PcSentinel.Service.Tests;

public class EnergyMeterTests
{
    [Fact]
    public void IntegraPotenciaConstanteEmKwh()
    {
        var meter = new EnergyMeter();
        // 240 W (100 + 80 + 60 de base) durante 1 hora em passos de 1 s = 0,24 kWh
        for (int s = 0; s <= 3600; s++) meter.Add(s, 100, 80, 60);

        Assert.Equal(0.24, meter.SessionKwh, precision: 6);
        Assert.Equal(0.23, EnergyMeter.Cost(meter.SessionKwh, 0.95));
    }

    [Fact]
    public void UsaRegraDoTrapezioEntreLeituras()
    {
        var meter = new EnergyMeter();
        meter.Add(0, 0, 0, 0);
        meter.Add(10, 360, 0, 0); // rampa de 0 a 360 W em 10 s = 1800 J = 0,0005 kWh

        Assert.Equal(0.0005, meter.SessionKwh, precision: 12);
    }

    [Fact]
    public void IgnoraIntervalosLongosEZeraOPendenteAoGravar()
    {
        var meter = new EnergyMeter();
        meter.Add(0, 100, 0, 0);
        meter.Add(120, 100, 0, 0); // PC suspenso por 2 min: não conta
        Assert.Equal(0, meter.SessionKwh);

        meter.Add(121, 100, 0, 0);
        Assert.True(meter.TakePendingKwh() > 0);
        Assert.Equal(0, meter.PendingKwh);
    }
}

public class LagJudgeTests
{
    private static LagInputs Inputs(
        double? latency = 20, double? baseline = 20, double? jitter = 2, double? loss = 0,
        double? maxCore = 50, double? gpu = 90, double? vramUsed = 4000, double? vramTotal = 8000) =>
        new(latency, baseline, jitter, loss, 40, maxCore, gpu, vramUsed, vramTotal);

    [Fact]
    public void SemAnomaliaRetornaNormal() =>
        Assert.Equal(LagVerdicts.Normal, LagJudge.Judge(Inputs()).Verdict);

    [Theory]
    [InlineData(20, 20, 2, 4)] // perda de pacotes
    [InlineData(20, 20, 25, 0)] // jitter alto
    [InlineData(90, 20, 2, 0)] // pico de latência
    public void DetectaCausaDeRede(double latency, double baseline, double jitter, double loss)
    {
        var result = LagJudge.Judge(Inputs(latency, baseline, jitter, loss));
        Assert.Equal(LagVerdicts.Network, result.Verdict);
        Assert.NotEmpty(result.Reasons);
    }

    [Fact]
    public void RedeTemPrioridadeSobreHardware() =>
        Assert.Equal(LagVerdicts.Network, LagJudge.Judge(Inputs(loss: 5, maxCore: 100, gpu: 40)).Verdict);

    [Fact]
    public void DetectaVramCheia() =>
        Assert.Equal(LagVerdicts.VramOverflow, LagJudge.Judge(Inputs(vramUsed: 7900, vramTotal: 8176)).Verdict);

    [Fact]
    public void DetectaGargaloDeCpuSoComGpuOciosa()
    {
        Assert.Equal(LagVerdicts.CpuBottleneck, LagJudge.Judge(Inputs(maxCore: 99, gpu: 60)).Verdict);
        // GPU também no máximo: o jogo está pesado nos dois, não é gargalo de CPU
        Assert.Equal(LagVerdicts.Normal, LagJudge.Judge(Inputs(maxCore: 99, gpu: 98)).Verdict);
        // GPU quase parada (sem jogo): núcleo a 100% por um instante é uso normal
        Assert.Equal(LagVerdicts.Normal, LagJudge.Judge(Inputs(maxCore: 100, gpu: 19)).Verdict);
        Assert.Equal(LagVerdicts.Normal, LagJudge.Judge(Inputs(maxCore: 100, gpu: null)).Verdict);
    }

    [Fact]
    public void PequenaVariacaoDeLatenciaNaoContaComoPico() =>
        Assert.Equal(LagVerdicts.Normal, LagJudge.Judge(Inputs(latency: 45, baseline: 20)).Verdict);
}

public class RunningStatsTests
{
    [Fact]
    public void JuncaoDeConjuntosEquivaleAProcessarTudoJunto()
    {
        double[] a = [1.20, 1.25, 1.22, 1.30];
        double[] b = [1.28, 1.24, 1.21];
        RunningStats sa = default, sb = default, all = default;
        foreach (var v in a) { sa.Add(v); all.Add(v); }
        foreach (var v in b) { sb.Add(v); all.Add(v); }

        var merged = RunningStats.Merge(sa, sb);

        Assert.Equal(all.Count, merged.Count);
        Assert.Equal(all.Mean, merged.Mean, precision: 12);
        Assert.Equal(all.SampleStdDev!.Value, merged.SampleStdDev!.Value, precision: 12);
    }
}

public class SiliconEfficiencyTrackerTests
{
    [Fact]
    public void SoConsideraLeiturasSobCarga()
    {
        var tracker = new SiliconEfficiencyTracker("cpu");
        tracker.Add(loadPct: 30, clockMhz: 5000, vcoreV: 1.2, powerW: 40); // ocioso: ignorado
        tracker.Add(90, 5000, 1.20, 100);
        tracker.Add(95, 5400, 1.30, 80);

        var summary = tracker.Summary();
        Assert.Equal(2, summary.Samples);
        Assert.Equal(57.8, summary.MhzPerWatt); // 5200 MHz ÷ 90 W
        Assert.Equal(70.7, summary.VcoreStdDevMv); // desvio de [1,20; 1,30] V

        var buckets = tracker.TakePending();
        Assert.Equal(new[] { 5000, 5400 }, buckets.Keys.Order());
        Assert.Empty(tracker.TakePending());
    }

    [Fact]
    public void RestaurarSomaOAcumuladoDeExecucoesAnteriores()
    {
        var antes = new SiliconEfficiencyTracker("cpu");
        antes.Add(90, 5000, 1.20, 100);

        // App reiniciado: o novo rastreador retoma o acumulado gravado e continua somando
        var depois = new SiliconEfficiencyTracker("cpu");
        depois.Add(95, 5400, 1.30, 80);
        depois.Restore(antes.Totals());

        var summary = depois.Summary();
        Assert.Equal(2, summary.Samples);
        Assert.Equal(57.8, summary.MhzPerWatt);
        Assert.Equal(70.7, summary.VcoreStdDevMv);
    }
}

public class DegradationAnalyzerTests
{
    private static readonly DateOnly Today = new(2026, 10, 24);

    private static BaselineStats Baseline(double deltaC, double fanPct, long n = 1000)
    {
        RunningStats delta = default, fan = default;
        for (int i = 0; i < n; i++) { delta.Add(deltaC); fan.Add(fanPct); }
        return new BaselineStats(delta, fan, new DateOnly(2026, 9, 7));
    }

    private static DegradationAnalyzer SessionAt(double tempC, double fanPct, double powerW = 85)
    {
        var analyzer = new DegradationAnalyzer();
        for (int i = 0; i < 200; i++) analyzer.Add("cpu", powerW, tempC, 35, fanPct, slopeCPerS: 0.01);
        return analyzer;
    }

    [Fact]
    public void AvisaQuandoEsquentaCincoGrausAMaisComOMesmoConsumo()
    {
        var result = SessionAt(tempC: 76, fanPct: 50).Evaluate((_, _) => Baseline(deltaC: 35, fanPct: 50), Today);

        Assert.True(result.Warning);
        Assert.Equal("cpu", result.Component);
        Assert.Equal(6, result.TempDeltaC); // ΔT 41 contra 35
        Assert.Equal(47, result.BaselineAgeDays);
    }

    [Fact]
    public void AvisaQuandoAVentoinhaPrecisaGirar15PorCentoAMais()
    {
        var result = SessionAt(tempC: 71, fanPct: 60).Evaluate((_, _) => Baseline(deltaC: 35, fanPct: 50), Today);

        Assert.True(result.Warning);
        Assert.Equal(20, result.FanDeltaPct);
    }

    [Fact]
    public void NaoAvisaDentroDaVariacaoNormalOuSemLinhaDeBase()
    {
        Assert.False(SessionAt(72, 52).Evaluate((_, _) => Baseline(35, 50), Today).Warning);
        Assert.False(SessionAt(90, 90).Evaluate((_, _) => null, Today).Warning);
        Assert.False(SessionAt(90, 90).Evaluate((_, _) => Baseline(35, 50, n: 100), Today).Warning);
    }

    [Fact]
    public void IgnoraLeiturasForaDoRegimeEstavel()
    {
        var analyzer = new DegradationAnalyzer();
        for (int i = 0; i < 200; i++) analyzer.Add("cpu", 85, 90, 35, 90, slopeCPerS: 0.6);

        Assert.Empty(analyzer.TakePending());
    }

    [Fact]
    public void CalculaFaixasESemanas()
    {
        Assert.Equal(80, DegradationAnalyzer.BucketFor("cpu", 87.9));
        Assert.Equal(140, DegradationAnalyzer.BucketFor("gpu", 151));
        Assert.Equal(new DateOnly(2026, 10, 19), DegradationAnalyzer.WeekStart(Today)); // sábado → segunda
        Assert.Equal(new DateOnly(2026, 10, 5), DegradationAnalyzer.BaselineCutoff(Today));
    }
}
