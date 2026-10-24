using System.Text.Json;
using PcSentinel.Service.Control;

namespace PcSentinel.Service.Cloud;

/// <summary>
/// Allowlist dos comandos vindos da nuvem: um switch fechado com três ações pré-programadas. Nada que chega
/// pela rede vira comando de terminal, caminho de arquivo ou nome de processo.
/// </summary>
public sealed class CommandDispatcher(
    Func<(bool Ok, double? FreedMb, string? Error)> purgeStandby,
    Func<IReadOnlyList<string>> lowerPriorities,
    Action<AlertLimits> updateLimits,
    Func<AlertLimits> currentLimits)
{
    public const int MinLimitC = 50;
    public const int MaxLimitC = 110;

    public static CommandDispatcher Create(StutterBuster buster, Action<AlertLimits> updateLimits, Func<AlertLimits> currentLimits) =>
        new(StutterBuster.PurgeStandby, () => buster.LowerBackgroundPriorities(), updateLimits, currentLimits);

    public CloudCommandResult Execute(JsonElement command)
    {
        if (command.ValueKind != JsonValueKind.Object ||
            !command.TryGetProperty("action", out var actionProp) ||
            actionProp.ValueKind != JsonValueKind.String)
        {
            return new CloudCommandResult(false, "Comando inválido.");
        }

        switch (actionProp.GetString())
        {
            case "ACTION_CLEAN_RAM":
            {
                var (ok, freedMb, error) = purgeStandby();
                return ok
                    ? new CloudCommandResult(true, freedMb is double mb ? $"{mb:0} MB de cache liberados." : "Cache de memória liberado.",
                        new() { ["freedMb"] = freedMb })
                    : new CloudCommandResult(false, error ?? "Não foi possível limpar a memória.");
            }

            case "ACTION_OPTIMIZE_PRIORITY":
            {
                var lowered = lowerPriorities();
                return new CloudCommandResult(
                    true,
                    lowered.Count > 0
                        ? $"{lowered.Count} apps em segundo plano com prioridade reduzida por 5 minutos."
                        : "Nenhum app em segundo plano para reduzir.",
                    new() { ["deprioritized"] = lowered });
            }

            case "ACTION_UPDATE_CONFIG":
            {
                if (!TryLimit(command, "maxCpuTempAlert", out int cpu) || !TryLimit(command, "maxGpuTempAlert", out int gpu))
                    return new CloudCommandResult(false, $"Limites devem estar entre {MinLimitC} e {MaxLimitC} °C.");
                var limits = currentLimits() with { MaxCpuTempAlert = cpu, MaxGpuTempAlert = gpu };
                updateLimits(limits);
                return new CloudCommandResult(true, $"Alertas em {cpu} °C (CPU) e {gpu} °C (GPU).");
            }

            default:
                return new CloudCommandResult(false, "Comando não permitido.");
        }
    }

    private static bool TryLimit(JsonElement command, string name, out int value)
    {
        value = 0;
        return command.TryGetProperty(name, out var prop) &&
               prop.ValueKind == JsonValueKind.Number &&
               prop.TryGetInt32(out value) &&
               value is >= MinLimitC and <= MaxLimitC;
    }
}
