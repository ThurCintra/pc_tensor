using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace PcSentinel.Service.Cloud;

/// <summary>Vínculo deste PC com uma conta do pc_tensor Cloud.</summary>
public sealed record CloudCredentials(Uri ApiUrl, string DeviceId, string DeviceToken);

/// <summary>Limites de alerta definidos no site (atualizados por ACTION_UPDATE_CONFIG e por /api/agent/me).</summary>
public sealed record AlertLimits(int MaxCpuTempAlert, int MaxGpuTempAlert, bool AlertsEnabled)
{
    public static readonly AlertLimits Default = new(90, 85, true);
}

/// <summary>
/// Guarda as credenciais em %APPDATA%\pc-sentinel\cloud.json. O DeviceToken é cifrado com o DPAPI do Windows
/// (escopo do usuário): copiar o arquivo para outro PC ou outra conta não revela o token.
/// </summary>
public sealed class CloudCredentialStore(string dataDir)
{
    private static readonly byte[] Entropy = Encoding.UTF8.GetBytes("pc-tensor-cloud-device-token");
    private readonly string _path = Path.Combine(dataDir, "cloud.json");
    private readonly object _lock = new();

    private sealed record StoredFile(
        string ApiUrl,
        string DeviceId,
        string ProtectedToken,
        int MaxCpuTempAlert,
        int MaxGpuTempAlert,
        bool AlertsEnabled);

    public (CloudCredentials Credentials, AlertLimits Limits)? Load()
    {
        lock (_lock)
        {
            if (!File.Exists(_path)) return null;
            try
            {
                var stored = JsonSerializer.Deserialize<StoredFile>(File.ReadAllText(_path));
                if (stored is null || !Uri.TryCreate(stored.ApiUrl, UriKind.Absolute, out var apiUrl)) return null;
                byte[] token = ProtectedData.Unprotect(Convert.FromBase64String(stored.ProtectedToken), Entropy, DataProtectionScope.CurrentUser);
                return (
                    new CloudCredentials(apiUrl, stored.DeviceId, Encoding.UTF8.GetString(token)),
                    new AlertLimits(stored.MaxCpuTempAlert, stored.MaxGpuTempAlert, stored.AlertsEnabled));
            }
            catch (Exception ex) when (ex is JsonException or FormatException or CryptographicException or IOException)
            {
                // Arquivo corrompido ou de outro usuário do Windows: o PC precisa ser pareado de novo
                return null;
            }
        }
    }

    public void Save(CloudCredentials credentials, AlertLimits limits)
    {
        byte[] protectedToken = ProtectedData.Protect(Encoding.UTF8.GetBytes(credentials.DeviceToken), Entropy, DataProtectionScope.CurrentUser);
        var stored = new StoredFile(
            credentials.ApiUrl.ToString(),
            credentials.DeviceId,
            Convert.ToBase64String(protectedToken),
            limits.MaxCpuTempAlert,
            limits.MaxGpuTempAlert,
            limits.AlertsEnabled);

        lock (_lock)
        {
            Directory.CreateDirectory(Path.GetDirectoryName(_path)!);
            string tmp = _path + ".tmp";
            File.WriteAllText(tmp, JsonSerializer.Serialize(stored));
            File.Move(tmp, _path, overwrite: true); // troca atômica: nunca fica meio arquivo
        }
    }

    public void SaveLimits(AlertLimits limits)
    {
        if (Load() is { } current) Save(current.Credentials, limits);
    }

    public void Clear()
    {
        lock (_lock)
        {
            if (File.Exists(_path)) File.Delete(_path);
        }
    }
}
