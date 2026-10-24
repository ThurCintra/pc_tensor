using System.Reflection;
using LibreHardwareMonitor.Hardware;

namespace PcSentinel.Service.Sensors;

/// <summary>Leituras do registro de desempenho (PMLog) do driver AMD.</summary>
public sealed record AmdPmLogReading(double? CpuTempC, double? SocTempC);

/// <summary>
/// Leitura alternativa pelo driver da placa de vídeo AMD (ADL2_New_QueryPMLogData_Get).
/// O driver Adrenalin expõe a temperatura da CPU Ryzen sem precisar do driver de kernel do
/// LibreHardwareMonitor, então ela funciona mesmo sem administrador. A função é interna ao
/// LibreHardwareMonitorLib e por isso é chamada por reflexão; se a biblioteca mudar, a leitura
/// alternativa só deixa de existir (devolve null), sem afetar o resto.
/// Mesmos índices usados pela ponte anterior (native/sensor-bridge), validados no Ryzen 5 9600X.
/// </summary>
public static class AmdPmLog
{
    private const int CpuTempIndex = 32;
    private const int SocTempIndex = 29;

    private static readonly Lazy<(Type Output, MethodInfo Query)?> Api = new(Resolve);

    public static AmdPmLogReading? Read(IHardware amdGpu)
    {
        if (amdGpu.HardwareType != HardwareType.GpuAmd || Api.Value is not var (outputType, query)) return null;

        try
        {
            Type gpuType = amdGpu.GetType();
            object? context = gpuType.GetField("_context", BindingFlags.NonPublic | BindingFlags.Instance)?.GetValue(amdGpu);
            object? adapterInfo = gpuType.GetField("_adapterInfo", BindingFlags.NonPublic | BindingFlags.Instance)?.GetValue(amdGpu);
            if (context is not nint ctx || adapterInfo is null) return null;
            int adapterIndex = adapterInfo.GetType().GetField("AdapterIndex")?.GetValue(adapterInfo) is int idx ? idx : 0;

            object?[] args = [ctx, adapterIndex, Activator.CreateInstance(outputType)];
            // O retorno é o enum ADLStatus do LibreHardwareMonitor (ADL_OK = 0)
            if (query.Invoke(null, args) is not { } status || Convert.ToInt32(status) != 0) return null;
            if (outputType.GetField("sensors")?.GetValue(args[2]) is not Array sensors) return null;

            return new AmdPmLogReading(Value(sensors, CpuTempIndex), Value(sensors, SocTempIndex));
        }
        catch (Exception ex) when (ex is TargetInvocationException or InvalidCastException or MemberAccessException)
        {
            return null;
        }
    }

    /// <summary>Descreve os membros internos usados, para o --dump-sensors explicar por que a leitura falhou.</summary>
    public static string Diagnose(IHardware amdGpu)
    {
        var flags = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Static;
        Type? adl = typeof(Computer).Assembly.GetType("LibreHardwareMonitor.Interop.AtiAdlxx");
        var methods = adl?.GetMethods(flags).Where(m => m.Name.Contains("PMLog")).Select(m =>
            $"{m.Name}({string.Join(", ", m.GetParameters().Select(p => p.ParameterType.Name))})") ?? [];
        string call;
        try
        {
            if (Api.Value is not var (outputType, query)) return $"ADL={adl is not null}; métodos=[{string.Join("; ", methods)}]";
            Type gpuType = amdGpu.GetType();
            object? context = gpuType.GetField("_context", flags)?.GetValue(amdGpu);
            object? adapterInfo = gpuType.GetField("_adapterInfo", flags)?.GetValue(amdGpu);
            object? index = adapterInfo?.GetType().GetField("AdapterIndex")?.GetValue(adapterInfo);
            object?[] args = [context, index ?? 0, Activator.CreateInstance(outputType)];
            object? result = query.Invoke(null, args);
            var outFields = outputType.GetFields(flags).Select(f => $"{f.Name}:{f.FieldType.Name}");
            string sample = outputType.GetField("sensors")?.GetValue(args[2]) is Array arr
                ? string.Join(" ", Enumerable.Range(0, Math.Min(arr.Length, 40)).Select(i => $"{i}={Describe(arr.GetValue(i))}"))
                : "sem campo sensors";
            call = $"contexto={context}; adaptador={index}; retorno={result}; saída=[{string.Join(", ", outFields)}]; {sample}";
        }
        catch (Exception ex)
        {
            call = $"exceção {ex.GetType().Name}: {ex.InnerException?.Message ?? ex.Message}";
        }
        return call;

        static string Describe(object? item)
        {
            if (item is null) return "null";
            Type t = item.GetType();
            return $"{t.GetField("supported")?.GetValue(item)}/{t.GetField("value")?.GetValue(item)}";
        }
    }

    private static double? Value(Array sensors, int index)
    {
        if (index >= sensors.Length || sensors.GetValue(index) is not { } item) return null;
        Type t = item.GetType();
        bool supported = Convert.ToBoolean(t.GetField("supported")?.GetValue(item));
        int value = Convert.ToInt32(t.GetField("value")?.GetValue(item));
        return supported && value > 0 ? value : null;
    }

    private static (Type, MethodInfo)? Resolve()
    {
        Type? adl = typeof(Computer).Assembly.GetType("LibreHardwareMonitor.Interop.AtiAdlxx");
        Type? output = adl?.GetNestedType("ADLPMLogDataOutput", BindingFlags.Public | BindingFlags.NonPublic);
        MethodInfo? query = adl?.GetMethod("ADL2_New_QueryPMLogData_Get", BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static);
        return output is not null && query is not null ? (output, query) : null;
    }
}
