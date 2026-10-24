const SENSORS = [
  { key: 'cpu', label: 'CPU', limitKey: 'cpuTempC', read: (m) => m?.temperatures?.cpuMain },
  { key: 'gpu', label: 'GPU', limitKey: 'gpuTempC', read: (m) => m?.temperatures?.gpu },
];

/**
 * ThermalAlertMonitor
 * Dispara um alerta quando CPU ou GPU cruzam o limite configurado.
 * Usa histerese (precisa esfriar `hysteresisC` graus abaixo do limite para rearmar)
 * e cooldown entre notificações para não inundar o usuário durante uma sessão longa.
 */
class ThermalAlertMonitor {
  constructor({ getSettings, notify = () => {}, now = () => Date.now(), hysteresisC = 5 } = {}) {
    this.getSettings = getSettings;
    this.notify = notify;
    this.now = now;
    this.hysteresisC = hysteresisC;
    this.state = new Map(SENSORS.map((s) => [s.key, { armed: true, lastFiredAt: -Infinity }]));
  }

  evaluate(metrics) {
    const alerts = this.getSettings().alerts;
    const thresholds = { cpuTempC: alerts.cpuTempC, gpuTempC: alerts.gpuTempC };
    const active = [];
    const fired = [];
    const now = this.now();
    const cooldownMs = alerts.cooldownMinutes * 60 * 1000;

    for (const sensor of SENSORS) {
      const temp = sensor.read(metrics);
      if (typeof temp !== 'number' || !Number.isFinite(temp)) continue;

      const limit = thresholds[sensor.limitKey];
      const st = this.state.get(sensor.key);

      if (temp >= limit) {
        const alert = { sensor: sensor.key, label: sensor.label, temp, limit };
        active.push(alert);
        if (alerts.enabled && st.armed && now - st.lastFiredAt >= cooldownMs) {
          st.armed = false;
          st.lastFiredAt = now;
          fired.push(alert);
          try {
            this.notify(alert);
          } catch (err) {
            console.error('[ThermalAlertMonitor] Falha ao notificar:', err);
          }
        }
      } else if (temp <= limit - this.hysteresisC) {
        st.armed = true;
      }
    }

    return { enabled: alerts.enabled, thresholds, active, fired };
  }
}

module.exports = { ThermalAlertMonitor };
