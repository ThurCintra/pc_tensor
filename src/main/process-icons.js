/**
 * Ícones dos programas da tela de Processos, extraídos do próprio .exe pelo Windows (app.getFileIcon).
 * A tela pede pelo PID; o caminho vem da lista atual do ProcessMonitor, nunca da tela, então só é possível
 * ler ícones dos processos que estão sendo mostrados. Guarda por caminho para não repetir a extração.
 */
const MAX_ENTRIES = 100;

class ProcessIconCache {
  /**
   * @param {object} deps
   * @param {(pid: number) => string|null} deps.getExecutablePath
   * @param {(path: string) => Promise<{ isEmpty(): boolean, toDataURL(): string }>} deps.getFileIcon
   */
  constructor({ getExecutablePath, getFileIcon }) {
    this.getExecutablePath = getExecutablePath;
    this.getFileIcon = getFileIcon;
    this.cache = new Map();
  }

  /** Data URL PNG do ícone, ou null (processo do sistema, fora da lista ou sem ícone). */
  async get(pid) {
    if (!Number.isInteger(pid)) return null;
    const exePath = this.getExecutablePath(pid);
    if (!exePath) return null;

    const key = exePath.toLowerCase();
    if (!this.cache.has(key)) {
      this.cache.set(key, this.extract(exePath));
      if (this.cache.size > MAX_ENTRIES) this.cache.delete(this.cache.keys().next().value);
    }
    return this.cache.get(key);
  }

  async extract(exePath) {
    try {
      const image = await this.getFileIcon(exePath);
      return image && !image.isEmpty() ? image.toDataURL() : null;
    } catch {
      return null;
    }
  }
}

module.exports = { ProcessIconCache };
