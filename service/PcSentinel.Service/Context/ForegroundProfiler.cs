using System.Diagnostics;
using PcSentinel.Service.Contracts;
using PcSentinel.Service.Native;

namespace PcSentinel.Service.Context;

/// <summary>
/// Game-Sense: descobre o executável da janela em primeiro plano (GetForegroundWindow +
/// GetWindowThreadProcessId) e o classifica num perfil de uso.
/// Funciona só na sessão do usuário: um serviço do Windows (sessão 0) não enxerga as janelas.
/// </summary>
public sealed class ForegroundProfiler
{
    private static readonly HashSet<string> CompetitiveFps = new(StringComparer.OrdinalIgnoreCase)
    {
        "cs2", "csgo", "valorant", "valorant-win64-shipping", "r5apex", "r5apex_dx12", "overwatch",
        "rainbowsix", "rainbowsix_vulkan", "fortniteclient-win64-shipping", "cod", "modernwarfare",
        "deltaforceclient-win64-shipping", "thefinals", "marvel-win64-shipping", "pubg", "tslgame",
        "leagueoflegends", "league of legends", "dota2", "rocketleague", "splitgate",
    };

    private static readonly HashSet<string> AaaGraphics = new(StringComparer.OrdinalIgnoreCase)
    {
        "cyberpunk2077", "rdr2", "eldenring", "starfield", "hogwartslegacy", "witcher3", "alanwake2",
        "blackmythwukong", "b1-win64-shipping", "baldursgate3", "bg3", "bg3_dx11", "forzahorizon5",
        "msfs", "flightsimulator", "gta5", "gta5_enhanced", "re4", "monsterhunterwilds", "indianajones",
    };

    private static readonly HashSet<string> DevWorkstation = new(StringComparer.OrdinalIgnoreCase)
    {
        "code", "devenv", "rider64", "idea64", "pycharm64", "webstorm64", "clion64", "goland64",
        "windowsterminal", "wt", "powershell", "pwsh", "cmd", "blender", "unity", "unrealeditor",
        "docker desktop", "postman", "sublime_text", "notepad++", "cursor", "zed", "androidstudio64",
    };

    /// <summary>Executáveis que representam "nenhum app em foco" (área de trabalho, menu Iniciar).</summary>
    private static readonly HashSet<string> Shell = new(StringComparer.OrdinalIgnoreCase)
    {
        "explorer", "searchhost", "startmenuexperiencehost", "shellexperiencehost", "lockapp",
    };

    /// <summary>Uso de GPU a partir do qual um jogo desconhecido é tratado como AAA.</summary>
    private const double HeavyGpuLoadPct = 70;

    public ContextData Detect(double? gpuLoadPct)
    {
        var (exe, pid) = GetForegroundProcess();
        return new ContextData(Classify(exe, gpuLoadPct), exe is null ? null : exe + ".exe", pid);
    }

    public static string Classify(string? exe, double? gpuLoadPct)
    {
        if (exe is null || Shell.Contains(exe)) return Profiles.Idle;
        if (CompetitiveFps.Contains(exe)) return Profiles.CompetitiveFps;
        if (AaaGraphics.Contains(exe)) return Profiles.AaaGraphics;
        if (DevWorkstation.Contains(exe)) return Profiles.DevWorkstation;
        return gpuLoadPct >= HeavyGpuLoadPct ? Profiles.AaaGraphics : Profiles.Idle;
    }

    /// <summary>Nome do executável (sem .exe) e PID da janela em foco, ou (null, null).</summary>
    public static (string? Exe, int? Pid) GetForegroundProcess()
    {
        nint hwnd = NativeMethods.GetForegroundWindow();
        if (hwnd == 0) return (null, null);
        NativeMethods.GetWindowThreadProcessId(hwnd, out uint pid);
        if (pid == 0) return (null, null);

        try
        {
            using var process = Process.GetProcessById((int)pid);
            return (process.ProcessName, (int)pid);
        }
        catch (ArgumentException)
        {
            return (null, null); // processo encerrou entre as duas chamadas
        }
    }
}
