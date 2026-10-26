using System.Net;
using PcSentinel.Service.Cloud;
using PcSentinel.Service.Context;
using PcSentinel.Service.Contracts;
using PcSentinel.Service.Control;
using PcSentinel.Service.Native;
using PcSentinel.Service.Network;
using PcSentinel.Service.Persistence;
using PcSentinel.Service.Sensors;
using PcSentinel.Service.Server;

// Serviço de telemetria do PC Sentinel.
// Uso: pc-sentinel-service [--Port 3891] [--DataDir <pasta>] [--ParentPid <pid>]
//      pc-sentinel-service --pair <código de 6 dígitos> --cloud-url <https://site>   (vincula à nuvem e sai)
//      pc-sentinel-service --dump-sensors
// Contrato local: docs/contrato-websocket.md; nuvem: cloud/README.md

if (args.Contains("--dump-sensors"))
{
    using var sampler = new HardwareSampler();
    sampler.Dump(Console.Out);
    return 0;
}

if (args.Contains("--pair"))
{
    return await PairFromCommandLineAsync(args);
}

var builder = WebApplication.CreateBuilder(args);

int port = builder.Configuration.GetValue("Port", 3891);
string dataDir = builder.Configuration.GetValue<string>("DataDir")
    ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "pc-sentinel");

builder.WebHost.ConfigureKestrel(kestrel =>
{
    kestrel.Listen(IPAddress.Any, port); // rede local, para o celular; o token protege o acesso
    kestrel.AddServerHeader = false;
});

var thermal = builder.Configuration.GetSection("Thermal").Get<ThermalOptions>() ?? new ThermalOptions();

builder.Services.AddSingleton(thermal);
builder.Services.AddSingleton(new TelemetryDb(Path.Combine(dataDir, "telemetry.db")));
builder.Services.AddSingleton(new PairingToken(Path.Combine(dataDir, "settings.json")));
builder.Services.AddSingleton<EnergySettings>();
builder.Services.AddSingleton<HardwareSampler>();
builder.Services.AddSingleton<NetworkProbe>();
builder.Services.AddSingleton(sp => new ProfileRuleStore(sp.GetRequiredService<TelemetryDb>()));
builder.Services.AddSingleton<ForegroundProfiler>();
builder.Services.AddSingleton<StutterBuster>();
builder.Services.AddSingleton(sp => new CommandHandler(
    sp.GetRequiredService<StutterBuster>(),
    sp.GetRequiredService<TelemetryDb>(),
    sp.GetRequiredService<EnergySettings>(),
    sp.GetRequiredService<ILogger<CommandHandler>>(),
    () => sp.GetService<CloudConnector>(),
    sp.GetRequiredService<ProfileRuleStore>()));
builder.Services.AddSingleton<WebSocketHub>();
// Registrados como singleton e como serviço em segundo plano: o conector da nuvem e o handler de comandos
// precisam da mesma instância que roda
builder.Services.AddSingleton<TelemetryEngine>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<TelemetryEngine>());
builder.Services.AddSingleton(new CloudCredentialStore(dataDir));
builder.Services.AddSingleton(builder.Configuration.GetSection("Cloud").Get<CloudOptions>() ?? new CloudOptions());
builder.Services.AddHttpClient<CloudApiClient>(http => http.Timeout = TimeSpan.FromSeconds(20));
builder.Services.AddSingleton<CloudConnector>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<CloudConnector>());

var app = builder.Build();
bool elevated = WindowsMemory.IsElevated();
if (!elevated)
{
    app.Logger.LogWarning("Sem privilégio de administrador: parte dos sensores e o Stutter Buster ficam indisponíveis.");
}

app.UseWebSockets(new WebSocketOptions { KeepAliveInterval = TimeSpan.FromSeconds(15) });

app.MapGet("/health", (WebSocketHub hub) => Results.Ok(new { status = "ok", clients = hub.ClientCount, protocol = Protocol.Version }));

app.Map("/ws", async (HttpContext http, PairingToken token, WebSocketHub hub, ThermalOptions limits) =>
{
    if (!http.WebSockets.IsWebSocketRequest)
    {
        http.Response.StatusCode = StatusCodes.Status400BadRequest;
        return;
    }
    if (!IsAllowedOrigin(http.Request))
    {
        http.Response.StatusCode = StatusCodes.Status403Forbidden;
        return;
    }
    if (!token.IsValid(http.Request.Query["token"]))
    {
        http.Response.StatusCode = StatusCodes.Status401Unauthorized;
        return;
    }

    using var socket = await http.WebSockets.AcceptWebSocketAsync();
    var hello = new HelloData(
        ServiceVersion: typeof(Program).Assembly.GetName().Version?.ToString(3) ?? "0.0.0",
        MachineName: Environment.MachineName,
        IsElevated: elevated,
        TickIntervalMs: (int)TelemetryEngine.TickInterval.TotalMilliseconds,
        ThrottleLimits: new ThrottleLimits(limits.CpuLimitC, limits.GpuLimitC),
        Profiles: Profiles.All,
        Capabilities: new Capabilities(StutterBuster: elevated, ForegroundDetection: true, Frametime: false));
    bool isLocal = http.Connection.RemoteIpAddress is { } ip && IPAddress.IsLoopback(ip);
    await hub.RunClientAsync(socket, hello, isLocal, http.RequestAborted);
});

app.Lifetime.ApplicationStopping.Register(() => app.Services.GetRequiredService<StutterBuster>().Restore());

// Iniciado pelo app (--ParentPid): encerra junto com ele, para não ficar órfão segurando a porta
if (builder.Configuration.GetValue<int?>("ParentPid") is int parentPid)
{
    _ = Task.Run(async () =>
    {
        try
        {
            using var parent = System.Diagnostics.Process.GetProcessById(parentPid);
            await parent.WaitForExitAsync(app.Lifetime.ApplicationStopping);
        }
        catch (ArgumentException)
        {
            // o app já tinha saído
        }
        catch (OperationCanceledException)
        {
            return;
        }
        app.Logger.LogInformation("App {Pid} encerrou; encerrando o serviço.", parentPid);
        app.Lifetime.StopApplication();
    });
}

app.Logger.LogInformation("PC Sentinel Service ouvindo em ws://0.0.0.0:{Port}/ws (dados em {DataDir})", port, dataDir);
await app.RunAsync();
return 0;

// Navegadores só conectam de páginas servidas pelo próprio PC (qualquer porta) ou do dev server local.
// Clientes nativos (Electron, testes) não mandam Origin e são aceitos; o token continua obrigatório.
static bool IsAllowedOrigin(HttpRequest request)
{
    string? origin = request.Headers.Origin;
    if (string.IsNullOrEmpty(origin)) return true;
    if (!Uri.TryCreate(origin, UriKind.Absolute, out var uri)) return false;
    return uri.IsLoopback || string.Equals(uri.Host, request.Host.Host, StringComparison.OrdinalIgnoreCase);
}

// --pair: pareia sem o app (instalação remota, servidores). Grava as credenciais na pasta de dados e sai.
static async Task<int> PairFromCommandLineAsync(string[] args)
{
    string? Arg(string name) => Array.IndexOf(args, name) is var i && i >= 0 && i + 1 < args.Length ? args[i + 1] : null;
    string? code = Arg("--pair");
    if (code is null || !Uri.TryCreate(Arg("--cloud-url"), UriKind.Absolute, out var apiUrl))
    {
        Console.Error.WriteLine("Uso: pc-sentinel-service --pair <código> --cloud-url <https://site> [--DataDir <pasta>]");
        return 2;
    }
    string dataDir = Arg("--DataDir") ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "pc-sentinel");

    using var sampler = new HardwareSampler();
    var sample = sampler.Sample();
    var hardware = new PairingHardware(
        Environment.MachineName,
        sample.CpuName,
        sample.GpuName,
        sample.MemoryTotalMb is double mb ? Math.Round(mb / 1024, 1) : null);

    using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(20) };
    try
    {
        var credentials = await new CloudApiClient(http).PairAsync(apiUrl, code.Trim(), hardware, CancellationToken.None);
        new CloudCredentialStore(dataDir).Save(credentials, AlertLimits.Default);
        Console.WriteLine($"PC pareado: {credentials.DeviceId}. A conexão começa quando o serviço iniciar.");
        return 0;
    }
    catch (CloudApiException ex)
    {
        Console.Error.WriteLine($"Não foi possível parear: {ex.Message}");
        return 1;
    }
}

public partial class Program;
