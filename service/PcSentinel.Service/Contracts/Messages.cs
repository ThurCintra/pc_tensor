using System.Text.Json;
using System.Text.Json.Serialization;

namespace PcSentinel.Service.Contracts;

/// <summary>Versão do contrato (docs/contrato-websocket.md). Mudanças incompatíveis incrementam.</summary>
public static class Protocol
{
    public const int Version = 2;

    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.Never,
        NumberHandling = JsonNumberHandling.Strict,
    };
}

/// <summary>Envelope de toda mensagem servidor → cliente.</summary>
public sealed record ServerEnvelope(int V, string Type, long Seq, long Ts, object Data)
{
    public static ServerEnvelope Create(string type, long seq, object data) =>
        new(Protocol.Version, type, seq, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), data);
}

public static class MessageTypes
{
    public const string Hello = "hello";
    public const string Telemetry = "telemetry";
    public const string Alert = "alert";
    public const string CommandResult = "commandResult";
    public const string Command = "command";
}

/// <summary>Mensagem cliente → servidor.</summary>
public sealed record ClientCommand(int V, string Type, string? Id, string? Action, JsonElement Params);

public sealed record CommandResult(string? Id, bool Ok, object? Data, string? Error)
{
    public static CommandResult Success(string? id, object? data) => new(id, true, data, null);
    public static CommandResult Failure(string? id, string error) => new(id, false, null, error);
}

public static class CommandActions
{
    public const string StutterBuster = "STUTTER_BUSTER";
    public const string SetEnergyConfig = "SET_ENERGY_CONFIG";
    public const string GetSiliconCurve = "GET_SILICON_CURVE";
    public const string Ping = "PING";

    // pc_tensor Cloud: só aceitos de clientes no próprio PC (o app), nunca do celular pela rede
    public const string CloudPair = "CLOUD_PAIR";
    public const string CloudUnpair = "CLOUD_UNPAIR";
    public const string CloudStatus = "CLOUD_STATUS";
}

public sealed record HelloData(
    string ServiceVersion,
    string MachineName,
    bool IsElevated,
    int TickIntervalMs,
    ThrottleLimits ThrottleLimits,
    IReadOnlyList<string> Profiles,
    Capabilities Capabilities);

public sealed record ThrottleLimits(double CpuC, double GpuC);

public sealed record Capabilities(bool StutterBuster, bool ForegroundDetection, bool Frametime);

public sealed record AlertData(string Kind, string Component, string Severity, string Message, double? Value);

public static class AlertKinds
{
    public const string PredictiveThrottle = "PREDICTIVE_THROTTLE";
    public const string Throttling = "THROTTLING";
    public const string NetworkSpike = "NETWORK_SPIKE";
    public const string Maintenance = "MAINTENANCE";
}
