using LibreHardwareMonitor.Hardware;
using PcSentinel.Service.Contracts;

namespace PcSentinel.Service.Sensors;

/// <summary>Leitura bruta de um instante, antes das análises.</summary>
public sealed record HardwareSample(
    string? CpuName,
    double? CpuTempC,
    string? CpuTempSource,
    double? CpuLoadPct,
    double? CpuMaxCoreLoadPct,
    double? CpuPowerW,
    double? CpuClockMhz,
    double? CpuVcoreV,
    string? GpuName,
    double? GpuTempC,
    double? GpuHotspotC,
    double? GpuMemoryTempC,
    double? GpuLoadPct,
    double? GpuPowerW,
    double? GpuClockMhz,
    double? GpuVcoreV,
    double? GpuVramUsedMb,
    double? GpuVramTotalMb,
    double? GpuFanRpm,
    double? GpuFanPct,
    double? MemoryUsedMb,
    double? MemoryTotalMb,
    double? MemoryLoadPct,
    string? BoardName,
    double? BoardSystemTempC,
    double? BoardVrmTempC,
    IReadOnlyList<StorageData> Storage,
    IReadOnlyList<FanData> Fans)
{
    /// <summary>Rotação (%) da ventoinha do processador, usada pela linha de base térmica da CPU.</summary>
    public double? CpuFanPct => Fans.FirstOrDefault(f => f.Name.Contains("CPU", StringComparison.OrdinalIgnoreCase))?.Pct;
}

/// <summary>
/// Lê CPU, GPU, memória, placa-mãe (Super I/O), discos e ventoinhas com o LibreHardwareMonitorLib.
/// Os nomes dos sensores variam por fabricante; as regras abaixo seguem as da ponte de sensores anterior
/// (native/sensor-bridge), testadas em Ryzen 9000 e Radeon RX 7000.
/// </summary>
public sealed class HardwareSampler : IDisposable
{
    private readonly Computer _computer = new()
    {
        IsCpuEnabled = true,
        IsGpuEnabled = true,
        IsMemoryEnabled = true,
        IsMotherboardEnabled = true,
        IsStorageEnabled = true,
        IsControllerEnabled = true,
    };

    private readonly UpdateVisitor _visitor = new();
    private bool _opened;

    public void Open()
    {
        if (_opened) return;
        _computer.Open();
        _opened = true;
    }

    public HardwareSample Sample()
    {
        Open();
        _computer.Accept(_visitor);

        var cpu = new CpuReading();
        var gpu = new GpuReading();
        var mem = new MemoryReading();
        string? boardName = null;
        double? systemTemp = null, vrmTemp = null;
        var storage = new List<StorageData>();
        var fanRpm = new Dictionary<string, double>(StringComparer.OrdinalIgnoreCase);
        var fanPct = new Dictionary<string, double>(StringComparer.OrdinalIgnoreCase);
        double? amdCpuTemp = null, amdIoDieTemp = null;

        foreach (var hw in _computer.Hardware)
        {
            switch (hw.HardwareType)
            {
                case HardwareType.Cpu:
                    cpu.Read(hw);
                    break;
                case HardwareType.GpuAmd or HardwareType.GpuNvidia or HardwareType.GpuIntel:
                    gpu.Consider(hw);
                    if (hw.HardwareType == HardwareType.GpuAmd)
                    {
                        var reading = AmdPmLog.Read(hw);
                        amdCpuTemp ??= reading?.CpuTempC;
                        if (IsIntegrated(hw)) amdIoDieTemp ??= reading?.SocTempC;
                    }
                    break;
                case HardwareType.Memory:
                    mem.Read(hw);
                    break;
                case HardwareType.Motherboard:
                    boardName = hw.Name;
                    foreach (var sub in hw.SubHardware.Prepend(hw))
                    {
                        foreach (var s in sub.Sensors)
                        {
                            if (s.Value is not float v) continue;
                            string name = s.Name;
                            if (s.SensorType == SensorType.Temperature && v > 0)
                            {
                                if (name.Contains("VRM", StringComparison.OrdinalIgnoreCase)) vrmTemp ??= v;
                                else if (name.Contains("System", StringComparison.OrdinalIgnoreCase) ||
                                         name.Contains("Motherboard", StringComparison.OrdinalIgnoreCase)) systemTemp ??= v;
                            }
                            else if (s.SensorType == SensorType.Fan && v > 0) fanRpm[name] = v;
                            else if (s.SensorType == SensorType.Control) fanPct[name] = v;
                        }
                    }
                    break;
                case HardwareType.Storage:
                    double? diskTemp = hw.Sensors
                        .Where(s => s.SensorType == SensorType.Temperature && s.Value > 0)
                        .Select(s => (double?)s.Value)
                        .FirstOrDefault();
                    storage.Add(new StorageData(hw.Name, Round(diskTemp)));
                    break;
            }
        }

        // Sem administrador o LibreHardwareMonitor não lê os núcleos. O driver da placa AMD às vezes informa a
        // CPU; senão, a GPU integrada do Ryzen informa a temperatura do die de E/S (real, mas abaixo do Tctl)
        string? cpuTempSource = cpu.Temp is null ? null : TempSources.Sensor;
        if (cpu.Temp is null && amdCpuTemp is not null) (cpu.Temp, cpuTempSource) = (amdCpuTemp, TempSources.AmdDriver);
        if (cpu.Temp is null && amdIoDieTemp is not null) (cpu.Temp, cpuTempSource) = (amdIoDieTemp, TempSources.IoDie);

        var fans = fanRpm
            .Select(kv => new FanData(kv.Key, Math.Round(kv.Value), fanPct.TryGetValue(kv.Key, out double p) ? Round(p) : null))
            .ToList();

        return new HardwareSample(
            cpu.Name, Round(cpu.Temp), cpuTempSource, Round(cpu.Load), Round(cpu.MaxCoreLoad), Round(cpu.Power), Round(cpu.Clock, 0), Round(cpu.Vcore, 3),
            gpu.Name, Round(gpu.Temp), Round(gpu.Hotspot), Round(gpu.MemoryTemp), Round(gpu.Load), Round(gpu.Power), Round(gpu.Clock, 0),
            Round(gpu.Vcore, 3), Round(gpu.VramUsed, 0), Round(gpu.VramTotal, 0), Round(gpu.FanRpm, 0), Round(gpu.FanPct),
            Round(mem.UsedMb, 0), Round(mem.TotalMb, 0), Round(mem.Load),
            boardName, Round(systemTemp), Round(vrmTemp),
            storage, fans);
    }

    internal static bool IsIntegrated(IHardware hw) =>
        hw.Name.Contains("Graphics", StringComparison.OrdinalIgnoreCase) ||
        hw.Name.Contains("APU", StringComparison.OrdinalIgnoreCase) ||
        (hw.HardwareType == HardwareType.GpuIntel && !hw.Name.Contains("Arc", StringComparison.OrdinalIgnoreCase));

    private static double? Round(double? value, int digits = 1) => value is double v ? Math.Round(v, digits) : null;

    /// <summary>Lista todos os sensores (pc-sentinel-service --dump-sensors), para ajustar as regras de nomes.</summary>
    public void Dump(TextWriter output)
    {
        Open();
        _computer.Accept(_visitor);
        foreach (var hw in _computer.Hardware)
        {
            foreach (var h in hw.SubHardware.Prepend(hw))
            {
                output.WriteLine($"[{h.HardwareType}] {h.Name}");
                if (h.HardwareType == HardwareType.GpuAmd) output.WriteLine($"    PMLog do driver AMD: {AmdPmLog.Read(h)?.ToString() ?? "indisponível"}");
                if (h.HardwareType == HardwareType.GpuAmd) output.WriteLine($"    {AmdPmLog.Diagnose(h)}");
                foreach (var s in h.Sensors)
                    output.WriteLine($"    {s.SensorType,-12} {s.Name,-36} {s.Value?.ToString("0.###", System.Globalization.CultureInfo.InvariantCulture) ?? "-"}");
            }
        }
    }

    public void Dispose()
    {
        if (_opened) _computer.Close();
    }

    private sealed class CpuReading
    {
        public string? Name;
        public double? Temp, Load, MaxCoreLoad, Power, Clock, Vcore;

        public void Read(IHardware hw)
        {
            Name ??= hw.Name;
            var clocks = new List<double>();
            foreach (var s in hw.Sensors)
            {
                if (s.Value is not float v) continue;
                string n = s.Name.ToLowerInvariant();
                switch (s.SensorType)
                {
                    case SensorType.Temperature when v > 0:
                        if (n.Contains("tctl") || n.Contains("package") || n.Contains("core max"))
                        {
                            if (Temp is null || n.Contains("tctl")) Temp = v;
                        }
                        else if (Temp is null && (n.Contains("core") || n.Contains("cpu"))) Temp = v;
                        break;
                    case SensorType.Load:
                        if (n.Contains("total")) Load = v;
                        else if (n.Contains("core max")) MaxCoreLoad = Math.Max(MaxCoreLoad ?? 0, v);
                        else if (n.StartsWith("cpu core #")) MaxCoreLoad = Math.Max(MaxCoreLoad ?? 0, v);
                        break;
                    case SensorType.Power when v > 0:
                        if (n.Contains("package")) Power = v;
                        break;
                    case SensorType.Clock when v > 0:
                        if (n.StartsWith("core #")) clocks.Add(v);
                        break;
                    case SensorType.Voltage when v > 0:
                        // Só a tensão medida: SVI2/SVI3 (AMD) ou "CPU Core" (Intel). O VID é o que o processador
                        // pede ao regulador (chega a 1,55 V no Ryzen) e distorceria a curva de eficiência
                        if (n.Contains("svi") || n == "cpu core") Vcore = v;
                        break;
                }
            }
            if (clocks.Count > 0) Clock = clocks.Average();
        }
    }

    private sealed class GpuReading
    {
        public string? Name;
        public double? Temp, Hotspot, MemoryTemp, Load, Power, Clock, Vcore, VramUsed, VramTotal, FanRpm, FanPct;
        private bool _hasDiscrete;

        /// <summary>Prefere a placa dedicada; a GPU integrada (APU) só é usada se for a única.</summary>
        public void Consider(IHardware hw)
        {
            bool integrated = IsIntegrated(hw);
            if (_hasDiscrete) return; // já há uma placa dedicada: fica a primeira
            if (integrated && Name is not null) return; // já há uma integrada lida
            if (!integrated)
            {
                _hasDiscrete = true;
                Temp = Hotspot = MemoryTemp = Load = Power = Clock = Vcore = VramUsed = VramTotal = FanRpm = FanPct = null;
            }

            Name = hw.Name;
            foreach (var s in hw.Sensors)
            {
                if (s.Value is not float v) continue;
                string n = s.Name.ToLowerInvariant();
                switch (s.SensorType)
                {
                    case SensorType.Temperature when v > 0:
                        if (n.Contains("hot spot") || n.Contains("hotspot")) Hotspot = v;
                        else if (n.Contains("memory") || n.Contains("vram")) MemoryTemp = v;
                        else if (n.Contains("core") || n.Contains("edge")) Temp = Temp is null || n.Contains("core") ? v : Temp;
                        break;
                    case SensorType.Load:
                        if (n == "gpu core" || (Load is null && n.Contains("d3d 3d"))) Load = v;
                        break;
                    case SensorType.Power when v >= 0:
                        if (n.Contains("package") || n.Contains("total") || n == "gpu power") Power = v;
                        else if (Power is null && (n.Contains("core") || n.Contains("asic"))) Power = v;
                        break;
                    case SensorType.Clock when v > 0:
                        if (n == "gpu core") Clock = v;
                        break;
                    case SensorType.Voltage when v > 0:
                        if (n == "gpu core") Vcore = v;
                        break;
                    case SensorType.SmallData when v > 0:
                        if (n.Contains("d3d")) break;
                        if (n.Contains("memory used")) VramUsed = v;
                        else if (n.Contains("memory total")) VramTotal = v;
                        break;
                    case SensorType.Fan when v >= 0:
                        FanRpm = v;
                        break;
                    case SensorType.Control when v >= 0:
                        if (n.Contains("fan")) FanPct = v;
                        break;
                }
            }
        }
    }

    private sealed class MemoryReading
    {
        public double? UsedMb, TotalMb, Load;

        public void Read(IHardware hw)
        {
            // "Virtual Memory" inclui o arquivo de paginação; interessa só a RAM física
            if (hw.Name.Contains("Virtual", StringComparison.OrdinalIgnoreCase)) return;
            double? usedGb = null, availableGb = null;
            foreach (var s in hw.Sensors)
            {
                if (s.Value is not float v) continue;
                if (s.SensorType == SensorType.Data && s.Name.Equals("Memory Used", StringComparison.OrdinalIgnoreCase)) usedGb = v;
                else if (s.SensorType == SensorType.Data && s.Name.Equals("Memory Available", StringComparison.OrdinalIgnoreCase)) availableGb = v;
                else if (s.SensorType == SensorType.Load && s.Name.Equals("Memory", StringComparison.OrdinalIgnoreCase)) Load = v;
            }
            if (usedGb is double u) UsedMb = u * 1024;
            if (usedGb is double u2 && availableGb is double a) TotalMb = (u2 + a) * 1024;
        }
    }

    private sealed class UpdateVisitor : IVisitor
    {
        public void VisitComputer(IComputer computer) => computer.Traverse(this);

        public void VisitHardware(IHardware hardware)
        {
            hardware.Update();
            foreach (var sub in hardware.SubHardware) sub.Accept(this);
        }

        public void VisitSensor(ISensor sensor) { }

        public void VisitParameter(IParameter parameter) { }
    }
}
