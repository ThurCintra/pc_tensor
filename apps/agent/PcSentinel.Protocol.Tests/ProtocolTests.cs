using PcSentinel.Protocol.Generated;
using ProtocolModel = global::PcSentinel.Protocol.Generated.Protocol;

namespace PcSentinel.Protocol.Tests;

public class ProtocolTests
{
    private const string ComputerId = "123e4567-e89b-12d3-a456-426614174000";
    private const string MessageId = "123e4567-e89b-12d3-a456-426614174001";

    [Fact]
    public void HardwareInfo_Deserializes_And_Confirms_Values()
    {
        const string json = """
            {
              "v": 1,
              "type": "hardware:info",
              "id": "123e4567-e89b-12d3-a456-426614174001",
              "ts": "2026-01-01T00:00:00.000Z",
              "computerId": "123e4567-e89b-12d3-a456-426614174000",
              "data": {
                "os": "Windows 11 Pro",
                "hostname": "DESKTOP-ABC123",
                "agentVersion": "0.1.0",
                "cpu": { "name": "Intel Core i7-12700K", "cores": 12, "threads": 20 },
                "gpus": [{ "vendor": "NVIDIA", "name": "GeForce RTX 4070", "vramTotalBytes": 12884901888 }],
                "ram": { "totalBytes": 34359738368 },
                "disks": [
                  { "id": "disk-0", "label": "System", "mountPoint": "C:", "totalBytes": 1000204886016 }
                ],
                "capabilities": {
                  "cpuTemperature": true,
                  "gpuTemperature": true,
                  "gpuPower": true,
                  "perCoreLoad": true
                }
              }
            }
            """;

        var envelope = ProtocolModel.FromJson(json);

        Assert.NotNull(envelope);
        Assert.Equal(1.0, envelope.V);
        Assert.Equal(TypeEnum.HardwareInfo, envelope.Type);
        Assert.Equal(Guid.Parse(MessageId), envelope.Id);
        Assert.Equal(Guid.Parse(ComputerId), envelope.ComputerId);
        Assert.Equal("Windows 11 Pro", envelope.Data.Os);
        Assert.Equal("DESKTOP-ABC123", envelope.Data.Hostname);
        Assert.Equal("0.1.0", envelope.Data.AgentVersion);
        Assert.NotNull(envelope.Data.Cpu);
        Assert.Equal("Intel Core i7-12700K", envelope.Data.Cpu.Name);
        Assert.Equal((long?)12, envelope.Data.Cpu.Cores);
        Assert.Equal((long?)20, envelope.Data.Cpu.Threads);
        Assert.NotNull(envelope.Data.Gpus);
        Assert.Single(envelope.Data.Gpus);
        Assert.Equal("NVIDIA", envelope.Data.Gpus[0].Vendor);
        Assert.Equal((long?)12884901888, envelope.Data.Gpus[0].VramTotalBytes);
        Assert.NotNull(envelope.Data.Ram);
        Assert.Equal((long?)34359738368, envelope.Data.Ram.TotalBytes);
        Assert.NotNull(envelope.Data.Capabilities);
        Assert.True(envelope.Data.Capabilities.CpuTemperature);
    }

    [Fact]
    public void MetricsUpdate_With_Nulls_Deserializes_And_Confirms_Values()
    {
        const string json = """
            {
              "v": 1,
              "type": "metrics:update",
              "id": "123e4567-e89b-12d3-a456-426614174001",
              "ts": "2026-01-01T00:00:00.000Z",
              "computerId": "123e4567-e89b-12d3-a456-426614174000",
              "data": {
                "seq": 7,
                "cpu": { "usage": null, "temperature": null, "frequencyMhz": null, "perCore": null },
                "gpus": [
                  {
                    "index": 0,
                    "usage": null,
                    "temperature": 61.5,
                    "vramUsedBytes": null,
                    "clockMhz": null,
                    "powerWatts": null
                  }
                ],
                "ram": { "usedBytes": null, "availableBytes": 25769803776, "usage": 25.0 }
              }
            }
            """;

        var envelope = ProtocolModel.FromJson(json);

        Assert.NotNull(envelope);
        Assert.Equal(TypeEnum.MetricsUpdate, envelope.Type);
        Assert.Equal((long?)7, envelope.Data.Seq);
        Assert.NotNull(envelope.Data.Cpu);
        Assert.Null(envelope.Data.Cpu.Usage);
        Assert.Null(envelope.Data.Cpu.Temperature);
        Assert.Null(envelope.Data.Cpu.FrequencyMhz);
        Assert.Null(envelope.Data.Cpu.PerCore);
        Assert.NotNull(envelope.Data.Gpus);
        Assert.Single(envelope.Data.Gpus);
        Assert.Equal((long?)0, envelope.Data.Gpus[0].Index);
        Assert.Null(envelope.Data.Gpus[0].Usage);
        Assert.Equal((double?)61.5, envelope.Data.Gpus[0].Temperature);
        Assert.Null(envelope.Data.Gpus[0].VramUsedBytes);
        Assert.NotNull(envelope.Data.Ram);
        Assert.Null(envelope.Data.Ram.UsedBytes);
        Assert.Equal((long?)25769803776, envelope.Data.Ram.AvailableBytes);
        Assert.Equal((double?)25.0, envelope.Data.Ram.Usage);
    }
}
