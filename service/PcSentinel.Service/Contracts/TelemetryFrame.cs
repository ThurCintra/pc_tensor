namespace PcSentinel.Service.Contracts;

/// <summary>Quadro de telemetria enviado a cada 250 ms (type = "telemetry").</summary>
public sealed record TelemetryFrame(
    CpuData Cpu,
    GpuData Gpu,
    MemoryData Memory,
    BoardData Board,
    IReadOnlyList<StorageData> Storage,
    IReadOnlyList<FanData> Fans,
    NetworkData Network,
    LagData Lag,
    ContextData Context,
    EnergyData Energy,
    MaintenanceData Maintenance,
    EfficiencyData Efficiency);

public sealed record ThermalTrend(double? SlopeCPerS, double? TimeToThrottleS, double LimitC, bool Throttling);

public sealed record CpuData(
    string? Name,
    double? TempC,
    string? TempSource,
    double? LoadPct,
    double? MaxCoreLoadPct,
    double? PowerW,
    double? ClockMhz,
    double? VcoreV,
    ThermalTrend Thermal);

/// <summary>Origem de cpu.tempC.</summary>
public static class TempSources
{
    /// <summary>Sensor dos núcleos (Tctl/Package) pelo LibreHardwareMonitor; exige administrador.</summary>
    public const string Sensor = "sensor";

    /// <summary>Temperatura da CPU informada pelo driver da placa AMD.</summary>
    public const string AmdDriver = "amdDriver";

    /// <summary>Die de E/S do Ryzen (via GPU integrada): real, mas mais frio que os núcleos.</summary>
    public const string IoDie = "ioDie";
}

public sealed record GpuData(
    string? Name,
    double? TempC,
    double? HotspotC,
    double? MemoryTempC,
    double? LoadPct,
    double? PowerW,
    double? ClockMhz,
    double? VcoreV,
    double? VramUsedMb,
    double? VramTotalMb,
    double? FanRpm,
    double? FanPct,
    ThermalTrend Thermal);

public sealed record MemoryData(double? UsedMb, double? TotalMb, double? LoadPct);

public sealed record BoardData(string? Name, double? SystemTempC, double? VrmTempC);

public sealed record StorageData(string Name, double? TempC);

public sealed record FanData(string Name, double? Rpm, double? Pct);

public sealed record NetworkData(
    string? Adapter,
    string? Gateway,
    double? GatewayLatencyMs,
    double? InternetLatencyMs,
    double? JitterMs,
    double? LossPct);

public sealed record LagData(string Verdict, IReadOnlyList<string> Reasons);

public static class LagVerdicts
{
    public const string Normal = "NORMAL";
    public const string Network = "CAUSE_NETWORK";
    public const string CpuBottleneck = "CAUSE_CPU_BOTTLENECK";
    public const string VramOverflow = "CAUSE_VRAM_OVERFLOW";
}

public sealed record ContextData(string Profile, string? ForegroundExe, int? ForegroundPid);

public static class Profiles
{
    public const string CompetitiveFps = "COMPETITIVE_FPS";
    public const string AaaGraphics = "AAA_GRAPHICS";
    public const string DevWorkstation = "DEV_WORKSTATION";
    public const string Idle = "IDLE";

    public static readonly IReadOnlyList<string> All = [CompetitiveFps, AaaGraphics, DevWorkstation, Idle];
}

public sealed record EnergyData(
    double SystemPowerW,
    double BaseLoadW,
    double TariffBrlPerKwh,
    double SessionKwh,
    double SessionCostBrl,
    double MonthKwh,
    double MonthCostBrl);

public sealed record MaintenanceData(
    bool Warning,
    string? Component,
    double? TempDeltaC,
    double? FanDeltaPct,
    double? BaselineAgeDays);

public sealed record EfficiencyData(SiliconEfficiency? Cpu, SiliconEfficiency? Gpu);

public sealed record SiliconEfficiency(double? MhzPerWatt, double? VcoreStdDevMv, long Samples);

public sealed record SiliconCurvePoint(double ClockMhz, double VcoreV, double PowerW, long Samples);
