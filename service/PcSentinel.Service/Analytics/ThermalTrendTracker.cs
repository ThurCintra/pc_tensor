using PcSentinel.Service.Contracts;

namespace PcSentinel.Service.Analytics;

/// <summary>
/// Previsão de thermal throttling por derivada térmica.
/// dT/dt é a inclinação da reta de mínimos quadrados sobre as amostras dos últimos <see cref="WindowSeconds"/>
/// segundos (mais estável que a diferença entre a primeira e a última leitura, que amplifica o ruído do sensor).
/// Mantida a inclinação, o tempo até o limite é (limite − T_atual) / (dT/dt).
/// </summary>
public sealed class ThermalTrendTracker(double limitC, double windowSeconds = 10, double minSlopeCPerS = 0.05)
{
    /// <summary>Janela mínima para confiar na inclinação (evita prever com 1–2 leituras).</summary>
    private const double MinSpanSeconds = 3;

    private readonly Queue<(double T, double TempC)> _samples = new();

    public double LimitC { get; } = limitC;
    public double WindowSeconds { get; } = windowSeconds;

    /// <param name="timestampS">Instante da leitura em segundos (relógio monotônico).</param>
    public ThermalTrend Add(double timestampS, double? tempC)
    {
        if (tempC is not double temp)
        {
            return new ThermalTrend(null, null, LimitC, false);
        }

        _samples.Enqueue((timestampS, temp));
        while (_samples.Count > 0 && timestampS - _samples.Peek().T > WindowSeconds)
        {
            _samples.Dequeue();
        }

        bool throttling = temp >= LimitC;
        double? slope = Slope();
        double? timeToThrottle = null;
        if (!throttling && slope is double s && s >= minSlopeCPerS)
        {
            timeToThrottle = Math.Round((LimitC - temp) / s, 1);
        }

        return new ThermalTrend(slope is double v ? Math.Round(v, 3) : null, timeToThrottle, LimitC, throttling);
    }

    /// <summary>Inclinação β = Σ(t−t̄)(T−T̄) / Σ(t−t̄)², em °C/s.</summary>
    internal double? Slope()
    {
        int n = _samples.Count;
        if (n < 3) return null;

        double first = double.NaN, last = 0, meanT = 0, meanY = 0;
        foreach (var (t, y) in _samples)
        {
            if (double.IsNaN(first)) first = t;
            last = t;
            meanT += t;
            meanY += y;
        }
        if (last - first < MinSpanSeconds) return null;
        meanT /= n;
        meanY /= n;

        double num = 0, den = 0;
        foreach (var (t, y) in _samples)
        {
            double dt = t - meanT;
            num += dt * (y - meanY);
            den += dt * dt;
        }
        return den > 0 ? num / den : null;
    }
}
