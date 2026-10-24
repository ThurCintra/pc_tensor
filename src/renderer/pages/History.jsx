import React, { useMemo, useState } from 'react';
import { Thermometer, Activity, Timer } from 'lucide-react';
import { PageHeader, Card, Segmented, Rows, Row, EmptyState } from '../components/ui';
import { LineChart } from '../components/LineChart';
import { summarize, isNum, DASH } from '../lib/format';

const RANGES = [
  { value: 2, label: '2 min' },
  { value: 5, label: '5 min' },
  { value: 15, label: '15 min' },
];

function statText(stats, unit) {
  if (!isNum(stats.avg)) return DASH;
  return `${stats.min.toFixed(0)} / ${stats.avg.toFixed(0)} / ${stats.max.toFixed(0)} ${unit}`;
}

export function History({ history, metrics, lastReport }) {
  const [minutes, setMinutes] = useState(5);
  const thresholds = metrics?.alerts?.thresholds;

  const samples = useMemo(() => {
    const since = Date.now() - minutes * 60 * 1000;
    return history.filter((s) => s.t >= since);
  }, [history, minutes]);

  const stats = useMemo(
    () => ({
      cpuTemp: summarize(samples.map((s) => s.cpuTemp)),
      gpuTemp: summarize(samples.map((s) => s.gpuTemp)),
      cpuLoad: summarize(samples.map((s) => s.cpuLoad)),
      ram: summarize(samples.map((s) => s.ramPercent)),
    }),
    [samples]
  );

  const hasTemps = samples.some((s) => isNum(s.cpuTemp) || isNum(s.gpuTemp));
  const report = lastReport || metrics?.sessionBenchmark?.lastReport;

  return (
    <div className="page">
      <PageHeader title="Histórico" subtitle="Leituras desta sessão, guardadas enquanto o app está aberto">
        <Segmented options={RANGES} value={minutes} onChange={setMinutes} label="Intervalo" />
      </PageHeader>

      <Card title="Temperatura" icon={Thermometer}>
        {hasTemps ? (
          <LineChart
            samples={samples}
            min={20}
            max={105}
            unit=" °C"
            threshold={thresholds?.cpuTempC}
            series={[
              { key: 'cpuTemp', label: 'CPU', color: 'var(--chart-1)' },
              { key: 'gpuTemp', label: 'GPU', color: 'var(--chart-2)' },
            ]}
          />
        ) : (
          <EmptyState>Nenhuma leitura de temperatura neste intervalo.</EmptyState>
        )}
      </Card>

      <Card title="Uso" icon={Activity}>
        {samples.length > 1 ? (
          <LineChart
            samples={samples}
            unit="%"
            series={[
              { key: 'cpuLoad', label: 'Processador', color: 'var(--chart-1)' },
              { key: 'ramPercent', label: 'Memória', color: 'var(--chart-3)' },
            ]}
          />
        ) : (
          <EmptyState>Coletando amostras…</EmptyState>
        )}
      </Card>

      <div className="grid-2">
        <Card title="Resumo do intervalo" action={<span className="faint">mín / média / máx</span>}>
          <Rows>
            <Row label="Temperatura da CPU">{statText(stats.cpuTemp, '°C')}</Row>
            <Row label="Temperatura da GPU">{statText(stats.gpuTemp, '°C')}</Row>
            <Row label="Uso do processador">{statText(stats.cpuLoad, '%')}</Row>
            <Row label="Uso de memória">{statText(stats.ram, '%')}</Row>
            <Row label="Amostras">{samples.length}</Row>
          </Rows>
        </Card>

        <Card title="Última sessão de carga" icon={Timer}>
          {report ? (
            <Rows>
              <Row label="Duração">{report.durationFormatted}</Row>
              <Row label="CPU (pico / média)">
                {isNum(report.cpu?.peakTemp) ? `${report.cpu.peakTemp} / ${report.cpu.avgTemp} °C` : DASH}
              </Row>
              <Row label="GPU (pico / média)">
                {isNum(report.gpu?.peakTemp) ? `${report.gpu.peakTemp} / ${report.gpu.avgTemp} °C` : DASH}
              </Row>
              <Row label="Memória (pico)">{isNum(report.ram?.peakUsedGB) ? `${report.ram.peakUsedGB} GB` : DASH}</Row>
              <Row label="Gargalo predominante">{report.bottleneckDominant || DASH}</Row>
            </Rows>
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              Uma sessão começa quando o PC fica sob carga alta (jogo, renderização) e termina quando ele volta ao
              repouso. O resumo aparece aqui.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
