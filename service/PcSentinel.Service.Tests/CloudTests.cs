using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging.Abstractions;
using PcSentinel.Service.Cloud;
using PcSentinel.Service.Contracts;
using PcSentinel.Service.Control;
using PcSentinel.Service.Persistence;
using PcSentinel.Service.Server;

namespace PcSentinel.Service.Tests;

internal static class Frames
{
    public static TelemetryFrame Make(double? cpuTemp = 60, double? gpuTemp = 55, double powerW = 200, string profile = Profiles.AaaGraphics, string? tempSource = TempSources.Sensor)
    {
        var trend = new ThermalTrend(0, null, 95, false);
        return new TelemetryFrame(
            new CpuData("Ryzen", cpuTemp, tempSource, 50, 70, 80, 5000, 1.2, trend),
            new GpuData("Radeon", gpuTemp, gpuTemp + 10, 70, 90, 120, 2500, 1.1, 5000, 8000, 1500, 45, trend),
            new MemoryData(8000, 16384, 50),
            new BoardData("Placa", 35, 50),
            [],
            [],
            new NetworkData("Ethernet", "192.168.0.1", 1, 12, 1, 0),
            new LagData(LagVerdicts.Normal, []),
            new ContextData(profile, "jogo.exe", 10),
            new EnergyData(powerW, 60, 0.95, 0, 0, 0, 0, 0, 0),
            new MaintenanceData(false, null, null, null, null),
            new EfficiencyData(null, null));
    }
}

public class CloudTelemetryTests
{
    [Fact]
    public void ResumoDeUmMinutoTemMediasMaximaEEnergia()
    {
        var aggregator = new HeartbeatAggregator();
        // 60 s a 4 Hz com 240 W constantes = 4 Wh
        for (int i = 0; i <= 240; i++) aggregator.Add(Frames.Make(cpuTemp: i < 120 ? 60 : 70, gpuTemp: 50, powerW: 240), i * 0.25);

        var hb = aggregator.Take(1_700_000_000_000)!;

        Assert.Equal(1_700_000_000_000, hb.Ts);
        Assert.Equal("AAA_GAMING", hb.Profile);
        Assert.Equal(65, hb.AvgCpuTemp!.Value, precision: 0);
        Assert.Equal(50, hb.AvgGpuTemp);
        Assert.Equal(70, hb.MaxTemp); // CPU 70 > hotspot da GPU 60
        Assert.Equal(4, hb.EnergyConsumedWh, precision: 3);
        Assert.Null(aggregator.Take(0)); // minuto fechado: começa vazio
    }

    [Fact]
    public void PerfisViramOVocabularioDaNuvem()
    {
        Assert.Equal("COMPETITIVE_FPS", CloudProfiles.ToCloud(Profiles.CompetitiveFps));
        Assert.Equal("AAA_GAMING", CloudProfiles.ToCloud(Profiles.AaaGraphics));
        Assert.Equal("WORKSTATION", CloudProfiles.ToCloud(Profiles.DevWorkstation));
        Assert.Equal("IDLE", CloudProfiles.ToCloud(Profiles.Idle));
    }

    [Fact]
    public void QuadroAoVivoLevaTsPerfilEOQuadroInteiro()
    {
        var json = CloudFrames.Live(Frames.Make(profile: Profiles.CompetitiveFps), 123).ToJsonString();
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;

        Assert.Equal(123, root.GetProperty("ts").GetInt64());
        Assert.Equal("COMPETITIVE_FPS", root.GetProperty("profile").GetString());
        Assert.Equal(60, root.GetProperty("cpu").GetProperty("tempC").GetDouble());
        Assert.Equal(90, root.GetProperty("gpu").GetProperty("loadPct").GetDouble());
        Assert.True(root.TryGetProperty("energy", out _)); // os cards da nuvem usam o quadro completo
    }

    [Fact]
    public void SuperaquecimentoAvisaUmaVezEReativaComFolgaDe3Graus()
    {
        var monitor = new OverheatMonitor { Limits = new AlertLimits(85, 80, true) };

        var first = Assert.Single(monitor.Evaluate(Frames.Make(cpuTemp: 86, gpuTemp: 60)));
        Assert.Equal(new CloudAlert("OVERHEAT", "cpu", "CPU a 86 °C (limite 85 °C)", 86), first);
        Assert.Empty(monitor.Evaluate(Frames.Make(cpuTemp: 90)));
        Assert.Empty(monitor.Evaluate(Frames.Make(cpuTemp: 83))); // abaixo do limite, mas dentro da folga
        Assert.Empty(monitor.Evaluate(Frames.Make(cpuTemp: 86)));
        monitor.Evaluate(Frames.Make(cpuTemp: 81));
        Assert.Single(monitor.Evaluate(Frames.Make(cpuTemp: 86)));
    }

    [Fact]
    public void SuperaquecimentoIgnoraDieDeESEAlertasDesligados()
    {
        Assert.Empty(new OverheatMonitor { Limits = new AlertLimits(50, 99, true) }.Evaluate(Frames.Make(cpuTemp: 70, tempSource: TempSources.IoDie)));
        Assert.Empty(new OverheatMonitor { Limits = new AlertLimits(50, 50, false) }.Evaluate(Frames.Make(cpuTemp: 99, gpuTemp: 99)));
    }

    [Fact]
    public void SoAlertasRelevantesVaoParaANuvem()
    {
        Assert.Equal("PREDICTIVE_THROTTLE", OverheatMonitor.FromLocal(new AlertData(AlertKinds.PredictiveThrottle, "cpu", "warning", "x", 20))!.Type);
        Assert.Equal("DUST_WARNING", OverheatMonitor.FromLocal(new AlertData(AlertKinds.Maintenance, "gpu", "info", "x", 6))!.Type);
        Assert.Null(OverheatMonitor.FromLocal(new AlertData(AlertKinds.NetworkSpike, "network", "warning", "x", 5)));
    }
}

public class CommandDispatcherTests
{
    private static (CommandDispatcher Dispatcher, List<string> Calls, Func<AlertLimits> Limits) Create(bool purgeOk = true)
    {
        var calls = new List<string>();
        var limits = AlertLimits.Default;
        var dispatcher = new CommandDispatcher(
            () =>
            {
                calls.Add("purge");
                return purgeOk ? (true, 2048, null) : (false, null, "Precisa de administrador.");
            },
            () =>
            {
                calls.Add("priority");
                return ["chrome.exe"];
            },
            l => limits = l,
            () => limits);
        return (dispatcher, calls, () => limits);
    }

    private static JsonElement Json(string json) => JsonDocument.Parse(json).RootElement;

    [Fact]
    public void ExecutaSoAsTresAcoesPermitidas()
    {
        var (dispatcher, calls, limits) = Create();

        Assert.Equal("2048 MB de cache liberados.", dispatcher.Execute(Json("""{"action":"ACTION_CLEAN_RAM"}""")).Message);
        Assert.True(dispatcher.Execute(Json("""{"action":"ACTION_OPTIMIZE_PRIORITY"}""")).Ok);
        var config = dispatcher.Execute(Json("""{"action":"ACTION_UPDATE_CONFIG","maxCpuTempAlert":88,"maxGpuTempAlert":82}"""));

        Assert.True(config.Ok);
        Assert.Equal(new AlertLimits(88, 82, true), limits());
        Assert.Equal(["purge", "priority"], calls);
    }

    [Theory]
    [InlineData("""{"action":"RUN_SHELL","cmd":"format c:"}""")]
    [InlineData("""{"action":"ACTION_UPDATE_CONFIG","maxCpuTempAlert":500,"maxGpuTempAlert":80}""")]
    [InlineData("""{"action":"ACTION_UPDATE_CONFIG","maxCpuTempAlert":"90","maxGpuTempAlert":80}""")]
    [InlineData("""{"semAction":true}""")]
    [InlineData("""[1,2,3]""")]
    public void RecusaQualquerOutraCoisa(string json)
    {
        var (dispatcher, calls, limits) = Create();
        Assert.False(dispatcher.Execute(Json(json)).Ok);
        Assert.Empty(calls);
        Assert.Equal(AlertLimits.Default, limits());
    }

    [Fact]
    public void LimpezaSemPrivilegioDevolveOMotivo()
    {
        var (dispatcher, _, _) = Create(purgeOk: false);
        var result = dispatcher.Execute(Json("""{"action":"ACTION_CLEAN_RAM"}"""));
        Assert.Equal(new CloudCommandResult(false, "Precisa de administrador."), result);
    }
}

public class CloudCredentialStoreTests
{
    [Fact]
    public void GuardaOTokenCifradoComDpapi()
    {
        string dir = Directory.CreateTempSubdirectory().FullName;
        var store = new CloudCredentialStore(dir);
        var credentials = new CloudCredentials(new Uri("https://pc.example/"), "dev-1", "pct_dev_segredo123");

        store.Save(credentials, new AlertLimits(88, 82, false));

        Assert.DoesNotContain("pct_dev_segredo123", File.ReadAllText(Path.Combine(dir, "cloud.json")));
        var (loaded, limits) = store.Load()!.Value;
        Assert.Equal(credentials, loaded);
        Assert.Equal(new AlertLimits(88, 82, false), limits);

        store.SaveLimits(new AlertLimits(90, 85, true));
        Assert.Equal(90, store.Load()!.Value.Limits.MaxCpuTempAlert);

        store.Clear();
        Assert.Null(store.Load());
    }

    [Fact]
    public void ArquivoCorrompidoExigeNovoPareamento()
    {
        string dir = Directory.CreateTempSubdirectory().FullName;
        File.WriteAllText(Path.Combine(dir, "cloud.json"), """{"ApiUrl":"https://x/","DeviceId":"d","ProtectedToken":"AAAA","MaxCpuTempAlert":90,"MaxGpuTempAlert":85,"AlertsEnabled":true}""");
        Assert.Null(new CloudCredentialStore(dir).Load());
    }
}

public class CloudApiClientTests
{
    private sealed class FakeHandler(Func<HttpRequestMessage, HttpResponseMessage> respond) : HttpMessageHandler
    {
        public List<(HttpRequestMessage Request, string? Body)> Requests { get; } = [];

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Requests.Add((request, request.Content is null ? null : await request.Content.ReadAsStringAsync(ct)));
            return respond(request);
        }
    }

    private static HttpResponseMessage JsonResponse(HttpStatusCode status, string json) =>
        new(status) { Content = new StringContent(json, Encoding.UTF8, "application/json") };

    [Fact]
    public async Task PareiaEnviandoOHardware()
    {
        var handler = new FakeHandler(_ => JsonResponse(HttpStatusCode.Created, """{"deviceId":"dev-9","deviceToken":"pct_dev_abc"}"""));
        var client = new CloudApiClient(new HttpClient(handler));

        var credentials = await client.PairAsync(new Uri("https://pc.example"), "123456", new PairingHardware("DESKTOP", "Ryzen", "Radeon", 15.1), CancellationToken.None);

        Assert.Equal(new CloudCredentials(new Uri("https://pc.example"), "dev-9", "pct_dev_abc"), credentials);
        var (request, body) = Assert.Single(handler.Requests);
        Assert.Equal("https://pc.example/api/agent/pair", request.RequestUri!.ToString());
        Assert.Equal("""{"code":"123456","name":"DESKTOP","cpuModel":"Ryzen","gpuModel":"Radeon","totalRamGb":15.1}""", body);
    }

    [Fact]
    public async Task MostraAMensagemDoSiteECodigoMalformado()
    {
        var handler = new FakeHandler(_ => JsonResponse(HttpStatusCode.BadRequest, """{"error":{"code":"INVALID_PAIRING_CODE","message":"Código inválido ou expirado. Gere outro no site."}}"""));
        var client = new CloudApiClient(new HttpClient(handler));
        var hw = new PairingHardware("PC", null, null, null);

        var ex = await Assert.ThrowsAsync<CloudApiException>(() => client.PairAsync(new Uri("https://pc.example"), "654321", hw, CancellationToken.None));
        Assert.Equal("Código inválido ou expirado. Gere outro no site.", ex.Message);
        await Assert.ThrowsAsync<CloudApiException>(() => client.PairAsync(new Uri("https://pc.example"), "12a456", hw, CancellationToken.None));
        Assert.Single(handler.Requests); // código malformado nem sai do PC
    }

    [Fact]
    public async Task TokenRevogadoViraNaoAutorizado()
    {
        var handler = new FakeHandler(r =>
        {
            Assert.Equal("pct_dev_x", r.Headers.GetValues("X-Device-Token").Single());
            return JsonResponse(HttpStatusCode.Unauthorized, """{"error":{"code":"UNAUTHORIZED","message":"x"}}""");
        });
        var client = new CloudApiClient(new HttpClient(handler));
        await Assert.ThrowsAsync<CloudUnauthorizedException>(() =>
            client.GetAgentInfoAsync(new CloudCredentials(new Uri("https://pc.example"), "d", "pct_dev_x"), CancellationToken.None));
    }
}

public class CloudLocalCommandTests
{
    [Fact]
    public async Task ComandosDaNuvemSoValemNoProprioPc()
    {
        using var db = new TelemetryDb(":memory:");
        var handler = new CommandHandler(new StutterBuster(), db, new EnergySettings(), NullLogger<CommandHandler>.Instance);
        byte[] json = Encoding.UTF8.GetBytes("""{"v":2,"type":"command","id":"1","action":"CLOUD_STATUS","params":{}}""");

        var remote = await handler.HandleAsync(json, CancellationToken.None, isLocal: false);
        Assert.Equal("Disponível só no app do próprio PC.", remote.Error);

        var local = await handler.HandleAsync(json, CancellationToken.None, isLocal: true);
        Assert.Equal("Conexão com a nuvem indisponível neste serviço.", local.Error); // sem conector nesse teste
    }
}
