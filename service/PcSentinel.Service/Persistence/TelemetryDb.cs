using System.Globalization;
using Microsoft.Data.Sqlite;
using PcSentinel.Service.Analytics;
using PcSentinel.Service.Contracts;

namespace PcSentinel.Service.Persistence;

/// <summary>
/// Banco SQLite local (%APPDATA%\pc-sentinel\telemetry.db) com:
/// ThermalBaselines (degradação), EnergyLedger (kWh por dia), SiliconCurve (clock × tensão × potência)
/// e Settings (tarifa e carga base). Estatísticas são guardadas como (n, média, M2) e somadas com a
/// fórmula de Chan, então o banco nunca guarda amostras individuais.
/// </summary>
public sealed class TelemetryDb : IDisposable
{
    private readonly SqliteConnection _connection;
    private readonly object _lock = new();

    public TelemetryDb(string path)
    {
        if (path != ":memory:") Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        _connection = new SqliteConnection(new SqliteConnectionStringBuilder
        {
            DataSource = path,
            Mode = SqliteOpenMode.ReadWriteCreate,
            Pooling = false,
        }.ToString());
        _connection.Open();
        Execute("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;");
        Migrate();
    }

    private void Migrate()
    {
        Execute("""
            CREATE TABLE IF NOT EXISTS ThermalBaselines (
                Component    TEXT    NOT NULL,
                PowerBucketW INTEGER NOT NULL,
                WeekStart    TEXT    NOT NULL,
                DeltaN       INTEGER NOT NULL,
                DeltaMean    REAL    NOT NULL,
                DeltaM2      REAL    NOT NULL,
                FanN         INTEGER NOT NULL,
                FanMean      REAL    NOT NULL,
                FanM2        REAL    NOT NULL,
                PRIMARY KEY (Component, PowerBucketW, WeekStart)
            );
            CREATE TABLE IF NOT EXISTS EnergyLedger (
                Day TEXT PRIMARY KEY,
                Kwh REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS SiliconCurve (
                Component     TEXT    NOT NULL,
                ClockBucketMhz INTEGER NOT NULL,
                VcoreN        INTEGER NOT NULL,
                VcoreMean     REAL    NOT NULL,
                VcoreM2       REAL    NOT NULL,
                PowerN        INTEGER NOT NULL,
                PowerMean     REAL    NOT NULL,
                PowerM2       REAL    NOT NULL,
                PRIMARY KEY (Component, ClockBucketMhz)
            );
            CREATE TABLE IF NOT EXISTS Settings (
                Key   TEXT PRIMARY KEY,
                Value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS ProfileRules (
                Exe     TEXT PRIMARY KEY,
                Profile TEXT NOT NULL
            );
            """);
    }

    // Energia ---------------------------------------------------------------------------------------

    public void AddEnergy(DateOnly day, double kwh)
    {
        if (kwh <= 0) return;
        Execute(
            "INSERT INTO EnergyLedger (Day, Kwh) VALUES ($day, $kwh) ON CONFLICT(Day) DO UPDATE SET Kwh = Kwh + $kwh",
            ("$day", Iso(day)), ("$kwh", kwh));
    }

    public double GetMonthKwh(DateOnly anyDayInMonth)
    {
        var first = new DateOnly(anyDayInMonth.Year, anyDayInMonth.Month, 1);
        object? value = Scalar(
            "SELECT COALESCE(SUM(Kwh), 0) FROM EnergyLedger WHERE Day >= $from AND Day < $to",
            ("$from", Iso(first)), ("$to", Iso(first.AddMonths(1))));
        return Convert.ToDouble(value, CultureInfo.InvariantCulture);
    }

    // Linhas de base térmicas -----------------------------------------------------------------------

    public void MergeBaseline(string component, int bucket, DateOnly weekStart, BaselineBucket add)
    {
        lock (_lock)
        {
            using var tx = _connection.BeginTransaction();
            var (delta, fan) = ReadBaselineRow(component, bucket, weekStart, tx);
            delta = RunningStats.Merge(delta, add.DeltaC);
            fan = RunningStats.Merge(fan, add.FanPct);
            Execute("""
                INSERT INTO ThermalBaselines VALUES ($c, $b, $w, $dn, $dm, $d2, $fn, $fm, $f2)
                ON CONFLICT(Component, PowerBucketW, WeekStart) DO UPDATE SET
                    DeltaN = $dn, DeltaMean = $dm, DeltaM2 = $d2, FanN = $fn, FanMean = $fm, FanM2 = $f2
                """, tx,
                ("$c", component), ("$b", bucket), ("$w", Iso(weekStart)),
                ("$dn", delta.Count), ("$dm", delta.Mean), ("$d2", delta.M2),
                ("$fn", fan.Count), ("$fm", fan.Mean), ("$f2", fan.M2));
            tx.Commit();
        }
    }

    private (RunningStats Delta, RunningStats Fan) ReadBaselineRow(string component, int bucket, DateOnly week, SqliteTransaction tx)
    {
        using var cmd = Command(
            "SELECT DeltaN, DeltaMean, DeltaM2, FanN, FanMean, FanM2 FROM ThermalBaselines WHERE Component = $c AND PowerBucketW = $b AND WeekStart = $w",
            tx, ("$c", component), ("$b", bucket), ("$w", Iso(week)));
        using var reader = cmd.ExecuteReader();
        if (!reader.Read()) return (default, default);
        return (
            new RunningStats(reader.GetInt64(0), reader.GetDouble(1), reader.GetDouble(2)),
            new RunningStats(reader.GetInt64(3), reader.GetDouble(4), reader.GetDouble(5)));
    }

    /// <summary>Linha de base de uma faixa somando todas as semanas iniciadas até <paramref name="cutoff"/>.</summary>
    public BaselineStats? GetBaseline(string component, int bucket, DateOnly cutoff)
    {
        lock (_lock)
        {
            using var cmd = Command(
                "SELECT DeltaN, DeltaMean, DeltaM2, FanN, FanMean, FanM2, WeekStart FROM ThermalBaselines WHERE Component = $c AND PowerBucketW = $b AND WeekStart <= $cut",
                null, ("$c", component), ("$b", bucket), ("$cut", Iso(cutoff)));
            using var reader = cmd.ExecuteReader();

            RunningStats delta = default, fan = default;
            DateOnly? oldest = null;
            while (reader.Read())
            {
                delta = RunningStats.Merge(delta, new RunningStats(reader.GetInt64(0), reader.GetDouble(1), reader.GetDouble(2)));
                fan = RunningStats.Merge(fan, new RunningStats(reader.GetInt64(3), reader.GetDouble(4), reader.GetDouble(5)));
                var week = DateOnly.ParseExact(reader.GetString(6), "yyyy-MM-dd", CultureInfo.InvariantCulture);
                if (oldest is null || week < oldest) oldest = week;
            }
            return oldest is DateOnly o ? new BaselineStats(delta, fan, o) : null;
        }
    }

    // Curva de silício ------------------------------------------------------------------------------

    public void MergeSilicon(string component, int clockBucket, SiliconBucket add)
    {
        lock (_lock)
        {
            using var tx = _connection.BeginTransaction();
            RunningStats vcore = default, power = default;
            using (var read = Command(
                "SELECT VcoreN, VcoreMean, VcoreM2, PowerN, PowerMean, PowerM2 FROM SiliconCurve WHERE Component = $c AND ClockBucketMhz = $b",
                tx, ("$c", component), ("$b", clockBucket)))
            using (var reader = read.ExecuteReader())
            {
                if (reader.Read())
                {
                    vcore = new RunningStats(reader.GetInt64(0), reader.GetDouble(1), reader.GetDouble(2));
                    power = new RunningStats(reader.GetInt64(3), reader.GetDouble(4), reader.GetDouble(5));
                }
            }

            vcore = RunningStats.Merge(vcore, add.Vcore);
            power = RunningStats.Merge(power, add.Power);
            Execute("""
                INSERT INTO SiliconCurve VALUES ($c, $b, $vn, $vm, $v2, $pn, $pm, $p2)
                ON CONFLICT(Component, ClockBucketMhz) DO UPDATE SET
                    VcoreN = $vn, VcoreMean = $vm, VcoreM2 = $v2, PowerN = $pn, PowerMean = $pm, PowerM2 = $p2
                """, tx,
                ("$c", component), ("$b", clockBucket),
                ("$vn", vcore.Count), ("$vm", vcore.Mean), ("$v2", vcore.M2),
                ("$pn", power.Count), ("$pm", power.Mean), ("$p2", power.M2));
            tx.Commit();
        }
    }

    public IReadOnlyList<SiliconCurvePoint> GetSiliconCurve(string component)
    {
        lock (_lock)
        {
            using var cmd = Command(
                "SELECT ClockBucketMhz, VcoreMean, PowerMean, VcoreN FROM SiliconCurve WHERE Component = $c ORDER BY ClockBucketMhz",
                null, ("$c", component));
            using var reader = cmd.ExecuteReader();
            var points = new List<SiliconCurvePoint>();
            while (reader.Read())
            {
                points.Add(new SiliconCurvePoint(
                    reader.GetInt32(0),
                    Math.Round(reader.GetDouble(1), 4),
                    Math.Round(reader.GetDouble(2), 1),
                    reader.GetInt64(3)));
            }
            return points;
        }
    }

    // Configurações ---------------------------------------------------------------------------------

    public double GetSetting(string key, double fallback)
    {
        object? value = Scalar("SELECT Value FROM Settings WHERE Key = $k", ("$k", key));
        return value is string s && double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out double v) ? v : fallback;
    }

    public void SetSetting(string key, double value) =>
        Execute(
            "INSERT INTO Settings (Key, Value) VALUES ($k, $v) ON CONFLICT(Key) DO UPDATE SET Value = $v",
            ("$k", key), ("$v", value.ToString(CultureInfo.InvariantCulture)));

    // Regras de perfil do usuário --------------------------------------------------------------------

    /// <summary>Regras "executável → perfil" definidas pelo usuário (nome do executável já normalizado).</summary>
    public IReadOnlyDictionary<string, string> GetProfileRules()
    {
        var rules = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        lock (_lock)
        {
            using var cmd = Command("SELECT Exe, Profile FROM ProfileRules", null);
            using var reader = cmd.ExecuteReader();
            while (reader.Read()) rules[reader.GetString(0)] = reader.GetString(1);
        }
        return rules;
    }

    public void SetProfileRule(string exe, string profile) =>
        Execute(
            "INSERT INTO ProfileRules (Exe, Profile) VALUES ($e, $p) ON CONFLICT(Exe) DO UPDATE SET Profile = $p",
            ("$e", exe), ("$p", profile));

    public bool RemoveProfileRule(string exe)
    {
        lock (_lock)
        {
            using var cmd = Command("DELETE FROM ProfileRules WHERE Exe = $e", null, ("$e", exe));
            return cmd.ExecuteNonQuery() > 0;
        }
    }

    // Infraestrutura --------------------------------------------------------------------------------

    private static string Iso(DateOnly day) => day.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

    private SqliteCommand Command(string sql, SqliteTransaction? tx, params (string Name, object Value)[] parameters)
    {
        var cmd = _connection.CreateCommand();
        cmd.CommandText = sql;
        cmd.Transaction = tx;
        foreach (var (name, value) in parameters) cmd.Parameters.AddWithValue(name, value);
        return cmd;
    }

    private void Execute(string sql, params (string Name, object Value)[] parameters) => Execute(sql, null, parameters);

    private void Execute(string sql, SqliteTransaction? tx, params (string Name, object Value)[] parameters)
    {
        lock (_lock)
        {
            using var cmd = Command(sql, tx, parameters);
            cmd.ExecuteNonQuery();
        }
    }

    private object? Scalar(string sql, params (string Name, object Value)[] parameters)
    {
        lock (_lock)
        {
            using var cmd = Command(sql, null, parameters);
            return cmd.ExecuteScalar();
        }
    }

    public void Dispose() => _connection.Dispose();
}
