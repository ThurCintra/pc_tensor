using System.Diagnostics;
using PcSentinel.Service.Analytics;
using PcSentinel.Service.Context;
using PcSentinel.Service.Contracts;
using PcSentinel.Service.Network;
using PcSentinel.Service.Persistence;
using PcSentinel.Service.Sensors;

namespace PcSentinel.Service.Server;

public sealed class ThermalOptions
{
    public double CpuLimitC { get; set; } = 95;
    public double GpuLimitC { get; set; } = 90;
}

/// <summary>
/// Laço de telemetria (4 Hz): lê os sensores, roda as análises, monta o quadro, envia aos clientes e
/// grava no SQLite a cada minuto. É o único lugar que conhece todas as peças.
/// </summary>
public sealed class TelemetryEngine(
    HardwareSampler sampler,
    NetworkProbe network,
    ForegroundProfiler foreground,
    TelemetryDb db,
    EnergySettings energySettings,
    WebSocketHub hub,
    ThermalOptions thermal,
    ILogger<TelemetryEngine> logger) : BackgroundService
{
    public static readonly TimeSpan TickInterval = TimeSpan.FromMilliseconds(250);
    private static readonly TimeSpan FlushInterval = TimeSpan.FromMinutes(1);

    private readonly ThermalTrendTracker _cpuTrend = new(thermal.CpuLimitC);
    private readonly ThermalTrendTracker _gpuTrend = new(thermal.GpuLimitC);
    private readonly EnergyMeter _energy = new();
    private readonly SiliconEfficiencyTracker _cpuSilicon = new("cpu");
    private readonly SiliconEfficiencyTracker _gpuSilicon = new("gpu");
    private readonly DegradationAnalyzer _degradation = new();
    private readonly AlertTracker _alerts = new();
    private readonly Stopwatch _clock = Stopwatch.StartNew();

    private double _monthKwhStored;
    private MaintenanceData _maintenance = new(false, null, null, null, null);
    private TimeSpan _lastFlush;

    /// <summary>Último quadro montado (para quem conecta entre dois ticks ou para diagnóstico).</summary>
    public TelemetryFrame? Latest { get; private set; }

    /// <summary>
    /// Cada quadro com os alertas que ele disparou e o instante (s, relógio monotônico). Usado pelo conector da
    /// nuvem; os assinantes rodam no laço de telemetria e precisam ser rápidos (só enfileirar).
    /// </summary>
    public event Action<TelemetryFrame, IReadOnlyList<AlertData>, double>? FrameProduced;

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        energySettings.TariffBrlPerKwh = db.GetSetting(EnergySettings.TariffKey, EnergySettings.DefaultTariffBrlPerKwh);
        energySettings.BaseLoadW = db.GetSetting(EnergySettings.BaseLoadKey, EnergySettings.DefaultBaseLoadW);
        RefreshMonth(Today());

        await Task.Run(sampler.Open, ct);
        network.Start();

        using var timer = new PeriodicTimer(TickInterval);
        try
        {
            do
            {
                try
                {
                    Tick();
                }
                catch (Exception ex)
                {
                    // Um sensor com defeito não pode derrubar a transmissão
                    logger.LogError(ex, "Falha no ciclo de telemetria");
                }
            }
            while (await timer.WaitForNextTickAsync(ct));
        }
        catch (OperationCanceledException) { }
        finally
        {
            Flush();
        }
    }

    private void Tick()
    {
        double t = _clock.Elapsed.TotalSeconds;
        var hw = sampler.Sample();

        // A previsão de throttling usa o limite dos núcleos; com a temperatura do die de E/S ela seria otimista
        var cpuTrend = _cpuTrend.Add(t, hw.CpuTempSource == TempSources.IoDie ? null : hw.CpuTempC);
        var gpuTrend = _gpuTrend.Add(t, hw.GpuTempC);

        var net = network.Snapshot();
        var lag = LagJudge.Judge(new LagInputs(
            net.InternetLatencyMs, network.Internet.MedianMs, net.JitterMs, net.LossPct,
            hw.CpuLoadPct, hw.CpuMaxCoreLoadPct, hw.GpuLoadPct, hw.GpuVramUsedMb, hw.GpuVramTotalMb));

        var context = foreground.Detect(hw.GpuLoadPct);

        double systemPower = _energy.Add(t, hw.CpuPowerW, hw.GpuPowerW, energySettings.BaseLoadW);
        double monthKwh = _monthKwhStored + _energy.PendingKwh;

        _cpuSilicon.Add(hw.CpuLoadPct, hw.CpuClockMhz, hw.CpuVcoreV, hw.CpuPowerW);
        _gpuSilicon.Add(hw.GpuLoadPct, hw.GpuClockMhz, hw.GpuVcoreV, hw.GpuPowerW);
        _degradation.Add("cpu", hw.CpuPowerW, hw.CpuTempSource == TempSources.IoDie ? null : hw.CpuTempC, hw.BoardSystemTempC, hw.CpuFanPct, cpuTrend.SlopeCPerS);
        _degradation.Add("gpu", hw.GpuPowerW, hw.GpuTempC, hw.BoardSystemTempC, hw.GpuFanPct, gpuTrend.SlopeCPerS);

        if (_clock.Elapsed - _lastFlush >= FlushInterval) Flush();

        double tariff = energySettings.TariffBrlPerKwh;
        var frame = new TelemetryFrame(
            new CpuData(hw.CpuName, hw.CpuTempC, hw.CpuTempSource, hw.CpuLoadPct, hw.CpuMaxCoreLoadPct, hw.CpuPowerW, hw.CpuClockMhz, hw.CpuVcoreV, cpuTrend),
            new GpuData(hw.GpuName, hw.GpuTempC, hw.GpuHotspotC, hw.GpuMemoryTempC, hw.GpuLoadPct, hw.GpuPowerW, hw.GpuClockMhz,
                hw.GpuVcoreV, hw.GpuVramUsedMb, hw.GpuVramTotalMb, hw.GpuFanRpm, hw.GpuFanPct, gpuTrend),
            new MemoryData(hw.MemoryUsedMb, hw.MemoryTotalMb, hw.MemoryLoadPct),
            new BoardData(hw.BoardName, hw.BoardSystemTempC, hw.BoardVrmTempC),
            hw.Storage,
            hw.Fans,
            net,
            lag,
            context,
            new EnergyData(
                Math.Round(systemPower, 1),
                energySettings.BaseLoadW,
                tariff,
                Math.Round(_energy.SessionKwh, 4),
                EnergyMeter.Cost(_energy.SessionKwh, tariff),
                Math.Round(monthKwh, 3),
                EnergyMeter.Cost(monthKwh, tariff)),
            _maintenance,
            new EfficiencyData(_cpuSilicon.Summary(), _gpuSilicon.Summary()));

        Latest = frame;
        hub.Broadcast(MessageTypes.Telemetry, frame);
        var alerts = _alerts.Evaluate(frame);
        foreach (var alert in alerts) hub.Broadcast(MessageTypes.Alert, alert);
        FrameProduced?.Invoke(frame, alerts, t);
    }

    /// <summary>Grava energia, linhas de base e curva de silício, e reavalia a degradação.</summary>
    private void Flush()
    {
        _lastFlush = _clock.Elapsed;
        var today = Today();
        try
        {
            db.AddEnergy(today, _energy.TakePendingKwh());
            RefreshMonth(today);

            var week = DegradationAnalyzer.WeekStart(today);
            foreach (var ((component, bucket), stats) in _degradation.TakePending())
                db.MergeBaseline(component, bucket, week, stats);

            foreach (var tracker in new[] { _cpuSilicon, _gpuSilicon })
                foreach (var (clockBucket, stats) in tracker.TakePending())
                    db.MergeSilicon(tracker.Component, clockBucket, stats);

            var cutoff = DegradationAnalyzer.BaselineCutoff(today);
            _maintenance = _degradation.Evaluate((c, b) => db.GetBaseline(c, b, cutoff), today);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Falha ao gravar a telemetria no banco");
        }
    }

    private void RefreshMonth(DateOnly today)
    {
        _monthKwhStored = db.GetMonthKwh(today);
    }

    private static DateOnly Today() => DateOnly.FromDateTime(DateTime.Now);
}
