const http = require('http');

const LHM_URL = 'http://127.0.0.1:8085/data.json';
const POLL_INTERVAL_MS = 2500;
const REQUEST_TIMEOUT_MS = 350;

/**
 * Lê o servidor web do LibreHardwareMonitor (interface gráfica, porta 8085), quando o usuário o
 * mantém aberto. É uma fonte alternativa à ponte de sensores, consultada no máximo a cada 2,5 s.
 */
class LhmClient {
  constructor({ url = LHM_URL, now = () => Date.now() } = {}) {
    this.url = url;
    this.now = now;
    this.latest = null;
    this.lastCheck = 0;
  }

  async poll() {
    const now = this.now();
    if (now - this.lastCheck < POLL_INTERVAL_MS) return this.latest;
    this.lastCheck = now;

    return new Promise((resolve) => {
      const req = http.get(this.url, { timeout: REQUEST_TIMEOUT_MS }, (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          resolve(this.latest);
          return;
        }
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          try {
            const parsed = parseLhmTree(JSON.parse(body));
            if (parsed) this.latest = parsed;
          } catch {
            // resposta inválida: mantém a última leitura
          }
          resolve(this.latest);
        });
      });

      req.on('error', () => resolve(this.latest));
      req.on('timeout', () => {
        req.destroy();
        resolve(this.latest);
      });
    });
  }
}

/** Extrai temperatura de CPU/GPU e RPM da primeira ventoinha da árvore de sensores do LHM. */
function parseLhmTree(root) {
  if (!root || !root.children) return null;
  let cpuTemp = null;
  let gpuTemp = null;
  let fanRpm = null;

  const walk = (node) => {
    if (!node) return;
    const text = (node.text || '').toLowerCase();
    const value = typeof node.Value === 'string' ? node.Value : '';

    if (value.includes('°C')) {
      const val = parseFloat(value.replace(',', '.'));
      if (!isNaN(val) && val > 0) {
        if (
          text.includes('tctl') ||
          text.includes('package') ||
          text.includes('cpu core') ||
          text.includes('cpu total')
        ) {
          if (cpuTemp === null || text.includes('tctl')) cpuTemp = val;
        } else if (
          text.includes('gpu core') ||
          (text.includes('gpu') && text.includes('temperature')) ||
          text.includes('gpu vr soc') ||
          text.includes('gpu soc')
        ) {
          if (gpuTemp === null || text.includes('gpu core')) gpuTemp = val;
        }
      }
    }

    if (value.includes('RPM')) {
      const val = parseFloat(value.replace(',', '.'));
      if (!isNaN(val) && val > 0 && fanRpm === null) fanRpm = val;
    }

    if (Array.isArray(node.children)) node.children.forEach(walk);
  };

  walk(root);
  return { cpuTemp, gpuTemp, fanRpm };
}

module.exports = { LhmClient, parseLhmTree };
