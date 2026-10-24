namespace PcSentinel.Service.Analytics;

/// <summary>
/// Taxímetro de energia: integra P_total = P_CPU + P_GPU + P_base pela regra do trapézio,
/// E += (P_anterior + P_atual) / 2 · Δt, e converte para kWh (1 kWh = 3,6·10⁶ J).
/// </summary>
public sealed class EnergyMeter
{
    private const double JoulesPerKwh = 3_600_000;

    /// <summary>Intervalos maiores que isso (PC suspenso, serviço travado) não são integrados.</summary>
    private const double MaxGapSeconds = 10;

    private double? _lastTimestampS;
    private double _lastPowerW;
    private double _pendingKwh;

    public double SessionKwh { get; private set; }

    /// <summary>Energia ainda não gravada no banco.</summary>
    public double PendingKwh => _pendingKwh;

    /// <summary>Soma a energia desde a última leitura e devolve a potência total usada.</summary>
    public double Add(double timestampS, double? cpuW, double? gpuW, double baseLoadW)
    {
        double powerW = Math.Max(0, (cpuW ?? 0) + (gpuW ?? 0) + baseLoadW);

        if (_lastTimestampS is double last)
        {
            double dt = timestampS - last;
            if (dt > 0 && dt <= MaxGapSeconds)
            {
                double kwh = (_lastPowerW + powerW) / 2 * dt / JoulesPerKwh;
                SessionKwh += kwh;
                _pendingKwh += kwh;
            }
        }

        _lastTimestampS = timestampS;
        _lastPowerW = powerW;
        return powerW;
    }

    /// <summary>Energia acumulada desde a última gravação no banco (zera o acumulador).</summary>
    public double TakePendingKwh()
    {
        double value = _pendingKwh;
        _pendingKwh = 0;
        return value;
    }

    public static double Cost(double kwh, double tariffBrlPerKwh) => Math.Round(kwh * tariffBrlPerKwh, 2);
}
