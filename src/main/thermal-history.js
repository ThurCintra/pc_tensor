const fs = require('fs');
const path = require('path');

/**
 * ThermalHistoryStore
 * Persistência ultraleve de agregados diários e detecção de degradação térmica ao longo do tempo.
 * Utiliza better-sqlite3 com fallback transparente para assegurar 100% de estabilidade.
 */
class ThermalHistoryStore {
  constructor(dbPath = null) {
    this.dbPath = dbPath;
    this.filePath = this.resolveFilePath(dbPath);
    this.db = null;
    this.memoryFallback = new Map();
    this.sessionFallback = [];
    this.isSqlite = false;

    this.initDatabase();
    this.loadFromFile();
  }

  resolveFilePath(customPath) {
    if (customPath === ':memory:') return ':memory:';
    if (typeof customPath === 'string' && customPath.length > 0) {
      return customPath.endsWith('.json') ? customPath : customPath.replace(/\.db$/i, '.json');
    }
    return path.join(process.cwd(), 'thermal_history.json');
  }

  initDatabase() {
    try {
      const Database = require('better-sqlite3');
      const resolvedPath = this.dbPath || path.join(process.cwd(), 'thermal_history.db');

      // Garante diretório pai
      const dir = path.dirname(resolvedPath);
      if (dir && !fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      this.db = new Database(resolvedPath);
      this.db.pragma('journal_mode = WAL');

      // Tabela de agregados térmicos diários
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS daily_thermal_aggregates (
          date TEXT PRIMARY KEY,
          idle_temp_avg REAL NOT NULL,
          load_temp_max REAL NOT NULL,
          samples_count INTEGER NOT NULL DEFAULT 1,
          updated_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS session_reports (
          id TEXT PRIMARY KEY,
          timestamp INTEGER NOT NULL,
          duration_seconds INTEGER NOT NULL,
          cpu_peak_temp REAL,
          cpu_avg_temp REAL,
          gpu_peak_temp REAL,
          gpu_avg_temp REAL,
          ram_peak_gb REAL,
          throttling_events INTEGER,
          dominant_bottleneck TEXT,
          report_json TEXT
        );
      `);

      this.isSqlite = true;
    } catch {
      this.isSqlite = false;
      this.db = null;
    }
  }

  loadFromFile() {
    if (this.filePath === ':memory:' || this.isSqlite) return;
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed?.dailyAggregates)) {
          for (const item of parsed.dailyAggregates) {
            if (item && item.date) {
              this.memoryFallback.set(item.date, item);
            }
          }
        }
        if (Array.isArray(parsed?.sessionReports)) {
          this.sessionFallback = parsed.sessionReports;
        }
      }
    } catch {}
  }

  saveToFile() {
    if (this.filePath === ':memory:' || this.isSqlite) return;
    try {
      const dir = path.dirname(this.filePath);
      if (dir && !fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const data = {
        dailyAggregates: Array.from(this.memoryFallback.values()),
        sessionReports: this.sessionFallback,
        updatedAt: Date.now(),
      };
      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch {}
  }

  getTodayDateString(d = new Date()) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  recordDailyAggregate(temp, isIdle, dateStr = null) {
    if (typeof temp !== 'number' || isNaN(temp) || temp <= 0) return;
    const date = dateStr || this.getTodayDateString();
    const now = Date.now();

    if (this.isSqlite && this.db) {
      try {
        const row = this.db.prepare('SELECT * FROM daily_thermal_aggregates WHERE date = ?').get(date);
        if (!row) {
          this.db.prepare(`
            INSERT INTO daily_thermal_aggregates (date, idle_temp_avg, load_temp_max, samples_count, updated_at)
            VALUES (?, ?, ?, ?, ?)
          `).run(date, isIdle ? temp : temp - 5, isIdle ? temp : temp, 1, now);
        } else {
          let newIdleAvg = row.idle_temp_avg;
          let newLoadMax = row.load_temp_max;

          if (isIdle) {
            newIdleAvg = Number((row.idle_temp_avg * 0.95 + temp * 0.05).toFixed(1));
          } else {
            if (temp > row.load_temp_max) newLoadMax = Number(temp.toFixed(1));
          }

          this.db.prepare(`
            UPDATE daily_thermal_aggregates
            SET idle_temp_avg = ?, load_temp_max = ?, samples_count = samples_count + 1, updated_at = ?
            WHERE date = ?
          `).run(newIdleAvg, newLoadMax, now, date);
        }
        return;
      } catch {
        // Fallback para memória em caso de exceção de I/O
      }
    }

    // Fallback em memória
    const existing = this.memoryFallback.get(date);
    if (!existing) {
      this.memoryFallback.set(date, {
        date,
        idle_temp_avg: isIdle ? temp : temp - 5,
        load_temp_max: temp,
        samples_count: 1,
        updated_at: now,
      });
    } else {
      let newIdleAvg = existing.idle_temp_avg;
      let newLoadMax = existing.load_temp_max;
      if (isIdle) {
        newIdleAvg = Number((existing.idle_temp_avg * 0.95 + temp * 0.05).toFixed(1));
      } else if (temp > existing.load_temp_max) {
        newLoadMax = Number(temp.toFixed(1));
      }
      this.memoryFallback.set(date, {
        ...existing,
        idle_temp_avg: newIdleAvg,
        load_temp_max: newLoadMax,
        samples_count: existing.samples_count + 1,
        updated_at: now,
      });
    }

    this.saveToFile();
  }

  saveSessionReport(report) {
    if (!report || !report.sessionId) return;
    const now = Date.now();

    if (this.isSqlite && this.db) {
      try {
        this.db.prepare(`
          INSERT OR REPLACE INTO session_reports 
          (id, timestamp, duration_seconds, cpu_peak_temp, cpu_avg_temp, gpu_peak_temp, gpu_avg_temp, ram_peak_gb, throttling_events, dominant_bottleneck, report_json)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          report.sessionId,
          report.timestamp || now,
          report.durationSeconds || 0,
          report.cpu?.peakTemp || 0,
          report.cpu?.avgTemp || 0,
          report.gpu?.peakTemp || 0,
          report.gpu?.avgTemp || 0,
          report.ram?.peakUsedGB || 0,
          report.throttlingEventsCount || 0,
          report.bottleneckDominant || 'BALANCED',
          JSON.stringify(report)
        );
        return;
      } catch {}
    }

    this.sessionFallback.push(report);
    this.saveToFile();
  }

  getAllDailyAggregates() {
    if (this.isSqlite && this.db) {
      try {
        return this.db.prepare('SELECT * FROM daily_thermal_aggregates ORDER BY date ASC').all();
      } catch {}
    }
    return Array.from(this.memoryFallback.values()).sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * Detecção de Degradação Térmica:
   * Compara a média em repouso dos últimos 3 dias com a média de 14 a 21 dias atrás.
   * Se delta > 5.0 °C, emite alerta preventivo (limpeza / troca de pasta térmica).
   */
  checkThermalDegradation(referenceDate = new Date()) {
    const all = this.getAllDailyAggregates();
    if (all.length < 5) {
      return {
        hasDegradation: false,
        isCalibrating: true,
        message: 'Base de dados térmica em calibração (necessário histórico de pelo menos 14 dias).',
      };
    }

    const refTime = referenceDate.getTime();
    const dayMs = 24 * 60 * 60 * 1000;

    // Janela recente: últimos 3 dias
    const recentRows = all.filter((row) => {
      const rowTime = new Date(row.date).getTime();
      const diffDays = (refTime - rowTime) / dayMs;
      return diffDays >= 0 && diffDays <= 3;
    });

    // Janela baseline: entre 14 e 21 dias atrás
    const baselineRows = all.filter((row) => {
      const rowTime = new Date(row.date).getTime();
      const diffDays = (refTime - rowTime) / dayMs;
      return diffDays >= 14 && diffDays <= 21;
    });

    if (recentRows.length === 0 || baselineRows.length === 0) {
      return {
        hasDegradation: false,
        isCalibrating: true,
        message: 'Aguardando intervalo de histórico histórico (14 a 21 dias).',
      };
    }

    const currentIdleAvg = recentRows.reduce((a, b) => a + b.idle_temp_avg, 0) / recentRows.length;
    const baselineIdleAvg = baselineRows.reduce((a, b) => a + b.idle_temp_avg, 0) / baselineRows.length;
    const delta = currentIdleAvg - baselineIdleAvg;

    const hasDegradation = delta > 5.0;

    return {
      hasDegradation,
      isCalibrating: false,
      deltaTemp: Number(delta.toFixed(1)),
      currentIdleAvg: Number(currentIdleAvg.toFixed(1)),
      baselineIdleAvg: Number(baselineIdleAvg.toFixed(1)),
      alert: hasDegradation
        ? `Alerta de Degradação Térmica: Temperatura em repouso subiu ${delta.toFixed(1)}°C em relação à média de 14-21 dias atrás. Recomendada limpeza de poeira nas aletas do cooler ou renovação da pasta térmica.`
        : null,
    };
  }

  close() {
    if (this.db) {
      try {
        this.db.close();
      } catch {}
      this.db = null;
    }
  }
}

module.exports = { ThermalHistoryStore };
