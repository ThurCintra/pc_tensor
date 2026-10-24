using System.Text.Json.Nodes;
using System.Text.Json;
using PcSentinel.Service.Contracts;

namespace PcSentinel.Service.Cloud;

/// <summary>Mensagens do agente para a nuvem (cloud/packages/protocol).</summary>
public sealed record CloudHeartbeat(
    long Ts,
    string Profile,
    double? AvgCpuTemp,
    double? AvgGpuTemp,
    double? MaxTemp,
    double EnergyConsumedWh);

public sealed record CloudAlert(string Type, string Component, string Message, double? Value);

public sealed record CloudCommandResult(bool Ok, string Message, Dictionary<string, object?>? Data = null);

public static class CloudProfiles
{
    /// <summary>Perfis locais (contrato v2) → perfis da nuvem.</summary>
    public static string ToCloud(string localProfile) => localProfile switch
    {
        Profiles.CompetitiveFps => "COMPETITIVE_FPS",
        Profiles.AaaGraphics => "AAA_GAMING",
        Profiles.DevWorkstation => "WORKSTATION",
        _ => "IDLE",
    };
}

public static class CloudFrames
{
    /// <summary>
    /// Quadro LIVE: o quadro local inteiro (o painel da nuvem usa os mesmos cards) mais ts e o perfil no
    /// vocabulário da nuvem. O servidor valida cpu/gpu/profile/ts e repassa o resto sem tocar.
    /// </summary>
    public static JsonObject Live(TelemetryFrame frame, long ts)
    {
        var node = JsonSerializer.SerializeToNode(frame, Protocol.Json)!.AsObject();
        node["ts"] = ts;
        node["profile"] = CloudProfiles.ToCloud(frame.Context.Profile);
        return node;
    }
}

/// <summary>
/// Resumo de um minuto para o modo HEARTBEAT: médias de temperatura, máxima e energia consumida (Wh), a
/// partir dos quadros de 250 ms. A energia integra a potência do sistema pela regra do trapézio.
/// </summary>
public sealed class HeartbeatAggregator
{
    private const double MaxGapSeconds = 10;

    private double _cpuSum, _gpuSum;
    private int _cpuCount, _gpuCount;
    private double? _maxTemp;
    private double _energyWh;
    private double? _lastT;
    private double _lastPowerW;
    private string _profile = "IDLE";

    public int Samples { get; private set; }

    public void Add(TelemetryFrame frame, double timestampS)
    {
        Samples++;
        _profile = CloudProfiles.ToCloud(frame.Context.Profile);

        if (frame.Cpu.TempC is double cpu)
        {
            _cpuSum += cpu;
            _cpuCount++;
        }
        if (frame.Gpu.TempC is double gpu)
        {
            _gpuSum += gpu;
            _gpuCount++;
        }
        foreach (double? t in new[] { frame.Cpu.TempC, frame.Gpu.TempC, frame.Gpu.HotspotC })
        {
            if (t is double v && (_maxTemp is null || v > _maxTemp)) _maxTemp = v;
        }

        double power = frame.Energy.SystemPowerW;
        if (_lastT is double last)
        {
            double dt = timestampS - last;
            if (dt > 0 && dt <= MaxGapSeconds) _energyWh += (_lastPowerW + power) / 2 * dt / 3600;
        }
        _lastT = timestampS;
        _lastPowerW = power;
    }

    /// <summary>Fecha o minuto e começa outro; null se não chegou nenhum quadro.</summary>
    public CloudHeartbeat? Take(long ts)
    {
        if (Samples == 0) return null;
        var heartbeat = new CloudHeartbeat(
            ts,
            _profile,
            _cpuCount > 0 ? Math.Round(_cpuSum / _cpuCount, 1) : null,
            _gpuCount > 0 ? Math.Round(_gpuSum / _gpuCount, 1) : null,
            _maxTemp is double m ? Math.Round(m, 1) : null,
            Math.Round(_energyWh, 3));

        _cpuSum = _gpuSum = _energyWh = 0;
        _cpuCount = _gpuCount = Samples = 0;
        _maxTemp = null;
        // Mantém _lastT/_lastPowerW: a energia continua sendo integrada sem buraco entre os minutos
        return heartbeat;
    }
}

/// <summary>
/// Superaquecimento pelos limites que o usuário definiu no site (por PC). Avisa na hora em que a temperatura
/// passa do limite (mesmo no modo HEARTBEAT) e só avisa de novo depois que ela cair 3 °C abaixo dele.
/// </summary>
public sealed class OverheatMonitor
{
    private const double HysteresisC = 3;
    private readonly HashSet<string> _active = new();

    public AlertLimits Limits { get; set; } = AlertLimits.Default;

    public IReadOnlyList<CloudAlert> Evaluate(TelemetryFrame frame)
    {
        var alerts = new List<CloudAlert>();
        Check(alerts, "cpu", "CPU", frame.Cpu.TempSource == TempSources.IoDie ? null : frame.Cpu.TempC, Limits.MaxCpuTempAlert);
        Check(alerts, "gpu", "GPU", frame.Gpu.TempC, Limits.MaxGpuTempAlert);
        return Limits.AlertsEnabled ? alerts : [];
    }

    private void Check(List<CloudAlert> alerts, string component, string label, double? temp, int limit)
    {
        if (temp is not double t) return;
        if (t >= limit)
        {
            if (_active.Add(component))
                alerts.Add(new CloudAlert("OVERHEAT", component, $"{label} a {t:0} °C (limite {limit} °C)", t));
        }
        else if (t <= limit - HysteresisC)
        {
            _active.Remove(component);
        }
    }

    /// <summary>Alertas locais que também vão para a nuvem (o resto, como pico de rede, fica só no PC).</summary>
    public static CloudAlert? FromLocal(AlertData alert) => alert.Kind switch
    {
        AlertKinds.PredictiveThrottle => new CloudAlert("PREDICTIVE_THROTTLE", alert.Component, alert.Message, alert.Value),
        AlertKinds.Maintenance => new CloudAlert("DUST_WARNING", alert.Component, alert.Message, alert.Value),
        _ => null,
    };
}
