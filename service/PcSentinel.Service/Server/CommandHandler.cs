using System.Text.Json;
using PcSentinel.Service.Cloud;
using PcSentinel.Service.Contracts;
using PcSentinel.Service.Control;
using PcSentinel.Service.Persistence;

namespace PcSentinel.Service.Server;

/// <summary>Configuração de energia em vigor (lida pelo laço de telemetria a cada quadro).</summary>
public sealed class EnergySettings
{
    public const double DefaultTariffBrlPerKwh = 0.95;
    public const double DefaultBaseLoadW = 60;
    public const string TariffKey = "energy.tariffBrlPerKwh";
    public const string BaseLoadKey = "energy.baseLoadW";

    public double TariffBrlPerKwh { get; set; } = DefaultTariffBrlPerKwh;
    public double BaseLoadW { get; set; } = DefaultBaseLoadW;
}

/// <summary>Executa os comandos cliente → servidor descritos em docs/contrato-websocket.md.</summary>
public sealed class CommandHandler(
    StutterBuster stutterBuster,
    TelemetryDb db,
    EnergySettings energy,
    ILogger<CommandHandler> logger,
    // Resolvido só quando usado: o conector depende do laço de telemetria, que depende do hub, que depende daqui
    Func<CloudConnector?>? cloudAccessor = null)
{
    private readonly SemaphoreSlim _stutterBusterGate = new(1, 1);

    private CloudConnector? Cloud => cloudAccessor?.Invoke();

    /// <param name="isLocal">A conexão veio do próprio PC (loopback). Comandos da nuvem exigem isso.</param>
    public async Task<CommandResult> HandleAsync(ReadOnlyMemory<byte> json, CancellationToken ct, bool isLocal = true)
    {
        ClientCommand? command;
        try
        {
            command = JsonSerializer.Deserialize<ClientCommand>(json.Span, Protocol.Json);
        }
        catch (JsonException)
        {
            return CommandResult.Failure(null, "JSON inválido.");
        }

        if (command is null || command.Type != MessageTypes.Command)
            return CommandResult.Failure(command?.Id, "Mensagem não é um comando.");
        if (command.V != Protocol.Version)
            return CommandResult.Failure(command.Id, $"Versão do contrato não suportada: {command.V}.");

        try
        {
            return command.Action switch
            {
                CommandActions.Ping => CommandResult.Success(command.Id, new { pong = true }),
                CommandActions.StutterBuster => await RunStutterBusterAsync(command.Id, ct),
                CommandActions.SetEnergyConfig => SetEnergyConfig(command),
                CommandActions.GetSiliconCurve => GetSiliconCurve(command),
                CommandActions.CloudPair or CommandActions.CloudUnpair or CommandActions.CloudStatus when !isLocal =>
                    CommandResult.Failure(command.Id, "Disponível só no app do próprio PC."),
                CommandActions.CloudPair or CommandActions.CloudUnpair or CommandActions.CloudStatus when Cloud is null =>
                    CommandResult.Failure(command.Id, "Conexão com a nuvem indisponível neste serviço."),
                CommandActions.CloudPair => await CloudPairAsync(command, ct),
                CommandActions.CloudUnpair => CloudUnpair(command.Id),
                CommandActions.CloudStatus => CommandResult.Success(command.Id, Cloud!.Status),
                _ => CommandResult.Failure(command.Id, $"Comando desconhecido: {command.Action}."),
            };
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogError(ex, "Falha ao executar {Action}", command.Action);
            return CommandResult.Failure(command.Id, "Erro interno ao executar o comando.");
        }
    }

    private async Task<CommandResult> RunStutterBusterAsync(string? id, CancellationToken ct)
    {
        // Um por vez: dois cliques seguidos no celular não disputam a lista de processos
        if (!await _stutterBusterGate.WaitAsync(0, ct))
            return CommandResult.Failure(id, "O Stutter Buster já está em execução.");
        try
        {
            var result = await Task.Run(stutterBuster.Run, ct);
            logger.LogInformation(
                "Stutter Buster: standby {Purged} ({Freed} MB), {Count} processos rebaixados",
                result.StandbyPurged, result.StandbyFreedMb, result.Deprioritized.Count);
            return CommandResult.Success(id, result);
        }
        finally
        {
            _stutterBusterGate.Release();
        }
    }

    private CommandResult SetEnergyConfig(ClientCommand command)
    {
        double? tariff = ReadNumber(command.Params, "tariffBrlPerKwh");
        double? baseLoad = ReadNumber(command.Params, "baseLoadW");

        if (tariff is double t && (t < 0 || t > 10))
            return CommandResult.Failure(command.Id, "A tarifa deve estar entre R$ 0 e R$ 10 por kWh.");
        if (baseLoad is double b && (b < 0 || b > 500))
            return CommandResult.Failure(command.Id, "A carga base deve estar entre 0 e 500 W.");

        if (tariff is double tv)
        {
            energy.TariffBrlPerKwh = tv;
            db.SetSetting(EnergySettings.TariffKey, tv);
        }
        if (baseLoad is double bv)
        {
            energy.BaseLoadW = bv;
            db.SetSetting(EnergySettings.BaseLoadKey, bv);
        }
        return CommandResult.Success(command.Id, new { energy.TariffBrlPerKwh, energy.BaseLoadW });
    }

    private CommandResult GetSiliconCurve(ClientCommand command)
    {
        string component = command.Params.ValueKind == JsonValueKind.Object &&
                           command.Params.TryGetProperty("component", out var c) && c.ValueKind == JsonValueKind.String
            ? c.GetString()!
            : "cpu";
        if (component is not ("cpu" or "gpu"))
            return CommandResult.Failure(command.Id, "Componente deve ser \"cpu\" ou \"gpu\".");
        return CommandResult.Success(command.Id, new { component, points = db.GetSiliconCurve(component) });
    }

    private async Task<CommandResult> CloudPairAsync(ClientCommand command, CancellationToken ct)
    {
        string? code = ReadString(command.Params, "code")?.Trim();
        string? url = ReadString(command.Params, "apiUrl")?.Trim();
        if (code is null || code.Length != 6 || !code.All(char.IsAsciiDigit))
            return CommandResult.Failure(command.Id, "Digite o código de 6 dígitos mostrado no site.");
        if (url is null || !Uri.TryCreate(url, UriKind.Absolute, out var apiUrl) || apiUrl.Scheme is not ("https" or "http"))
            return CommandResult.Failure(command.Id, "Endereço do site inválido.");
        // Fora do próprio PC (desenvolvimento), o token só trafega cifrado
        if (apiUrl.Scheme == "http" && !apiUrl.IsLoopback)
            return CommandResult.Failure(command.Id, "Use o endereço https:// do site.");

        try
        {
            return CommandResult.Success(command.Id, await Cloud!.PairAsync(apiUrl, code, ct));
        }
        catch (CloudApiException ex)
        {
            return CommandResult.Failure(command.Id, ex.Message);
        }
    }

    private CommandResult CloudUnpair(string? id)
    {
        Cloud!.Unpair();
        return CommandResult.Success(id, Cloud!.Status);
    }

    private static string? ReadString(JsonElement obj, string name) =>
        obj.ValueKind == JsonValueKind.Object && obj.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString()
            : null;

    private static double? ReadNumber(JsonElement obj, string name) =>
        obj.ValueKind == JsonValueKind.Object && obj.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.Number
            ? value.GetDouble()
            : null;
}
