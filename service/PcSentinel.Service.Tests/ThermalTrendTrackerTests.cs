using PcSentinel.Service.Analytics;

namespace PcSentinel.Service.Tests;

public class ThermalTrendTrackerTests
{
    [Fact]
    public void CalculaInclinacaoEtempoAteOLimiteComAquecimentoLinear()
    {
        var tracker = new ThermalTrendTracker(limitC: 95);
        // 0,5 °C/s durante 10 s, amostras a 4 Hz: de 70 °C a 75 °C
        Contracts.ThermalTrend trend = null!;
        for (int i = 0; i <= 40; i++) trend = tracker.Add(i * 0.25, 70 + i * 0.125);

        Assert.Equal(0.5, trend.SlopeCPerS!.Value, precision: 3);
        // (95 − 75) / 0,5 = 40 s
        Assert.Equal(40, trend.TimeToThrottleS!.Value, precision: 1);
        Assert.False(trend.Throttling);
    }

    [Fact]
    public void DescartaAmostrasForaDaJanelaDe10Segundos()
    {
        var tracker = new ThermalTrendTracker(limitC: 95);
        // Subida forte no início, depois temperatura estável por 12 s
        for (int i = 0; i <= 20; i++) tracker.Add(i * 0.25, 60 + i);
        Contracts.ThermalTrend trend = null!;
        for (int i = 21; i <= 70; i++) trend = tracker.Add(i * 0.25, 80);

        Assert.Equal(0, trend.SlopeCPerS!.Value, precision: 3);
        Assert.Null(trend.TimeToThrottleS);
    }

    [Fact]
    public void NaoPreveQuandoATemperaturaCai()
    {
        var tracker = new ThermalTrendTracker(limitC: 95);
        Contracts.ThermalTrend trend = null!;
        for (int i = 0; i <= 40; i++) trend = tracker.Add(i * 0.25, 85 - i * 0.1);

        Assert.True(trend.SlopeCPerS < 0);
        Assert.Null(trend.TimeToThrottleS);
    }

    [Fact]
    public void ExigeJanelaMinimaAntesDePrever()
    {
        var tracker = new ThermalTrendTracker(limitC: 95);
        tracker.Add(0, 70);
        tracker.Add(0.25, 71);
        var trend = tracker.Add(0.5, 72);

        Assert.Null(trend.SlopeCPerS);
        Assert.Null(trend.TimeToThrottleS);
    }

    [Fact]
    public void MarcaThrottlingNoLimiteESemTemperaturaDevolveNulo()
    {
        var tracker = new ThermalTrendTracker(limitC: 90);
        Assert.True(tracker.Add(0, 90.5).Throttling);

        var empty = new ThermalTrendTracker(limitC: 90).Add(0, null);
        Assert.Null(empty.SlopeCPerS);
        Assert.False(empty.Throttling);
    }
}
