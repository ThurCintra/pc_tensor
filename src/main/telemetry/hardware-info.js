const os = require('os');
const { version: APP_VERSION } = require('../../../package.json');

/**
 * Inventário estático do hardware (página Hardware). Consulta o systeminformation em paralelo e
 * troca qualquer falha por null: um sensor quebrado nunca derruba a página inteira.
 */
async function collectHardwareInfo(si, context = {}) {
  const call = (name, fallback) =>
    typeof si[name] === 'function' ? si[name]().catch(() => fallback) : Promise.resolve(fallback);

  const [osInfo, system, baseboard, bios, cpuInfo, memLayout, memData, graphics, diskLayout, fsData, netInterfaces] =
    await Promise.all([
      call('osInfo', {}),
      call('system', {}),
      call('baseboard', {}),
      call('bios', {}),
      call('cpu', {}),
      call('memLayout', []),
      call('mem', {}),
      call('graphics', {}),
      call('diskLayout', []),
      call('fsSize', []),
      call('networkInterfaces', []),
    ]);

  let timeInfo = null;
  try {
    timeInfo = typeof si.time === 'function' ? si.time() : null;
  } catch {
    timeInfo = null;
  }

  return buildHardwareInfo(
    {
      osInfo,
      system,
      baseboard,
      bios,
      cpuInfo,
      memLayout,
      memData,
      graphics,
      diskLayout,
      fsData,
      netInterfaces,
      timeInfo,
    },
    context,
  );
}

/** Texto útil ou null (descarta vazios e placeholders de BIOS como "Default string"). */
function text(value, ...placeholders) {
  if (typeof value !== 'string' || value.trim() === '') return null;
  return placeholders.some((p) => value.includes(p)) ? null : value;
}

function positive(value) {
  return typeof value === 'number' && value > 0 ? value : null;
}

/** systeminformation devolve GHz em algumas máquinas e MHz em outras. */
function toMHz(speed) {
  return positive(speed) ? Math.round(speed * (speed < 100 ? 1000 : 1)) : null;
}

function detectGpuVendor(g) {
  const v = (g?.vendor || '').toUpperCase();
  const m = (g?.model || g?.name || '').toUpperCase();
  if (v.includes('NVIDIA') || m.includes('NVIDIA') || m.includes('GEFORCE')) return 'NVIDIA';
  if (v.includes('AMD') || v.includes('ADVANCED MICRO') || m.includes('RADEON') || m.includes('AMD')) return 'AMD';
  if (v.includes('INTEL') || m.includes('INTEL') || m.includes('ARC') || m.includes('IRIS') || m.includes('UHD'))
    return 'Intel';
  return g?.vendor ? 'Outro' : null;
}

function mapGpus(graphics, cachedGfx) {
  const controllers = Array.isArray(graphics?.controllers) ? graphics.controllers : [];
  if (controllers.length > 0) {
    return controllers.map((g) => {
      const vramMB = positive(g?.vram) ?? positive(g?.memoryTotal);
      return {
        vendor: detectGpuVendor(g),
        name: g?.model || g?.name || null,
        vramTotalBytes: vramMB ? Math.round(vramMB * 1024 * 1024) : null,
        driverVersion: g?.driverVersion || null,
        bus: g?.bus || null,
      };
    });
  }
  if (cachedGfx?.gpuName) {
    return [
      {
        vendor: cachedGfx.gpuName.includes('NVIDIA') ? 'NVIDIA' : 'AMD',
        name: cachedGfx.gpuName,
        vramTotalBytes: null,
        driverVersion: null,
        bus: 'PCIe',
      },
    ];
  }
  return [];
}

function mapRamSlots(memLayout) {
  if (!Array.isArray(memLayout)) return [];
  return memLayout
    .filter((s) => s && (s.size || s.bank || s.partNum))
    .map((s, idx) => ({
      slot: s.bank || `Slot ${idx + 1}`,
      capacityBytes: positive(s.size),
      manufacturer: text(s.manufacturer, 'Unknown'),
      partNumber: text(s.partNum, 'Unknown'),
      speedMHz: positive(s.clockSpeed),
    }));
}

function mapDisks(fsData, diskLayout, cachedDisks = []) {
  const rawDisks = Array.isArray(fsData) && fsData.length > 0 ? fsData : cachedDisks;
  const layout = Array.isArray(diskLayout) ? diskLayout : [];

  return rawDisks.map((d, i) => {
    const phys =
      layout.find(
        (p) => (d?.fs && p?.device && d.fs.startsWith(p.device)) || (d?.mount && p?.name && d.mount.startsWith(p.name)),
      ) ||
      layout[i] ||
      layout[0] ||
      null;

    const typeRaw = (phys?.interfaceType || phys?.type || d?.type || '').toUpperCase();
    let type = 'SSD';
    if (typeRaw.includes('NVME') || (phys?.name || '').toUpperCase().includes('NVME')) type = 'NVMe';
    else if (typeRaw.includes('HDD') || typeRaw.includes('HARD') || phys?.type === 'HD') type = 'HDD';

    const totalBytes =
      positive(d?.size) ??
      (typeof d?.sizeGB === 'number' ? Math.round(d.sizeGB * 1024 * 1024 * 1024) : null) ??
      (typeof phys?.size === 'number' ? phys.size : null);

    return {
      id: d?.fs || d?.mount || `Disco ${i + 1}`,
      label: d?.mount || d?.fs || null,
      type,
      totalBytes,
      fs: d?.type || 'NTFS',
      fsType: d?.type || 'NTFS',
      model: phys?.name || phys?.vendor || 'Unidade de Disco',
    };
  });
}

function channelMode(slotCount) {
  if (slotCount >= 4) return 'Quad Channel';
  if (slotCount >= 2) return 'Dual Channel';
  if (slotCount === 1) return 'Single Channel';
  return null;
}

function buildHardwareInfo(raw, context = {}) {
  const {
    osInfo,
    system,
    baseboard,
    bios,
    cpuInfo,
    memLayout,
    memData,
    graphics,
    diskLayout,
    fsData,
    netInterfaces,
    timeInfo,
  } = raw;
  const { cachedGfx = null, cachedDisks = [], hasWorkingTempSensor = null, bridgeData = null } = context;

  // Interface de rede ativa, sem IP público (regra de privacidade)
  const nets = Array.isArray(netInterfaces) ? netInterfaces : [];
  const activeNet = nets.find((n) => n?.ip4 && !n.internal && n.ip4 !== '127.0.0.1') || nets[0] || null;

  const ramSlots = mapRamSlots(memLayout);
  const ramTotal =
    positive(memData?.total) ??
    (ramSlots.length > 0 ? ramSlots.reduce((acc, s) => acc + (s.capacityBytes || 0), 0) : null);

  const uptimeSeconds = positive(timeInfo?.uptime)
    ? Math.floor(timeInfo.uptime)
    : positive(os.uptime())
      ? Math.floor(os.uptime())
      : null;

  return {
    os: {
      osName: text(osInfo?.distro),
      build: text(osInfo?.build),
      arch: osInfo?.arch || null,
      hostname: text(osInfo?.hostname),
      agentVersion: APP_VERSION,
      uptimeSeconds,
    },
    motherboard: {
      manufacturer: text(baseboard?.manufacturer, 'Default') ?? text(system?.manufacturer),
      model: text(baseboard?.model, 'Default') ?? text(system?.model),
      biosVersion: text(bios?.version),
      biosDate: text(bios?.releaseDate),
    },
    cpu: {
      name: text(cpuInfo?.brand),
      cores: positive(cpuInfo?.physicalCores),
      threads: positive(cpuInfo?.cores),
      baseSpeedMHz: toMHz(cpuInfo?.speed),
      maxSpeedMHz: toMHz(cpuInfo?.speedMax),
      socket: text(cpuInfo?.socket, 'None'),
      l1CacheBytes: (cpuInfo?.cache?.l1d ? cpuInfo.cache.l1d + (cpuInfo.cache.l1i || 0) : null) || null,
      l2CacheBytes: positive(cpuInfo?.cache?.l2),
      l3CacheBytes: positive(cpuInfo?.cache?.l3),
    },
    gpus: mapGpus(graphics, cachedGfx),
    ram: {
      totalBytes: ramTotal,
      type: memLayout?.[0]?.type || (ramSlots.length > 0 ? 'DDR5' : null),
      speedMHz: ramSlots[0]?.speedMHz || positive(memLayout?.[0]?.clockSpeed),
      channelMode: channelMode(ramSlots.length),
      slots: ramSlots,
    },
    disks: mapDisks(fsData, diskLayout, cachedDisks),
    network: {
      interface: activeNet?.iface || null,
      localIp: activeNet?.ip4 && activeNet.ip4 !== '127.0.0.1' ? activeNet.ip4 : null,
      type: activeNet?.type === 'wireless' ? 'Wi-Fi' : activeNet?.type ? 'Ethernet' : null,
      macAddress: activeNet?.mac || null,
      linkSpeedMbps: positive(activeNet?.speed),
    },
    capabilities: {
      cpuTemperature: hasWorkingTempSensor === true || bridgeData?.cpu?.temp > 0,
      gpuTemperature: typeof cachedGfx?.gpuTemp === 'number' || bridgeData?.gpu?.temp > 0,
      gpuPower: bridgeData?.gpu?.powerWatts != null,
      perCoreLoad: true,
      networkMonitoring: true,
      processMonitoring: true,
      bottleneckDetection: true,
      thermalDegradationHistory: true,
    },
  };
}

module.exports = { collectHardwareInfo, buildHardwareInfo };
