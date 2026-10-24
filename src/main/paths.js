const path = require('path');

/** Raiz do projeto (em produção, a raiz do app.asar). */
const ROOT = path.join(__dirname, '..', '..');

const paths = {
  icon: path.join(ROOT, 'assets', 'icon.png'),
  preload: path.join(ROOT, 'src', 'preload', 'index.js'),
  rendererIndex: path.join(ROOT, 'dist', 'index.html'),
  devServerUrl: 'http://localhost:5173',
};

/**
 * Locais possíveis do pc-sensor-bridge.exe: a pasta do projeto (dev) e os recursos extraídos
 * pelo instalador (process.resourcesPath, fora do app.asar).
 */
function sensorBridgeCandidates() {
  const candidates = [path.join(ROOT, 'resources', 'sensor-bridge', 'pc-sensor-bridge.exe')];
  if (process.resourcesPath) {
    candidates.push(path.join(process.resourcesPath, 'sensor-bridge', 'pc-sensor-bridge.exe'));
  }
  return candidates;
}

module.exports = { ROOT, paths, sensorBridgeCandidates };
