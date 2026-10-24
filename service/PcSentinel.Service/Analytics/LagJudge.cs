using PcSentinel.Service.Contracts;

namespace PcSentinel.Service.Analytics;

/// <summary>Entradas do Juiz de Lag em um instante.</summary>
public sealed record LagInputs(
    double? InternetLatencyMs,
    double? BaselineLatencyMs,
    double? JitterMs,
    double? LossPct,
    double? CpuLoadPct,
    double? MaxCoreLoadPct,
    double? GpuLoadPct,
    double? VramUsedMb,
    double? VramTotalMb);

/// <summary>
/// Juiz de Lag: decide se uma anomalia vem da rede ou do hardware.
/// Ordem de prioridade: rede (o servidor do jogo não depende do PC), VRAM cheia (causa stutter grave por
/// troca com a RAM) e gargalo de CPU (um núcleo saturado com a GPU ociosa esperando quadros).
/// </summary>
public static class LagJudge
{
    public const double LossThresholdPct = 2;
    public const double JitterThresholdMs = 15;
    public const double LatencySpikeFactor = 2;
    public const double LatencySpikeMinMs = 30;
    public const double VramThreshold = 0.95;
    public const double CoreSaturationPct = 95;
    public const double GpuStarvedPct = 85;

    public static LagData Judge(LagInputs i)
    {
        var network = new List<string>();
        if (i.LossPct is double loss && loss >= LossThresholdPct)
            network.Add($"Perda de pacotes de {loss:0.#}%");
        if (i.JitterMs is double jitter && jitter >= JitterThresholdMs)
            network.Add($"Variação de latência (jitter) de {jitter:0} ms");
        if (i.InternetLatencyMs is double lat && i.BaselineLatencyMs is double baseLat &&
            lat >= baseLat * LatencySpikeFactor && lat - baseLat >= LatencySpikeMinMs)
            network.Add($"Latência subiu de {baseLat:0} para {lat:0} ms");
        if (network.Count > 0) return new LagData(LagVerdicts.Network, network);

        if (i.VramUsedMb is double used && i.VramTotalMb is double total && total > 0 && used / total >= VramThreshold)
            return new LagData(LagVerdicts.VramOverflow, [$"Memória de vídeo em {used / total * 100:0}% ({used:0} de {total:0} MB)"]);

        if (i.MaxCoreLoadPct is double core && core >= CoreSaturationPct &&
            (i.GpuLoadPct is not double gpu || gpu < GpuStarvedPct))
        {
            string gpuText = i.GpuLoadPct is double g ? $", GPU em {g:0}%" : string.Empty;
            return new LagData(LagVerdicts.CpuBottleneck, [$"Núcleo da CPU em {core:0}%{gpuText}"]);
        }

        return new LagData(LagVerdicts.Normal, []);
    }
}
