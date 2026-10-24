using PcSentinel.Service.Contracts;

namespace PcSentinel.Service.Server;

/// <summary>
/// Converte condições contínuas em alertas por transição: um alerta sai quando a condição começa e só
/// volta a sair depois que ela some (evita mandar o mesmo aviso 4 vezes por segundo).
/// </summary>
public sealed class AlertTracker
{
    public const double PredictiveThresholdS = 30;

    private readonly HashSet<string> _active = new();

    public IReadOnlyList<AlertData> Evaluate(TelemetryFrame frame)
    {
        var alerts = new List<AlertData>();

        Thermal(alerts, "cpu", "CPU", frame.Cpu.Thermal);
        Thermal(alerts, "gpu", "GPU", frame.Gpu.Thermal);

        Edge(alerts, $"{AlertKinds.NetworkSpike}", frame.Lag.Verdict == LagVerdicts.Network, () => new AlertData(
            AlertKinds.NetworkSpike, "network", "warning",
            frame.Lag.Reasons.Count > 0 ? frame.Lag.Reasons[0] : "Instabilidade na rede", frame.Network.LossPct));

        Edge(alerts, $"{AlertKinds.Maintenance}", frame.Maintenance.Warning, () => new AlertData(
            AlertKinds.Maintenance, frame.Maintenance.Component ?? "cpu", "info",
            MaintenanceMessage(frame.Maintenance), frame.Maintenance.TempDeltaC));

        return alerts;
    }

    private void Thermal(List<AlertData> alerts, string component, string label, ThermalTrend trend)
    {
        Edge(alerts, $"{AlertKinds.Throttling}:{component}", trend.Throttling, () => new AlertData(
            AlertKinds.Throttling, component, "critical",
            $"{label} chegou a {trend.LimitC:0} °C e pode reduzir o desempenho", trend.LimitC));

        bool predictive = !trend.Throttling && trend.TimeToThrottleS is double t && t < PredictiveThresholdS;
        Edge(alerts, $"{AlertKinds.PredictiveThrottle}:{component}", predictive, () => new AlertData(
            AlertKinds.PredictiveThrottle, component, "warning",
            $"{label} deve chegar a {trend.LimitC:0} °C em {trend.TimeToThrottleS:0} s", trend.TimeToThrottleS));
    }

    private void Edge(List<AlertData> alerts, string key, bool condition, Func<AlertData> create)
    {
        if (condition)
        {
            if (_active.Add(key)) alerts.Add(create());
        }
        else
        {
            _active.Remove(key);
        }
    }

    private static string MaintenanceMessage(MaintenanceData m)
    {
        string label = m.Component == "gpu" ? "A placa de vídeo" : "O processador";
        string detail = m.TempDeltaC >= 5
            ? $"está {m.TempDeltaC:0.#} °C mais quente"
            : $"precisa de {m.FanDeltaPct:0}% mais ventoinha";
        return $"{label} {detail} que há {m.BaselineAgeDays} dias com o mesmo consumo. Pode ser poeira ou pasta térmica.";
    }
}
