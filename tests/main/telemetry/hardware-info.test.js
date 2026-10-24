import { describe, it, expect, vi } from 'vitest';
const { SystemCollector } = require('../../../src/main/telemetry/collector');

const createCollector = (si) => new SystemCollector({ si, autoStart: false, thermalDbPath: ':memory:' });

describe('Hardware Info Collector & Graceful Degradation', () => {
  it('should return complete hardware specification contract matching requirements', async () => {
    const mockSi = {
      osInfo: vi.fn().mockResolvedValue({
        distro: 'Microsoft Windows 11 Home',
        build: '26300',
        arch: 'x64',
        hostname: 'DESKTOP-UV6BTUV',
      }),
      time: vi.fn().mockReturnValue({ uptime: 12500 }),
      system: vi.fn().mockResolvedValue({
        manufacturer: 'Micro-Star International Co., Ltd.',
        model: 'MS-7E27',
      }),
      baseboard: vi.fn().mockResolvedValue({
        manufacturer: 'Micro-Star International Co., Ltd.',
        model: 'PRO B650M-P (MS-7E27)',
        version: '1.0',
      }),
      bios: vi.fn().mockResolvedValue({
        version: '1.G0',
        releaseDate: '2025-06-19',
        vendor: 'American Megatrends International, LLC.',
      }),
      cpu: vi.fn().mockResolvedValue({
        manufacturer: 'AMD',
        brand: 'Ryzen 5 9600X 6-Core Processor',
        physicalCores: 6,
        cores: 12,
        speed: 3.9,
        speedMax: 5.4,
        socket: 'AM5',
        cache: {
          l1d: 196608,
          l1i: 196608,
          l2: 6291456,
          l3: 33554432,
        },
      }),
      graphics: vi.fn().mockResolvedValue({
        controllers: [
          {
            vendor: 'Advanced Micro Devices, Inc. [AMD/ATI]',
            model: 'AMD Radeon RX 7600',
            vram: 8176,
            driverVersion: '31.0.24033.1003',
            bus: 'PCIe 4.0 x16',
          },
          {
            vendor: 'Advanced Micro Devices, Inc. [AMD/ATI]',
            model: 'AMD Radeon(TM) Graphics',
            vram: 512,
            driverVersion: null,
            bus: 'PCIe',
          },
        ],
      }),
      memLayout: vi.fn().mockResolvedValue([
        {
          bank: 'DIMM 1',
          size: 17179869184,
          type: 'DDR5',
          clockSpeed: 5600,
          manufacturer: 'Kingston',
          partNum: 'KF556C40-16',
        },
      ]),
      mem: vi.fn().mockResolvedValue({
        total: 17179869184,
      }),
      diskLayout: vi.fn().mockResolvedValue([
        {
          name: 'KINGSTON SNV3S500G',
          type: 'NVMe',
          interfaceType: 'NVMe',
          size: 500107862016,
        },
      ]),
      fsSize: vi.fn().mockResolvedValue([
        {
          fs: 'C:',
          mount: 'C:',
          type: 'NTFS',
          size: 500107862016,
        },
      ]),
      networkInterfaces: vi.fn().mockResolvedValue([
        {
          iface: 'Ethernet',
          ip4: '192.168.100.85',
          mac: '04:7c:16:xx:xx:xx',
          type: 'wired',
          speed: 1000,
          default: true,
          operstate: 'up',
        },
      ]),
      cpuTemperature: vi.fn().mockResolvedValue({ main: 45, max: 50 }),
    };

    const collector = createCollector(mockSi);
    collector.hasWorkingTempSensor = true;
    collector.cachedGfx = { gpuTemp: 48, gpuName: 'AMD Radeon RX 7600' };
    const info = await collector.getHardwareInfo(true);

    // OS & System
    expect(info.os.osName).toBe('Microsoft Windows 11 Home');
    expect(info.os.build).toBe('26300');
    expect(info.os.arch).toBe('x64');
    expect(info.os.hostname).toBe('DESKTOP-UV6BTUV');
    expect(info.os.agentVersion).toBe(require('../../../package.json').version);
    expect(info.os.uptimeSeconds).toBe(12500);

    // Motherboard
    expect(info.motherboard.manufacturer).toBe('Micro-Star International Co., Ltd.');
    expect(info.motherboard.model).toBe('PRO B650M-P (MS-7E27)');
    expect(info.motherboard.biosVersion).toBe('1.G0');
    expect(info.motherboard.biosDate).toBe('2025-06-19');

    // CPU
    expect(info.cpu.name).toBe('Ryzen 5 9600X 6-Core Processor');
    expect(info.cpu.cores).toBe(6);
    expect(info.cpu.threads).toBe(12);
    expect(info.cpu.baseSpeedMHz).toBe(3900);
    expect(info.cpu.maxSpeedMHz).toBe(5400);
    expect(info.cpu.socket).toBe('AM5');
    expect(info.cpu.l3CacheBytes).toBe(33554432);

    // Multiple GPUs support
    expect(info.gpus.length).toBe(2);
    expect(info.gpus[0].vendor).toBe('AMD');
    expect(info.gpus[0].name).toBe('AMD Radeon RX 7600');
    expect(info.gpus[0].vramTotalBytes).toBe(8176 * 1024 * 1024);
    expect(info.gpus[0].driverVersion).toBe('31.0.24033.1003');

    // RAM
    expect(info.ram.totalBytes).toBe(17179869184);
    expect(info.ram.type).toBe('DDR5');
    expect(info.ram.speedMHz).toBe(5600);
    expect(info.ram.slots.length).toBe(1);

    // Disks
    expect(info.disks.length).toBe(1);
    expect(info.disks[0].id).toBe('C:');
    expect(info.disks[0].type).toBe('NVMe');
    expect(info.disks[0].fsType).toBe('NTFS');

    // Network & Privacy (no public IP)
    expect(info.network.interface).toBe('Ethernet');
    expect(info.network.localIp).toBe('192.168.100.85');
    expect(info.network).not.toHaveProperty('publicIp');

    // Capabilities
    expect(info.capabilities.cpuTemperature).toBe(true);
    expect(info.capabilities.gpuTemperature).toBe(true);
  });

  it('should gracefully degrade with null values and never crash when hardware queries fail', async () => {
    const brokenSi = {
      osInfo: vi.fn().mockRejectedValue(new Error('WMI query failed')),
      time: vi.fn().mockImplementation(() => {
        throw new Error('Time failed');
      }),
      system: vi.fn().mockResolvedValue(null),
      baseboard: vi.fn().mockResolvedValue(null),
      bios: vi.fn().mockRejectedValue(new Error('BIOS access denied')),
      cpu: vi.fn().mockResolvedValue({
        brand: '',
        physicalCores: 0,
        cores: 0,
        speed: 0,
        speedMax: 0,
        socket: '',
      }),
      graphics: vi.fn().mockRejectedValue(new Error('GPU driver crashed')),
      memLayout: vi.fn().mockResolvedValue([]),
      mem: vi.fn().mockResolvedValue(null),
      diskLayout: vi.fn().mockRejectedValue(new Error('Disk error')),
      fsSize: vi.fn().mockResolvedValue([]),
      networkInterfaces: vi.fn().mockRejectedValue(new Error('Net error')),
      cpuTemperature: vi.fn().mockRejectedValue(new Error('Temp error')),
    };

    const collector = createCollector(brokenSi);
    const info = await collector.getHardwareInfo(true);

    expect(info).toBeDefined();
    // Fields must be strictly null (not 0, not empty string)
    expect(info.os.osName).toBeNull();
    expect(info.os.build).toBeNull();
    expect(info.motherboard.manufacturer).toBeNull();
    expect(info.motherboard.model).toBeNull();
    expect(info.motherboard.biosVersion).toBeNull();
    expect(info.cpu.name).toBeNull();
    expect(info.cpu.cores).toBeNull();
    expect(info.cpu.threads).toBeNull();
    expect(info.cpu.baseSpeedMHz).toBeNull();
    expect(info.cpu.socket).toBeNull();
    expect(info.gpus).toEqual([]);
    expect(info.ram.totalBytes).toBeNull();
    expect(info.ram.slots).toEqual([]);
    expect(info.disks).toEqual([]);
    expect(info.network.localIp).toBeNull();
    expect(info.network.interface).toBeNull();
  });

  it('should cache hardware information and only re-query on forceRefresh', async () => {
    const mockSi = {
      osInfo: vi.fn().mockResolvedValue({ distro: 'Test OS', build: '1000' }),
      time: vi.fn().mockReturnValue({ uptime: 100 }),
      system: vi.fn().mockResolvedValue({}),
      baseboard: vi.fn().mockResolvedValue({}),
      bios: vi.fn().mockResolvedValue({}),
      cpu: vi.fn().mockResolvedValue({ brand: 'Test CPU' }),
      graphics: vi.fn().mockResolvedValue({ controllers: [] }),
      memLayout: vi.fn().mockResolvedValue([]),
      mem: vi.fn().mockResolvedValue({}),
      diskLayout: vi.fn().mockResolvedValue([]),
      fsSize: vi.fn().mockResolvedValue([]),
      networkInterfaces: vi.fn().mockResolvedValue([]),
      cpuTemperature: vi.fn().mockResolvedValue({}),
    };

    const collector = createCollector(mockSi);

    // First call
    const firstCall = await collector.getHardwareInfo(false);
    expect(mockSi.osInfo).toHaveBeenCalledTimes(1);

    // Second call without forceRefresh -> should use cache, no new SI calls
    const secondCall = await collector.getHardwareInfo(false);
    expect(mockSi.osInfo).toHaveBeenCalledTimes(1);
    expect(secondCall).toBe(firstCall);

    // Third call with forceRefresh = true -> should call again
    await collector.getHardwareInfo(true);
    expect(mockSi.osInfo).toHaveBeenCalledTimes(2);
  });
});
