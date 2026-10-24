using System.Net;
using PcSentinel.Service.Context;
using PcSentinel.Service.Contracts;
using PcSentinel.Service.Control;
using PcSentinel.Service.Native;
using PcSentinel.Service.Network;
using PcSentinel.Service.Persistence;
using PcSentinel.Service.Sensors;
using PcSentinel.Service.Server;

// Serviço de telemetria do PC Sentinel. Uso: pc-sentinel-service [--Port 3891] [--DataDir <pasta>]
// Contrato: docs/contrato-websocket.md

if (args.Contains("--dump-sensors"))
{
    using var sampler = new HardwareSampler();
    sampler.Dump(Console.Out);
    return;
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
builder.Services.AddSingleton<ForegroundProfiler>();
builder.Services.AddSingleton<StutterBuster>();
builder.Services.AddSingleton<CommandHandler>();
builder.Services.AddSingleton<WebSocketHub>();
builder.Services.AddHostedService<TelemetryEngine>();

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
    await hub.RunClientAsync(socket, hello, http.RequestAborted);
});

app.Lifetime.ApplicationStopping.Register(() => app.Services.GetRequiredService<StutterBuster>().Restore());

app.Logger.LogInformation("PC Sentinel Service ouvindo em ws://0.0.0.0:{Port}/ws (dados em {DataDir})", port, dataDir);
await app.RunAsync();

// Navegadores só conectam de páginas servidas pelo próprio PC (qualquer porta) ou do dev server local.
// Clientes nativos (Electron, testes) não mandam Origin e são aceitos; o token continua obrigatório.
static bool IsAllowedOrigin(HttpRequest request)
{
    string? origin = request.Headers.Origin;
    if (string.IsNullOrEmpty(origin)) return true;
    if (!Uri.TryCreate(origin, UriKind.Absolute, out var uri)) return false;
    return uri.IsLoopback || string.Equals(uri.Host, request.Host.Host, StringComparison.OrdinalIgnoreCase);
}

public partial class Program;
