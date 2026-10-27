using PcSentinel.Service.Contracts;

namespace PcSentinel.Service.Analytics;

/// <summary>Estatísticas de uma faixa de clock: tensão (média e variância) e potência média.</summary>
public sealed class SiliconBucket
{
    public RunningStats Vcore;
    public RunningStats Power;
}

/// <summary>Acumulado de clock, potência e tensão sob carga que forma o resumo de eficiência.</summary>
public readonly record struct SiliconTotals(RunningStats Clock, RunningStats Power, RunningStats Vcore);

/// <summary>
/// "Silicon lottery": agrega pares [Clock, Vcore, Potência] sob carga (≥ 80 %) em faixas de 100 MHz.
/// A curva clock × tensão × potência mostra quanto o chip precisa de tensão para cada frequência; o
/// desvio-padrão da tensão sob carga mede a estabilidade. MHz/W = clock médio ÷ potência média.
/// </summary>
public sealed class SiliconEfficiencyTracker(string component, double bucketMhz = 100, double minLoadPct = 80)
{
    private readonly object _lock = new();

    /// <summary>Faixas acumuladas desde a última gravação (somadas ao banco por <see cref="TakePending"/>).</summary>
    private Dictionary<int, SiliconBucket> _pending = new();

    private RunningStats _clock;
    private RunningStats _power;
    private RunningStats _vcore;

    public string Component { get; } = component;

    public void Add(double? loadPct, double? clockMhz, double? vcoreV, double? powerW)
    {
        if (loadPct is not double load || load < minLoadPct) return;
        if (clockMhz is not double clock || clock <= 0) return;
        if (vcoreV is not double vcore || vcore <= 0) return;
        if (powerW is not double power || power <= 0) return;

        int key = (int)(Math.Floor(clock / bucketMhz) * bucketMhz);
        lock (_lock)
        {
            if (!_pending.TryGetValue(key, out var bucket)) _pending[key] = bucket = new SiliconBucket();
            bucket.Vcore.Add(vcore);
            bucket.Power.Add(power);
            _clock.Add(clock);
            _power.Add(power);
            _vcore.Add(vcore);
        }
    }

    /// <summary>Acumulado atual (gravado no banco para o resumo sobreviver a reinícios do app).</summary>
    public SiliconTotals Totals()
    {
        lock (_lock) return new SiliconTotals(_clock, _power, _vcore);
    }

    /// <summary>Soma ao que já está em memória o acumulado gravado nas execuções anteriores.</summary>
    public void Restore(SiliconTotals saved)
    {
        lock (_lock)
        {
            _clock = RunningStats.Merge(saved.Clock, _clock);
            _power = RunningStats.Merge(saved.Power, _power);
            _vcore = RunningStats.Merge(saved.Vcore, _vcore);
        }
    }

    /// <summary>Resumo acumulado: MHz por watt e estabilidade da tensão.</summary>
    public SiliconEfficiency Summary()
    {
        lock (_lock)
        {
            double? mhzPerWatt = _power.Count > 0 && _power.Mean > 0 ? Math.Round(_clock.Mean / _power.Mean, 1) : null;
            double? stdMv = _vcore.SampleStdDev is double sd ? Math.Round(sd * 1000, 1) : null;
            return new SiliconEfficiency(mhzPerWatt, stdMv, _vcore.Count);
        }
    }

    public Dictionary<int, SiliconBucket> TakePending()
    {
        lock (_lock)
        {
            var taken = _pending;
            _pending = new Dictionary<int, SiliconBucket>();
            return taken;
        }
    }
}
