using System.Collections.Concurrent;
using System.Text.RegularExpressions;
using PcSentinel.Service.Contracts;
using PcSentinel.Service.Persistence;

namespace PcSentinel.Service.Context;

/// <summary>Regra salva: executável (sem ".exe", minúsculo) e o perfil que ele recebe.</summary>
public sealed record ProfileRule(string Exe, string Profile);

/// <summary>
/// Regras de perfil do usuário ("meu_jogo.exe é FPS competitivo"), além das listas fixas do
/// <see cref="ForegroundProfiler"/>. Ficam em memória para a consulta a 4 Hz e no SQLite para sobreviver a reinícios.
/// </summary>
public sealed partial class ProfileRuleStore
{
    public const int MaxRules = 200;

    private readonly ConcurrentDictionary<string, string> _rules = new(StringComparer.OrdinalIgnoreCase);
    private readonly TelemetryDb? _db;

    public ProfileRuleStore(TelemetryDb? db = null)
    {
        _db = db;
        if (db is null) return;
        foreach (var (exe, profile) in db.GetProfileRules())
        {
            // Regra gravada por uma versão antiga ou editada à mão: só entra se ainda for válida
            if (Normalize(exe) is string valid && Profiles.All.Contains(profile)) _rules[valid] = profile;
        }
    }

    public int Count => _rules.Count;

    /// <summary>
    /// Nome do executável como o profiler enxerga (nome do processo, sem ".exe", minúsculo) a partir do que o
    /// usuário digitou ("C:\Jogos\MeuJogo.exe", "MeuJogo.exe" ou "MeuJogo"). Null se não for um nome válido.
    /// </summary>
    public static string? Normalize(string? exe)
    {
        if (string.IsNullOrWhiteSpace(exe)) return null;
        string name = exe.Trim().Replace('/', '\\');
        name = name[(name.LastIndexOf('\\') + 1)..];
        if (name.EndsWith(".exe", StringComparison.OrdinalIgnoreCase)) name = name[..^4];
        name = name.Trim();
        return ValidName().IsMatch(name) ? name.ToLowerInvariant() : null;
    }

    public bool TryGet(string? exe, out string profile)
    {
        profile = "";
        return exe is not null && _rules.TryGetValue(exe, out profile!);
    }

    /// <summary>Cria ou troca a regra. Devolve a regra salva, ou o motivo de recusa.</summary>
    public (ProfileRule? Rule, string? Error) Set(string? exe, string? profile)
    {
        string? name = Normalize(exe);
        if (name is null) return (null, "Informe o nome do executável, como \"meu_jogo.exe\".");
        if (profile is null || !Profiles.All.Contains(profile))
            return (null, $"Perfil inválido. Use um destes: {string.Join(", ", Profiles.All)}.");
        if (!_rules.ContainsKey(name) && _rules.Count >= MaxRules)
            return (null, $"Limite de {MaxRules} regras atingido. Remova alguma antes.");

        _rules[name] = profile;
        _db?.SetProfileRule(name, profile);
        return (new ProfileRule(name, profile), null);
    }

    public bool Remove(string? exe)
    {
        string? name = Normalize(exe);
        if (name is null || !_rules.TryRemove(name, out _)) return false;
        _db?.RemoveProfileRule(name);
        return true;
    }

    public IReadOnlyList<ProfileRule> All() =>
        _rules.Select(r => new ProfileRule(r.Key, r.Value)).OrderBy(r => r.Exe, StringComparer.Ordinal).ToList();

    /// <summary>Letras, números, espaço e . _ ( ) + - (mesma regra da lista do Modo Boost no app), até 64 caracteres.</summary>
    [GeneratedRegex(@"^[\w .()+-]{1,64}$")]
    private static partial Regex ValidName();
}
