namespace PcSentinel.Service.Analytics;

/// <summary>
/// Média e variância incrementais (Welford), com junção de dois conjuntos (Chan et al.) para somar
/// o que está em memória ao que já foi gravado no banco sem guardar as amostras.
/// </summary>
public struct RunningStats
{
    public long Count;
    public double Mean;
    public double M2;

    public RunningStats(long count, double mean, double m2)
    {
        Count = count;
        Mean = mean;
        M2 = m2;
    }

    public void Add(double value)
    {
        Count++;
        double delta = value - Mean;
        Mean += delta / Count;
        M2 += delta * (value - Mean);
    }

    public readonly double? SampleStdDev => Count > 1 ? Math.Sqrt(M2 / (Count - 1)) : null;

    public static RunningStats Merge(RunningStats a, RunningStats b)
    {
        if (a.Count == 0) return b;
        if (b.Count == 0) return a;
        long n = a.Count + b.Count;
        double delta = b.Mean - a.Mean;
        return new RunningStats(
            n,
            a.Mean + delta * b.Count / n,
            a.M2 + b.M2 + delta * delta * a.Count * b.Count / n);
    }
}
