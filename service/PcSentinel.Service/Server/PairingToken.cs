using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace PcSentinel.Service.Server;

/// <summary>
/// Token de pareamento compartilhado com o app (sessionToken em %APPDATA%\pc-sentinel\settings.json).
/// O arquivo é relido quando muda, então "Desconectar todos os aparelhos" no app vale também aqui.
/// </summary>
public sealed class PairingToken(string settingsPath)
{
    private readonly object _lock = new();
    private DateTime _lastWrite;
    private byte[]? _token;

    public bool IsValid(string? candidate)
    {
        if (string.IsNullOrEmpty(candidate)) return false;
        byte[]? expected = Current();
        if (expected is null) return false;
        // Comparação em tempo constante: o tempo de resposta não revela quantos caracteres acertaram
        return CryptographicOperations.FixedTimeEquals(expected, Encoding.UTF8.GetBytes(candidate));
    }

    private byte[]? Current()
    {
        lock (_lock)
        {
            try
            {
                var info = new FileInfo(settingsPath);
                if (!info.Exists) return null;
                if (_token is not null && info.LastWriteTimeUtc == _lastWrite) return _token;

                using var stream = File.OpenRead(settingsPath);
                using var doc = JsonDocument.Parse(stream);
                string? token = doc.RootElement.TryGetProperty("sessionToken", out var t) ? t.GetString() : null;
                _token = token is { Length: >= 32 } ? Encoding.UTF8.GetBytes(token) : null;
                _lastWrite = info.LastWriteTimeUtc;
                return _token;
            }
            catch (Exception ex) when (ex is IOException or JsonException or UnauthorizedAccessException)
            {
                return _token; // arquivo sendo gravado pelo app: usa o último token lido
            }
        }
    }
}
