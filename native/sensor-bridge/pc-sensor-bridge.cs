using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Management;
using System.Reflection;
using System.Security.Principal;
using System.Text;
using System.Threading;
using LibreHardwareMonitor.Hardware;

namespace PCSentinelBridge
{
    public class Program
    {
        private static Computer _computer;
        private static bool _streaming = false;
        // --no-hardware: só contadores do Windows (I/O de disco), sem abrir o LibreHardwareMonitor. O app usa este
        // modo quando o serviço nativo (pc-sentinel-service) já lê os sensores, para os dois não disputarem o
        // barramento SMBus/Super I/O.
        private static bool _hardware = true;
        private static bool _isAdmin = false;
        private static PerformanceCounter _diskReadCounter = null;
        private static PerformanceCounter _diskWriteCounter = null;
        private static string _cachedMoboName = null;
        private static string _cachedDiskName = null;

        public static void Main(string[] args)
        {
            foreach (var arg in args)
            {
                if (arg.Equals("--stream", StringComparison.OrdinalIgnoreCase))
                {
                    _streaming = true;
                }
                else if (arg.Equals("--no-hardware", StringComparison.OrdinalIgnoreCase))
                {
                    _hardware = false;
                }
            }

            _isAdmin = CheckIsAdministrator();
            InitPerformanceCounters();
            DetectStaticHardwareFallback();

            try
            {
                _computer = !_hardware ? null : new Computer
                {
                    IsCpuEnabled = true,
                    IsGpuEnabled = true,
                    IsMotherboardEnabled = true,
                    IsMemoryEnabled = true,
                    IsControllerEnabled = false,
                    IsStorageEnabled = true
                };

                if (_computer != null) _computer.Open();

                if (_streaming)
                {
                    while (true)
                    {
                        string json = CollectMetricsJson();
                        Console.WriteLine(json);
                        Console.Out.Flush();
                        Thread.Sleep(1000);
                    }
                }
                else
                {
                    string json = CollectMetricsJson();
                    Console.WriteLine(json);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("{\"success\":false,\"error\":\"" + EscapeJson(ex.Message) + "\"}");
            }
            finally
            {
                try
                {
                    if (_computer != null)
                    {
                        _computer.Close();
                    }
                }
                catch { }

                try
                {
                    if (_diskReadCounter != null) _diskReadCounter.Dispose();
                    if (_diskWriteCounter != null) _diskWriteCounter.Dispose();
                }
                catch { }
            }
        }

        private static bool CheckIsAdministrator()
        {
            try
            {
                using (var identity = WindowsIdentity.GetCurrent())
                {
                    var principal = new WindowsPrincipal(identity);
                    return principal.IsInRole(WindowsBuiltInRole.Administrator);
                }
            }
            catch
            {
                return false;
            }
        }

        private static void InitPerformanceCounters()
        {
            try
            {
                if (PerformanceCounterCategory.Exists("PhysicalDisk"))
                {
                    _diskReadCounter = new PerformanceCounter("PhysicalDisk", "Disk Read Bytes/sec", "_Total", true);
                    _diskWriteCounter = new PerformanceCounter("PhysicalDisk", "Disk Write Bytes/sec", "_Total", true);
                    _diskReadCounter.NextValue();
                    _diskWriteCounter.NextValue();
                }
            }
            catch
            {
                _diskReadCounter = null;
                _diskWriteCounter = null;
            }
        }

        private static void DetectStaticHardwareFallback()
        {
            try
            {
                using (var searcher = new ManagementObjectSearcher("SELECT Manufacturer, Product FROM Win32_BaseBoard"))
                {
                    foreach (ManagementObject obj in searcher.Get())
                    {
                        string m = obj["Manufacturer"] != null ? obj["Manufacturer"].ToString().Trim() : "";
                        string p = obj["Product"] != null ? obj["Product"].ToString().Trim() : "";
                        _cachedMoboName = (m + " " + p).Trim();
                        break;
                    }
                }
            }
            catch { }

            try
            {
                using (var searcher = new ManagementObjectSearcher("SELECT Model FROM Win32_DiskDrive"))
                {
                    foreach (ManagementObject obj in searcher.Get())
                    {
                        if (obj["Model"] != null)
                        {
                            _cachedDiskName = obj["Model"].ToString().Trim();
                            break;
                        }
                    }
                }
            }
            catch { }
        }

        private static string CollectMetricsJson()
        {
            string cpuName = "Processador";
            float? cpuTemp = null;
            float? cpuLoad = null;
            float? cpuPower = null;

            string gpuName = "GPU";
            float? gpuTemp = null;
            float? gpuMemTemp = null;
            float? gpuHotspot = null;
            float? gpuFanRpm = null;
            float? gpuLoad = null;
            float? gpuPower = null;
            float? gpuVramUsed = null;
            float? gpuVramTotal = null;

            string moboName = _cachedMoboName ?? "Placa-mãe";
            float? moboTemp = null;

            string diskName = _cachedDiskName ?? "Unidade de Armazenamento";
            float? diskTemp = null;
            float? diskLoad = null;

            float? fanRpm = null;

            // Sem o LibreHardwareMonitor (--no-hardware) as seções 1 a 4 ficam vazias e só o I/O de disco é lido
            IEnumerable<IHardware> allHardware = _computer != null ? (IEnumerable<IHardware>)_computer.Hardware : new IHardware[0];

            // 1. CPU via LibreHardwareMonitor
            foreach (var hardware in allHardware)
            {
                if (hardware.HardwareType == HardwareType.Cpu)
                {
                    hardware.Update();
                    if (!string.IsNullOrEmpty(hardware.Name))
                        cpuName = hardware.Name;

                    foreach (var sensor in hardware.Sensors)
                    {
                        if (!sensor.Value.HasValue) continue;
                        float val = sensor.Value.Value;
                        string sName = sensor.Name.ToLowerInvariant();

                        if (sensor.SensorType == SensorType.Temperature && val > 0)
                        {
                            if (sName.Contains("tctl") || sName.Contains("package") || sName.Contains("core max"))
                            {
                                if (!cpuTemp.HasValue || sName.Contains("tctl"))
                                    cpuTemp = val;
                            }
                            else if (!cpuTemp.HasValue && (sName.Contains("core") || sName.Contains("cpu")))
                            {
                                cpuTemp = val;
                            }
                        }
                        else if (sensor.SensorType == SensorType.Load)
                        {
                            if (sName.Contains("total"))
                            {
                                cpuLoad = val;
                            }
                        }
                        else if (sensor.SensorType == SensorType.Power && val > 0)
                        {
                            if (sName.Contains("package") || sName.Contains("total"))
                            {
                                cpuPower = val;
                            }
                        }
                    }
                }
            }

            // 2. GPU via LibreHardwareMonitor e AMD ADL PMLog
            foreach (var hardware in allHardware)
            {
                if (hardware.HardwareType == HardwareType.GpuAmd ||
                    hardware.HardwareType == HardwareType.GpuNvidia ||
                    hardware.HardwareType == HardwareType.GpuIntel)
                {
                    hardware.Update();
                    string hwName = hardware.Name ?? "GPU";
                    bool isApu = hwName.IndexOf("Graphics", StringComparison.OrdinalIgnoreCase) >= 0 ||
                                 hwName.IndexOf("APU", StringComparison.OrdinalIgnoreCase) >= 0;

                    if (!isApu || gpuName == "GPU")
                    {
                        gpuName = hwName;
                    }

                    foreach (var sensor in hardware.Sensors)
                    {
                        if (!sensor.Value.HasValue) continue;
                        float val = sensor.Value.Value;
                        string sName = sensor.Name.ToLowerInvariant();

                        if (sensor.SensorType == SensorType.Temperature && val > 0)
                        {
                            if (isApu)
                            {
                                if (!cpuTemp.HasValue || cpuTemp.Value <= 0)
                                {
                                    cpuTemp = val;
                                }
                            }
                            else
                            {
                                if (sName.Contains("core") || sName.Contains("gpu core") || sName.Contains("edge"))
                                {
                                    if (!gpuTemp.HasValue || sName.Contains("core"))
                                        gpuTemp = val;
                                }
                                else if (sName.Contains("hot spot") || sName.Contains("hotspot"))
                                {
                                    gpuHotspot = val;
                                }
                                else if (sName.Contains("memory") || sName.Contains("vram"))
                                {
                                    gpuMemTemp = val;
                                }
                                else if (sName.Contains("soc") || sName.Contains("vr soc"))
                                {
                                    if (!gpuTemp.HasValue) gpuTemp = val;
                                    if (!gpuHotspot.HasValue) gpuHotspot = val;
                                }
                                else if (!gpuTemp.HasValue)
                                {
                                    gpuTemp = val;
                                }
                            }
                        }
                        else if (!isApu)
                        {
                            if (sensor.SensorType == SensorType.Fan && val >= 0)
                            {
                                gpuFanRpm = val;
                                if (!fanRpm.HasValue || val > 0) fanRpm = val;
                            }
                            else if (sensor.SensorType == SensorType.Load)
                            {
                                if (sName.Contains("core") || sName.Contains("d3d 3d") || sName.Contains("gpu"))
                                {
                                    if (!gpuLoad.HasValue || sName.Contains("core")) gpuLoad = val;
                                }
                            }
                            else if (sensor.SensorType == SensorType.Power && val >= 0)
                            {
                                if (sName.Contains("package") || sName.Contains("core") || sName.Contains("asic") || sName.Contains("total"))
                                {
                                    if (!gpuPower.HasValue || sName.Contains("package") || sName.Contains("total")) gpuPower = val;
                                }
                            }
                            else if (sensor.SensorType == SensorType.SmallData && val > 0)
                            {
                                if (sName.Contains("gpu memory used") && !sName.Contains("d3d"))
                                {
                                    gpuVramUsed = val;
                                }
                                else if (sName.Contains("gpu memory total") && !sName.Contains("d3d"))
                                {
                                    gpuVramTotal = val;
                                }
                            }
                        }
                    }

                    if (hardware.HardwareType == HardwareType.GpuAmd)
                    {
                        try
                        {
                            QueryAmdPMLog(hardware, isApu, ref cpuTemp, ref gpuTemp, ref gpuHotspot, ref gpuLoad, ref gpuPower, ref gpuFanRpm);
                        }
                        catch { }
                    }
                }
            }

            // 3. Motherboard via LibreHardwareMonitor
            foreach (var hardware in allHardware)
            {
                if (hardware.HardwareType == HardwareType.Motherboard)
                {
                    hardware.Update();
                    if (!string.IsNullOrEmpty(hardware.Name))
                        moboName = hardware.Name;

                    foreach (var s in hardware.Sensors)
                    {
                        if (s.SensorType == SensorType.Temperature && s.Value.HasValue && s.Value.Value > 0)
                        {
                            if (!moboTemp.HasValue) moboTemp = s.Value.Value;
                        }
                        else if (s.SensorType == SensorType.Fan && s.Value.HasValue && s.Value.Value > 0)
                        {
                            if (!fanRpm.HasValue) fanRpm = s.Value.Value;
                        }
                    }

                    foreach (var sub in hardware.SubHardware)
                    {
                        sub.Update();
                        foreach (var s in sub.Sensors)
                        {
                            if (s.SensorType == SensorType.Temperature && s.Value.HasValue && s.Value.Value > 0)
                            {
                                if (!moboTemp.HasValue) moboTemp = s.Value.Value;
                            }
                            else if (s.SensorType == SensorType.Fan && s.Value.HasValue && s.Value.Value > 0)
                            {
                                if (!fanRpm.HasValue) fanRpm = s.Value.Value;
                            }
                        }
                    }
                }
            }

            // 4. Storage via LibreHardwareMonitor
            foreach (var hardware in allHardware)
            {
                if (hardware.HardwareType == HardwareType.Storage)
                {
                    hardware.Update();
                    if (!string.IsNullOrEmpty(hardware.Name))
                        diskName = hardware.Name;

                    foreach (var s in hardware.Sensors)
                    {
                        if (s.SensorType == SensorType.Temperature && s.Value.HasValue && s.Value.Value > 0)
                        {
                            if (!diskTemp.HasValue) diskTemp = s.Value.Value;
                        }
                        else if (s.SensorType == SensorType.Load && s.Value.HasValue)
                        {
                            if (!diskLoad.HasValue) diskLoad = s.Value.Value;
                        }
                    }
                }
            }

            // 5. Taxas Reais de I/O de Disco via PerformanceCounter
            float diskReadBytesSec = 0;
            float diskWriteBytesSec = 0;
            try
            {
                if (_diskReadCounter != null) diskReadBytesSec = _diskReadCounter.NextValue();
                if (_diskWriteCounter != null) diskWriteBytesSec = _diskWriteCounter.NextValue();
            }
            catch { }

            var sb = new StringBuilder();
            sb.Append("{\"success\":true,");
            sb.Append("\"isAdmin\":").Append(_isAdmin ? "true" : "false").Append(",");
            sb.Append("\"hardware\":").Append(_computer != null ? "true" : "false").Append(",");

            sb.Append("\"cpu\":{");
            sb.Append("\"name\":\"").Append(EscapeJson(cpuName)).Append("\",");
            sb.Append("\"temp\":").Append(FormatNullable(cpuTemp)).Append(",");
            sb.Append("\"load\":").Append(FormatNullable(cpuLoad)).Append(",");
            sb.Append("\"powerWatts\":").Append(FormatNullable(cpuPower)).Append(",");
            sb.Append("\"requiresElevation\":").Append(!cpuTemp.HasValue && !_isAdmin ? "true" : "false");
            sb.Append("},");

            sb.Append("\"gpu\":{");
            sb.Append("\"name\":\"").Append(EscapeJson(gpuName)).Append("\",");
            sb.Append("\"temp\":").Append(FormatNullable(gpuTemp)).Append(",");
            sb.Append("\"memoryTemp\":").Append(FormatNullable(gpuMemTemp)).Append(",");
            sb.Append("\"hotspotTemp\":").Append(FormatNullable(gpuHotspot)).Append(",");
            sb.Append("\"fanRpm\":").Append(FormatNullable(gpuFanRpm)).Append(",");
            sb.Append("\"load\":").Append(FormatNullable(gpuLoad)).Append(",");
            sb.Append("\"powerWatts\":").Append(FormatNullable(gpuPower)).Append(",");
            sb.Append("\"vramUsedMB\":").Append(FormatNullable(gpuVramUsed)).Append(",");
            sb.Append("\"vramTotalMB\":").Append(FormatNullable(gpuVramTotal));
            sb.Append("},");

            sb.Append("\"motherboard\":{");
            sb.Append("\"name\":\"").Append(EscapeJson(moboName)).Append("\",");
            sb.Append("\"temp\":").Append(FormatNullable(moboTemp)).Append(",");
            sb.Append("\"requiresElevation\":").Append(!moboTemp.HasValue && !_isAdmin ? "true" : "false");
            sb.Append("},");

            sb.Append("\"storage\":{");
            sb.Append("\"name\":\"").Append(EscapeJson(diskName)).Append("\",");
            sb.Append("\"temp\":").Append(FormatNullable(diskTemp)).Append(",");
            sb.Append("\"load\":").Append(FormatNullable(diskLoad)).Append(",");
            sb.Append("\"requiresElevation\":").Append(!diskTemp.HasValue && !_isAdmin ? "true" : "false");
            sb.Append("},");

            sb.Append("\"diskIo\":{");
            sb.Append("\"readBytesSec\":").Append(diskReadBytesSec.ToString("F0", CultureInfo.InvariantCulture)).Append(",");
            sb.Append("\"writeBytesSec\":").Append(diskWriteBytesSec.ToString("F0", CultureInfo.InvariantCulture));
            sb.Append("},");

            sb.Append("\"fanRpm\":").Append(FormatNullable(fanRpm)).Append(",");
            sb.Append("\"realSensors\":{");
            sb.Append("\"cpu\":").Append(cpuTemp.HasValue && cpuTemp.Value > 0 ? "true" : "false").Append(",");
            sb.Append("\"gpu\":").Append(gpuTemp.HasValue && gpuTemp.Value > 0 ? "true" : "false").Append(",");
            sb.Append("\"motherboard\":").Append(moboTemp.HasValue && moboTemp.Value > 0 ? "true" : "false").Append(",");
            sb.Append("\"storage\":").Append(diskTemp.HasValue && diskTemp.Value > 0 ? "true" : "false");
            sb.Append("}}");

            return sb.ToString();
        }

        private static void QueryAmdPMLog(
            IHardware amdGpuHardware,
            bool isApu,
            ref float? cpuTemp,
            ref float? gpuTemp,
            ref float? gpuHotspot,
            ref float? gpuLoad,
            ref float? gpuPower,
            ref float? gpuFanRpm)
        {
            Type gpuType = amdGpuHardware.GetType();
            FieldInfo contextField = gpuType.GetField("_context", BindingFlags.NonPublic | BindingFlags.Instance);
            FieldInfo adapterInfoField = gpuType.GetField("_adapterInfo", BindingFlags.NonPublic | BindingFlags.Instance);
            if (contextField == null || adapterInfoField == null) return;

            IntPtr context = (IntPtr)contextField.GetValue(amdGpuHardware);
            object adapterInfo = adapterInfoField.GetValue(amdGpuHardware);
            if (adapterInfo == null) return;

            FieldInfo idxField = adapterInfo.GetType().GetField("AdapterIndex");
            int adapterIndex = idxField != null ? (int)idxField.GetValue(adapterInfo) : 0;

            Assembly lhmAsm = typeof(Computer).Assembly;
            Type atiType = lhmAsm.GetType("LibreHardwareMonitor.Interop.AtiAdlxx");
            if (atiType == null) return;

            Type outputType = atiType.GetNestedType("ADLPMLogDataOutput", BindingFlags.Public | BindingFlags.NonPublic);
            if (outputType == null) return;

            object outputInstance = Activator.CreateInstance(outputType);
            MethodInfo queryMethod = atiType.GetMethod("ADL2_New_QueryPMLogData_Get", BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static);
            if (queryMethod == null) return;

            object[] invokeArgs = new object[] { context, adapterIndex, outputInstance };
            int res = (int)queryMethod.Invoke(null, invokeArgs);
            if (res != 0) return;

            outputInstance = invokeArgs[2];
            FieldInfo sensorsField = outputType.GetField("sensors");
            if (sensorsField == null) return;

            Array sensorsArray = sensorsField.GetValue(outputInstance) as Array;
            if (sensorsArray == null) return;

            float? adlCpuTemp = null;
            float? adlSocTemp = null;
            float? adlGfxTemp = null;
            float? adlEdgeTemp = null;
            float? adlHotspotTemp = null;
            float? adlLoad = null;
            float? adlPower = null;
            float? adlFanRpm = null;

            for (int i = 0; i < sensorsArray.Length; i++)
            {
                object item = sensorsArray.GetValue(i);
                if (item == null) continue;

                Type itemType = item.GetType();
                FieldInfo supField = itemType.GetField("supported");
                FieldInfo valField = itemType.GetField("value");
                if (supField == null || valField == null) continue;

                bool supported = Convert.ToBoolean(supField.GetValue(item));
                int rawVal = Convert.ToInt32(valField.GetValue(item));
                if (!supported || rawVal <= 0) continue;

                if (i == 32) adlCpuTemp = rawVal;
                else if (i == 29) adlSocTemp = rawVal;
                else if (i == 28) adlGfxTemp = rawVal;
                else if (i == 8) adlEdgeTemp = rawVal;
                else if (i == 27) adlHotspotTemp = rawVal;
                else if (i == 19) adlLoad = rawVal;
                else if (i == 23 || i == 73) adlPower = rawVal;
                else if (i == 14) adlFanRpm = rawVal;
            }

            if (isApu)
            {
                if (!cpuTemp.HasValue || cpuTemp.Value <= 0)
                {
                    if (adlCpuTemp.HasValue && adlCpuTemp.Value > 0)
                        cpuTemp = adlCpuTemp.Value;
                    else if (adlSocTemp.HasValue && adlSocTemp.Value > 0)
                        cpuTemp = adlSocTemp.Value;
                    else if (adlGfxTemp.HasValue && adlGfxTemp.Value > 0)
                        cpuTemp = adlGfxTemp.Value;
                }
            }
            else
            {
                if (adlCpuTemp.HasValue && adlCpuTemp.Value > 0 && (!cpuTemp.HasValue || cpuTemp.Value <= 0))
                {
                    cpuTemp = adlCpuTemp.Value;
                }

                if (adlEdgeTemp.HasValue && adlEdgeTemp.Value > 0)
                    gpuTemp = adlEdgeTemp.Value;
                else if (adlGfxTemp.HasValue && adlGfxTemp.Value > 0)
                    gpuTemp = adlGfxTemp.Value;

                if (adlHotspotTemp.HasValue && adlHotspotTemp.Value > 0)
                    gpuHotspot = adlHotspotTemp.Value;
                else if (adlSocTemp.HasValue && adlSocTemp.Value > 0 && !gpuHotspot.HasValue)
                    gpuHotspot = adlSocTemp.Value;

                if (adlLoad.HasValue && (!gpuLoad.HasValue || adlLoad.Value > 0))
                    gpuLoad = adlLoad.Value;

                if (adlPower.HasValue && (!gpuPower.HasValue || adlPower.Value > 0))
                    gpuPower = adlPower.Value;

                if (adlFanRpm.HasValue && (!gpuFanRpm.HasValue || adlFanRpm.Value > 0))
                    gpuFanRpm = adlFanRpm.Value;
            }
        }

        private static string FormatNullable(float? val)
        {
            if (!val.HasValue || float.IsNaN(val.Value) || float.IsInfinity(val.Value))
                return "null";
            return val.Value.ToString("F1", CultureInfo.InvariantCulture);
        }

        private static string EscapeJson(string s)
        {
            if (string.IsNullOrEmpty(s)) return "";
            return s.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\n", "\\n").Replace("\r", "\\r");
        }
    }
}
