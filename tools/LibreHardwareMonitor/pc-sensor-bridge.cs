using System;
using System.Globalization;
using System.IO;
using System.Reflection;
using System.Text;
using System.Threading;
using LibreHardwareMonitor.Hardware;

namespace PCSentinelBridge
{
    public class Program
    {
        private static Computer _computer;
        private static bool _streaming = false;

        public static void Main(string[] args)
        {
            foreach (var arg in args)
            {
                if (arg.Equals("--stream", StringComparison.OrdinalIgnoreCase))
                {
                    _streaming = true;
                }
            }

            try
            {
                _computer = new Computer
                {
                    IsCpuEnabled = true,
                    IsGpuEnabled = true,
                    IsMotherboardEnabled = false,
                    IsMemoryEnabled = false,
                    IsControllerEnabled = false,
                    IsStorageEnabled = false
                };

                _computer.Open();

                if (_streaming)
                {
                    while (true)
                    {
                        string json = CollectMetricsJson();
                        Console.WriteLine(json);
                        Console.Out.Flush();
                        Thread.Sleep(1200);
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
            }
        }

        private static string CollectMetricsJson()
        {
            string cpuName = "Processador";
            float? cpuTemp = null;
            float? cpuLoad = null;

            string gpuName = "GPU";
            float? gpuTemp = null;
            float? gpuMemTemp = null;
            float? gpuHotspot = null;
            float? gpuFanRpm = null;
            float? gpuLoad = null;
            float? gpuPower = null;
            float? fanRpm = null;

            // 1. Extração de dados da CPU via LibreHardwareMonitor
            foreach (var hardware in _computer.Hardware)
            {
                if (hardware.HardwareType == HardwareType.Cpu)
                {
                    hardware.Update();
                    if (!string.IsNullOrEmpty(hardware.Name))
                        cpuName = hardware.Name;

                    foreach (var sensor in hardware.Sensors)
                    {
                        if (sensor.SensorType == SensorType.Temperature && sensor.Value.HasValue && sensor.Value.Value > 0)
                        {
                            string sName = sensor.Name.ToLowerInvariant();
                            if (sName.Contains("tctl") || sName.Contains("package") || sName.Contains("core max"))
                            {
                                if (!cpuTemp.HasValue || sName.Contains("tctl"))
                                    cpuTemp = sensor.Value.Value;
                            }
                            else if (!cpuTemp.HasValue && (sName.Contains("core") || sName.Contains("cpu")))
                            {
                                cpuTemp = sensor.Value.Value;
                            }
                        }
                        else if (sensor.SensorType == SensorType.Load && sensor.Value.HasValue)
                        {
                            string sName = sensor.Name.ToLowerInvariant();
                            if (sName.Contains("total"))
                            {
                                cpuLoad = sensor.Value.Value;
                            }
                        }
                    }
                }
            }

            // 2. Extração de dados da GPU via LibreHardwareMonitor e AMD ADL PMLog
            foreach (var hardware in _computer.Hardware)
            {
                if (hardware.HardwareType == HardwareType.GpuAmd ||
                    hardware.HardwareType == HardwareType.GpuNvidia ||
                    hardware.HardwareType == HardwareType.GpuIntel)
                {
                    hardware.Update();
                    string hwName = hardware.Name ?? "GPU";
                    bool isApu = hwName.IndexOf("Graphics", StringComparison.OrdinalIgnoreCase) >= 0 ||
                                 hwName.IndexOf("APU", StringComparison.OrdinalIgnoreCase) >= 0;

                    // Se não for APU (é GPU dedicada como RX 7600), prioriza para métricas de GPU principal
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
                                // Sensores térmicos no silício da CPU
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
                                if (sName.Contains("core") || sName.Contains("package") || sName.Contains("asic") || sName.Contains("total"))
                                {
                                    if (!gpuPower.HasValue || sName.Contains("asic") || sName.Contains("total")) gpuPower = val;
                                }
                            }
                        }
                    }

                    // Consulta Direta ao PMLog da AMD (ADL) oficial usado pelo AMD Adrenalin
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

            var sb = new StringBuilder();
            sb.Append("{\"success\":true,");
            sb.Append("\"cpu\":{");
            sb.Append("\"name\":\"").Append(EscapeJson(cpuName)).Append("\",");
            sb.Append("\"temp\":").Append(FormatNullable(cpuTemp)).Append(",");
            sb.Append("\"load\":").Append(FormatNullable(cpuLoad));
            sb.Append("},");

            sb.Append("\"gpu\":{");
            sb.Append("\"name\":\"").Append(EscapeJson(gpuName)).Append("\",");
            sb.Append("\"temp\":").Append(FormatNullable(gpuTemp)).Append(",");
            sb.Append("\"memoryTemp\":").Append(FormatNullable(gpuMemTemp)).Append(",");
            sb.Append("\"hotspotTemp\":").Append(FormatNullable(gpuHotspot)).Append(",");
            sb.Append("\"fanRpm\":").Append(FormatNullable(gpuFanRpm)).Append(",");
            sb.Append("\"load\":").Append(FormatNullable(gpuLoad)).Append(",");
            sb.Append("\"powerWatts\":").Append(FormatNullable(gpuPower));
            sb.Append("},");

            sb.Append("\"fanRpm\":").Append(FormatNullable(fanRpm)).Append(",");
            sb.Append("\"realSensors\":{");
            sb.Append("\"cpu\":").Append(cpuTemp.HasValue && cpuTemp.Value > 0 ? "true" : "false").Append(",");
            sb.Append("\"gpu\":").Append(gpuTemp.HasValue && gpuTemp.Value > 0 ? "true" : "false");
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
            if (res != 0) return; // 0 = ADL_OK

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

            // ADLPMLogSensors índices constantes oficiais AMD ADL:
            // 8: ADL_PMLOG_TEMPERATURE_EDGE
            // 14: ADL_PMLOG_FAN_RPM
            // 19: ADL_PMLOG_INFO_ACTIVITY_GFX
            // 23: ADL_PMLOG_ASIC_POWER
            // 27: ADL_PMLOG_TEMPERATURE_HOTSPOT
            // 28: ADL_PMLOG_TEMPERATURE_GFX
            // 29: ADL_PMLOG_TEMPERATURE_SOC
            // 30: ADL_PMLOG_GFX_POWER
            // 32: ADL_PMLOG_TEMPERATURE_CPU
            // 33: ADL_PMLOG_CPU_POWER
            // 73: ADL_PMLOG_BOARD_POWER
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

                if (i == 32)
                {
                    adlCpuTemp = rawVal;
                }
                else if (i == 29)
                {
                    adlSocTemp = rawVal;
                }
                else if (i == 28)
                {
                    adlGfxTemp = rawVal;
                }
                else if (i == 8)
                {
                    adlEdgeTemp = rawVal;
                }
                else if (i == 27)
                {
                    adlHotspotTemp = rawVal;
                }
                else if (i == 19)
                {
                    adlLoad = rawVal;
                }
                else if (i == 23 || i == 73)
                {
                    adlPower = rawVal;
                }
                else if (i == 14)
                {
                    adlFanRpm = rawVal;
                }
            }

            if (isApu)
            {
                // Temperatura física do processador AMD Ryzen através da sua iGPU / SoC
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
                // GPU dedicada (AMD Radeon RX 7600)
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
