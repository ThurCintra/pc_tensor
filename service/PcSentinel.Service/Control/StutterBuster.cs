using System.Diagnostics;
using PcSentinel.Service.Context;
using PcSentinel.Service.Native;

namespace PcSentinel.Service.Control;

public sealed record StutterBusterResult(
    bool StandbyPurged,
    double? StandbyFreedMb,
    string? StandbyError,
    IReadOnlyList<string> Deprioritized,
    int RestoreAfterS);

/// <summary>
/// "Modo pânico" contra engasgos:
/// 1. esvazia a lista standby da RAM (NtSetSystemInformation / MemoryPurgeStandbyList);
/// 2. baixa para BelowNormal, por alguns minutos, a prioridade de apps de segundo plano conhecidos
///    (navegadores, launchers, sincronização), nunca o app da janela em foco.
/// As prioridades originais são restauradas sozinhas depois de <see cref="RestoreAfter"/>.
/// </summary>
public sealed class StutterBuster : IDisposable
{
    public static readonly TimeSpan RestoreAfter = TimeSpan.FromMinutes(5);

    /// <summary>
    /// Apps que podem perder prioridade sem afetar o jogo. Comunicadores de voz (Discord, TeamSpeak) ficam
    /// de fora de propósito: com prioridade baixa o áudio da chamada pode picotar.
    /// </summary>
    private static readonly HashSet<string> BackgroundTargets = new(StringComparer.OrdinalIgnoreCase)
    {
        "chrome", "msedge", "firefox", "opera", "opera_gx", "brave", "vivaldi",
        "EpicGamesLauncher", "EpicWebHelper", "Battle.net", "EADesktop", "EABackgroundService", "upc",
        "UbisoftConnect", "GalaxyClient", "GalaxyClientService", "steamwebhelper",
        "OneDrive", "Dropbox", "GoogleDriveFS", "ms-teams", "Teams", "Spotify", "AdobeCollabSync",
        "Creative Cloud", "CCXProcess", "iCloudDrive", "WhatsApp",
    };

    private readonly object _lock = new();
    private readonly Dictionary<int, (DateTime StartTime, ProcessPriorityClass Original)> _lowered = new();
    private Timer? _restoreTimer;

    public StutterBusterResult Run()
    {
        var (standbyOk, freedMb, standbyError) = PurgeStandby();
        var lowered = LowerBackgroundPriorities();
        return new StutterBusterResult(standbyOk, freedMb, standbyError, lowered, (int)RestoreAfter.TotalSeconds);
    }

    private static (bool Ok, double? FreedMb, string? Error) PurgeStandby()
    {
        try
        {
            double? before = WindowsMemory.GetStandbyMb();
            int status = WindowsMemory.PurgeStandbyList();
            if (status != NativeMethods.StatusSuccess)
            {
                return (false, null, $"O Windows recusou a limpeza (NTSTATUS 0x{status:X8}).");
            }
            double? after = WindowsMemory.GetStandbyMb();
            double? freed = before is double b && after is double a ? Math.Round(Math.Max(0, b - a)) : null;
            return (true, freed, null);
        }
        catch (UnauthorizedAccessException ex)
        {
            return (false, null, ex.Message);
        }
        catch (InvalidOperationException ex)
        {
            return (false, null, ex.Message);
        }
    }

    private List<string> LowerBackgroundPriorities()
    {
        var (foregroundExe, foregroundPid) = ForegroundProfiler.GetForegroundProcess();
        int self = Environment.ProcessId;
        var names = new SortedSet<string>(StringComparer.OrdinalIgnoreCase);

        lock (_lock)
        {
            foreach (var process in Process.GetProcesses())
            {
                using (process)
                {
                    try
                    {
                        if (process.Id == self || process.Id == foregroundPid) continue;
                        if (!BackgroundTargets.Contains(process.ProcessName)) continue;
                        // O app em foco pode ter vários processos (ex.: navegador): nenhum deles é rebaixado
                        if (string.Equals(process.ProcessName, foregroundExe, StringComparison.OrdinalIgnoreCase)) continue;

                        var original = process.PriorityClass;
                        if (original is ProcessPriorityClass.BelowNormal or ProcessPriorityClass.Idle) continue;

                        if (!_lowered.ContainsKey(process.Id)) _lowered[process.Id] = (process.StartTime, original);
                        process.PriorityClass = ProcessPriorityClass.BelowNormal;
                        names.Add(process.ProcessName + ".exe");
                    }
                    catch (Exception ex) when (ex is InvalidOperationException or System.ComponentModel.Win32Exception)
                    {
                        // Processo encerrou ou é protegido: segue para o próximo
                    }
                }
            }

            _restoreTimer?.Dispose();
            _restoreTimer = new Timer(_ => Restore(), null, RestoreAfter, Timeout.InfiniteTimeSpan);
        }

        return names.ToList();
    }

    /// <summary>Devolve as prioridades originais (ignora PIDs reaproveitados por outro processo).</summary>
    public void Restore()
    {
        lock (_lock)
        {
            foreach (var (pid, (startTime, original)) in _lowered)
            {
                try
                {
                    using var process = Process.GetProcessById(pid);
                    if (process.StartTime == startTime) process.PriorityClass = original;
                }
                catch (Exception ex) when (ex is ArgumentException or InvalidOperationException or System.ComponentModel.Win32Exception)
                {
                    // Processo já terminou
                }
            }
            _lowered.Clear();
        }
    }

    public void Dispose()
    {
        _restoreTimer?.Dispose();
        Restore();
    }
}
