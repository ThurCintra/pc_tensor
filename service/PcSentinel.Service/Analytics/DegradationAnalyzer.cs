using PcSentinel.Service.Contracts;

namespace PcSentinel.Service.Analytics;

/// <summary>Linha de base de uma faixa de potência (semanas anteriores).</summary>
public sealed record BaselineStats(RunningStats DeltaC, RunningStats FanPct, DateOnly OldestWeek);

/// <summary>Amostras da sessão atual numa faixa de potência.</summary>
public sealed class BaselineBucket
{
    public RunningStats DeltaC;
    public RunningStats FanPct;
}

/// <summary>
/// Detector de degradação térmica (poeira, pasta térmica ressecada).
/// Para cada faixa de potência (CPU a cada 10 W, GPU a cada 20 W) guarda o ΔT = temperatura do componente −
/// temperatura do sistema (aproxima a temperatura do ar que entra no gabinete) e a rotação da ventoinha.
/// Só entram leituras em regime estável (|dT/dt| &lt; 0,1 °C/s), porque a temperatura atrasa em relação à potência.
/// Se, para a mesma faixa, a sessão está ≥ 5 °C mais quente ou ≥ 15 % mais rápida na ventoinha do que a média
/// de semanas anteriores (≥ 14 dias), sinaliza manutenção.
/// </summary>
public sealed class DegradationAnalyzer
{
    public const double TempWarningC = 5;
    public const double FanWarningPct = 15;
    public const double SteadySlopeCPerS = 0.1;
    public const int MinBaselineAgeDays = 14;
    public const long MinSessionSamples = 120; // 30 s a 4 Hz
    public const long MinBaselineSamples = 600;

    private readonly object _lock = new();
    private readonly Dictionary<(string Component, int Bucket), BaselineBucket> _session = new();
    private Dictionary<(string Component, int Bucket), BaselineBucket> _pending = new();

    public static int BucketFor(string component, double powerW) =>
        component == "gpu" ? (int)(Math.Floor(powerW / 20) * 20) : (int)(Math.Floor(powerW / 10) * 10);

    public void Add(string component, double? powerW, double? tempC, double? referenceTempC, double? fanPct, double? slopeCPerS)
    {
        if (powerW is not double power || power <= 5) return;
        if (tempC is not double temp) return;
        if (slopeCPerS is not double slope || Math.Abs(slope) >= SteadySlopeCPerS) return;

        double delta = referenceTempC is double reference ? temp - reference : temp;
        var key = (component, BucketFor(component, power));
        lock (_lock)
        {
            Accumulate(_session, key, delta, fanPct);
            Accumulate(_pending, key, delta, fanPct);
        }
    }

    private static void Accumulate(Dictionary<(string, int), BaselineBucket> map, (string, int) key, double delta, double? fanPct)
    {
        if (!map.TryGetValue(key, out var bucket)) map[key] = bucket = new BaselineBucket();
        bucket.DeltaC.Add(delta);
        if (fanPct is double fan) bucket.FanPct.Add(fan);
    }

    public Dictionary<(string Component, int Bucket), BaselineBucket> TakePending()
    {
        lock (_lock)
        {
            var taken = _pending;
            _pending = new Dictionary<(string, int), BaselineBucket>();
            return taken;
        }
    }

    /// <summary>Compara a sessão com a linha de base e devolve o pior desvio encontrado.</summary>
    public MaintenanceData Evaluate(Func<string, int, BaselineStats?> baselineLookup, DateOnly today)
    {
        List<KeyValuePair<(string Component, int Bucket), BaselineBucket>> buckets;
        lock (_lock)
        {
            buckets = _session
                .Where(kv => kv.Value.DeltaC.Count >= MinSessionSamples)
                .Select(kv => new KeyValuePair<(string, int), BaselineBucket>(kv.Key, new BaselineBucket { DeltaC = kv.Value.DeltaC, FanPct = kv.Value.FanPct }))
                .ToList();
        }

        MaintenanceData? worst = null;
        double worstScore = 0;
        foreach (var (key, current) in buckets)
        {
            var baseline = baselineLookup(key.Component, key.Bucket);
            if (baseline is null || baseline.DeltaC.Count < MinBaselineSamples) continue;

            double tempDelta = current.DeltaC.Mean - baseline.DeltaC.Mean;
            double? fanDelta = current.FanPct.Count > 0 && baseline.FanPct.Count > 0 && baseline.FanPct.Mean > 0
                ? (current.FanPct.Mean - baseline.FanPct.Mean) / baseline.FanPct.Mean * 100
                : null;

            bool warning = tempDelta >= TempWarningC || fanDelta >= FanWarningPct;
            // Pontuação normalizada pelos limites para escolher o desvio mais relevante
            double score = Math.Max(tempDelta / TempWarningC, (fanDelta ?? 0) / FanWarningPct);
            if (score <= worstScore) continue;

            worstScore = score;
            worst = new MaintenanceData(
                warning,
                key.Component,
                Math.Round(tempDelta, 1),
                fanDelta is double f ? Math.Round(f, 1) : null,
                today.DayNumber - baseline.OldestWeek.DayNumber);
        }

        return worst ?? new MaintenanceData(false, null, null, null, null);
    }

    /// <summary>Segunda-feira da semana de <paramref name="day"/> (chave das linhas de base).</summary>
    public static DateOnly WeekStart(DateOnly day) => day.AddDays(-(((int)day.DayOfWeek + 6) % 7));

    /// <summary>Semanas com início até esta data contam como "semanas anteriores".</summary>
    public static DateOnly BaselineCutoff(DateOnly today) => WeekStart(today.AddDays(-MinBaselineAgeDays));
}
