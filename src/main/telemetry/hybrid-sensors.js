const WebSocket = require('ws');
const { SensorBridge, STALE_AFTER_MS } = require('./sensor-bridge');

const RECONNECT_DELAYS_MS = [1000, 2000, 5000, 10000];
/** Na abertura do app, quanto esperar o serviço nativo antes de a ponte assumir os sensores. */
const STARTUP_GRACE_MS = 10_000;
/** Serviço precisa ficar saudável por esse tempo antes de a ponte largar os sensores (evita vaivém). */
const HEALTHY_FOR_MS = 3000;

const num = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/**
 * Converte o quadro do contrato v2 (serviço nativo) para o formato da ponte (pc-sensor-bridge --stream),
 * que é o que o SystemCollector entende. Leitura, gravação e atividade do disco vêm do serviço quando ele roda
 * como administrador (o LibreHardwareMonitor só enxerga os discos assim); sem isso, a ponte mede pelos contadores.
 */
function frameToBridgeData(frame, isElevated) {
  const disks = Array.isArray(frame.storage) ? frame.storage : [];
  const storage = disks[0] ?? null;
  const hasDiskIo = disks.some((d) => num(d.readBps) !== null || num(d.writeBps) !== null);
  const sumOf = (key) => disks.reduce((sum, d) => sum + (num(d[key]) ?? 0), 0);
  const fan = (frame.fans || []).find((f) => num(f.rpm) > 0);
  const cpuTemp = num(frame.cpu?.tempC);
  const gpuTemp = num(frame.gpu?.tempC);
  const boardTemp = num(frame.board?.systemTempC);
  const storageTemp = num(storage?.tempC);
  return {
    success: true,
    source: 'service',
    isAdmin: Boolean(isElevated),
    cpu: {
      name: frame.cpu?.name || 'Processador',
      temp: cpuTemp,
      load: num(frame.cpu?.loadPct),
      powerWatts: num(frame.cpu?.powerW),
      requiresElevation: cpuTemp === null && !isElevated,
    },
    gpu: {
      name: frame.gpu?.name || 'GPU',
      temp: gpuTemp,
      memoryTemp: num(frame.gpu?.memoryTempC),
      hotspotTemp: num(frame.gpu?.hotspotC),
      fanRpm: num(frame.gpu?.fanRpm),
      load: num(frame.gpu?.loadPct),
      powerWatts: num(frame.gpu?.powerW),
      vramUsedMB: num(frame.gpu?.vramUsedMb),
      vramTotalMB: num(frame.gpu?.vramTotalMb),
    },
    motherboard: {
      name: frame.board?.name || 'Placa-mãe',
      temp: boardTemp,
      requiresElevation: boardTemp === null && !isElevated,
    },
    storage: {
      name: storage?.name || 'Armazenamento',
      temp: storageTemp,
      load: num(storage?.activityPct),
      requiresElevation: storageTemp === null && !isElevated,
    },
    diskIo: hasDiskIo ? { readBytesSec: sumOf('readBps'), writeBytesSec: sumOf('writeBps') } : null,
    fanRpm: num(fan?.rpm) ?? num(frame.gpu?.fanRpm),
    realSensors: {
      cpu: cpuTemp !== null,
      gpu: gpuTemp !== null,
      motherboard: boardTemp !== null,
      storage: storageTemp !== null,
    },
  };
}

/**
 * ServiceSensorSource
 * Cliente do serviço nativo (ws://127.0.0.1:3891/ws) no processo principal: guarda o último quadro de
 * telemetria e o hello (se roda como administrador). Reconecta sozinho se o serviço reiniciar.
 */
class ServiceSensorSource {
  constructor({ getEndpoint, WebSocketImpl = WebSocket, now = () => Date.now() } = {}) {
    this.getEndpoint = getEndpoint;
    this.WebSocketImpl = WebSocketImpl;
    this.now = now;
    this.socket = null;
    this.frame = null;
    this.frameAt = 0;
    this.isElevated = false;
    this.attempt = 0;
    this.timer = null;
    this.stopped = true;
  }

  /** Há serviço para conectar (executável encontrado)? Sem ele, a ponte assume desde o início. */
  get available() {
    return Boolean(this.getEndpoint?.());
  }

  start() {
    if (!this.stopped) return;
    this.stopped = false;
    this.connect();
  }

  connect() {
    if (this.stopped) return;
    const endpoint = this.getEndpoint?.();
    if (!endpoint) return this.scheduleReconnect();

    let socket;
    try {
      socket = new this.WebSocketImpl(`${endpoint.url}?token=${encodeURIComponent(endpoint.token)}`);
    } catch {
      return this.scheduleReconnect();
    }
    this.socket = socket;
    socket.on('message', (raw) => this.handleMessage(raw));
    socket.on('open', () => {
      this.attempt = 0;
    });
    socket.on('error', () => {}); // o 'close' que vem em seguida agenda a reconexão
    socket.on('close', () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.scheduleReconnect();
    });
  }

  handleMessage(raw) {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (msg?.type === 'hello') this.isElevated = Boolean(msg.data?.isElevated);
    else if (msg?.type === 'telemetry' && msg.data) {
      this.frame = msg.data;
      this.frameAt = this.now();
    }
  }

  scheduleReconnect() {
    if (this.stopped) return;
    const delay = RECONNECT_DELAYS_MS[Math.min(this.attempt, RECONNECT_DELAYS_MS.length - 1)];
    this.attempt++;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.connect(), delay);
  }

  /** Último quadro no formato da ponte, ou null se o serviço não mandou nada nos últimos STALE_AFTER_MS. */
  getFreshData() {
    if (!this.frame || this.now() - this.frameAt >= STALE_AFTER_MS) return null;
    return frameToBridgeData(this.frame, this.isElevated);
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    const socket = this.socket;
    this.socket = null;
    try {
      socket?.close();
    } catch {
      // já fechado
    }
  }
}

/**
 * HybridSensorSource
 * Ocupa o lugar da SensorBridge no SystemCollector (mesma interface: start, stop, getFreshData, latest) e
 * evita que o serviço nativo (.NET 10) e a ponte (.NET 4) leiam o LibreHardwareMonitor ao mesmo tempo, o que
 * disputa o barramento SMBus/Super I/O:
 *   - serviço saudável e com I/O de disco: a ponte fica desligada ('off'), ~40 MB a menos de memória;
 *   - serviço saudável sem I/O de disco (rodando sem administrador): a ponte roda só com os contadores de
 *     I/O de disco (--no-hardware), sem abrir o LibreHardwareMonitor;
 *   - serviço ausente ou parado: a ponte volta sozinha ao modo completo e assume os sensores.
 */
class HybridSensorSource {
  constructor({ service, bridge = new SensorBridge(), now = () => Date.now() } = {}) {
    this.service = service;
    this.bridge = bridge;
    this.now = now;
    this.graceUntil = 0;
    this.healthySince = null;
  }

  /** 'service' quando os sensores vêm do serviço nativo; 'bridge' quando vêm da ponte. */
  get source() {
    return this.bridge.mode === 'full' ? 'bridge' : 'service';
  }

  start() {
    const serviceAvailable = this.service?.available;
    if (serviceAvailable) {
      // Dá um tempo para o serviço subir antes de a ponte abrir o LibreHardwareMonitor
      this.graceUntil = this.now() + STARTUP_GRACE_MS;
      this.bridge.mode = 'off';
      this.service.start();
    } else {
      this.bridge.mode = 'full';
    }
    this.bridge.start();
  }

  /** Decide o modo da ponte a cada leitura do coletor (a cada ~1 s). */
  updateMode(serviceData) {
    const now = this.now();
    if (serviceData) {
      this.healthySince ??= now;
      const stable = now - this.healthySince >= HEALTHY_FOR_MS || this.bridge.mode !== 'full';
      if (stable) this.bridge.setMode(serviceData.diskIo ? 'off' : 'counters');
    } else {
      this.healthySince = null;
      // Serviço sumiu (ou não subiu no tempo de tolerância): a ponte assume os sensores na hora
      if (now >= this.graceUntil) this.bridge.setMode('full');
    }
  }

  getFreshData() {
    const serviceData = this.service?.getFreshData() ?? null;
    this.updateMode(serviceData);
    const bridgeData = this.bridge.getFreshData();
    if (!serviceData || this.bridge.mode === 'full') return bridgeData;
    if (serviceData.diskIo) return serviceData;

    // Sensores do serviço + I/O de disco e carga do SSD dos contadores da ponte
    return {
      ...serviceData,
      diskIo: bridgeData?.diskIo ?? null,
      storage: { ...serviceData.storage, load: serviceData.storage.load ?? num(bridgeData?.storage?.load) },
    };
  }

  /** Usado nas informações de hardware: a leitura mais completa disponível. */
  get latest() {
    return this.getFreshData() ?? this.bridge.latest;
  }

  stop() {
    this.service?.stop();
    this.bridge.stop();
  }
}

module.exports = { HybridSensorSource, ServiceSensorSource, frameToBridgeData, STARTUP_GRACE_MS, HEALTHY_FOR_MS };
