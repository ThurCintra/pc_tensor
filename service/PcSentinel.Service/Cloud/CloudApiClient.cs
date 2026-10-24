using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace PcSentinel.Service.Cloud;

/// <summary>Hardware informado ao parear, para preencher o cadastro do PC no site.</summary>
public sealed record PairingHardware(string Name, string? CpuModel, string? GpuModel, double? TotalRamGb);

/// <summary>Resposta de GET /api/agent/me.</summary>
public sealed record AgentInfo(
    string DeviceId,
    string Name,
    int MaxCpuTempAlert,
    int MaxGpuTempAlert,
    bool AlertsEnabled,
    string? RealtimeUrl);

/// <summary>Token revogado (PC removido no site): o agente para de tentar e pede novo pareamento.</summary>
public sealed class CloudUnauthorizedException(string message) : Exception(message);

/// <summary>Erro com mensagem vinda do site (ex.: código inválido), segura para mostrar ao usuário.</summary>
public sealed class CloudApiException(string message, HttpStatusCode? status = null) : Exception(message)
{
    public HttpStatusCode? Status { get; } = status;
}

/// <summary>Chamadas HTTP do agente ao site (cloud/apps/web/src/app/api/agent).</summary>
public sealed class CloudApiClient(HttpClient http)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.Never,
    };

    private sealed record PairResponse(string DeviceId, string DeviceToken);
    private sealed record ErrorBody(ErrorDetail? Error);
    private sealed record ErrorDetail(string? Code, string? Message);

    /// <summary>POST /api/agent/pair: troca o código de 6 dígitos pelo DeviceToken definitivo.</summary>
    public async Task<CloudCredentials> PairAsync(Uri apiUrl, string code, PairingHardware hardware, CancellationToken ct)
    {
        if (code.Length != 6 || !code.All(char.IsAsciiDigit)) throw new CloudApiException("O código tem 6 dígitos.");

        var body = new
        {
            code,
            name = hardware.Name,
            cpuModel = hardware.CpuModel,
            gpuModel = hardware.GpuModel,
            totalRamGb = hardware.TotalRamGb,
        };
        using var response = await SendAsync(() => http.PostAsJsonAsync(new Uri(apiUrl, "/api/agent/pair"), body, Json, ct));
        await EnsureSuccessAsync(response, ct);
        var pair = await response.Content.ReadFromJsonAsync<PairResponse>(Json, ct)
                   ?? throw new CloudApiException("Resposta vazia do site.");
        return new CloudCredentials(apiUrl, pair.DeviceId, pair.DeviceToken);
    }

    /// <summary>GET /api/agent/me: confere o token e traz limites de alerta e o endereço do tempo real.</summary>
    public async Task<AgentInfo> GetAgentInfoAsync(CloudCredentials credentials, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, new Uri(credentials.ApiUrl, "/api/agent/me"));
        request.Headers.Add("X-Device-Token", credentials.DeviceToken);
        using var response = await SendAsync(() => http.SendAsync(request, ct));
        if (response.StatusCode == HttpStatusCode.Unauthorized)
            throw new CloudUnauthorizedException("Este PC foi removido da conta no site. Pareie de novo.");
        await EnsureSuccessAsync(response, ct);
        return await response.Content.ReadFromJsonAsync<AgentInfo>(Json, ct)
               ?? throw new CloudApiException("Resposta vazia do site.");
    }

    private static async Task<HttpResponseMessage> SendAsync(Func<Task<HttpResponseMessage>> send)
    {
        try
        {
            return await send();
        }
        catch (HttpRequestException ex)
        {
            throw new CloudApiException($"Sem conexão com o site ({ex.Message}).");
        }
        catch (TaskCanceledException) when (!Environment.HasShutdownStarted)
        {
            throw new CloudApiException("O site demorou demais para responder.");
        }
    }

    private static async Task EnsureSuccessAsync(HttpResponseMessage response, CancellationToken ct)
    {
        if (response.IsSuccessStatusCode) return;
        string? message = null;
        try
        {
            message = (await response.Content.ReadFromJsonAsync<ErrorBody>(Json, ct))?.Error?.Message;
        }
        catch (JsonException)
        {
            // corpo não é JSON (proxy, página de erro): usa a mensagem genérica
        }
        throw new CloudApiException(message ?? $"O site respondeu {(int)response.StatusCode}.", response.StatusCode);
    }
}
