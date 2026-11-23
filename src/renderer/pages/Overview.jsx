import {
  CaretRight,
  Cpu,
  GraphicsCard,
  HardDrives,
  ListBullets,
  Memory,
  Stethoscope,
  Thermometer,
  WifiHigh,
} from '@phosphor-icons/react';
import { PageHeader, Card, LabeledMeter, Badge, InfoBar, Rows, Row, StatValue, EmptyState } from '../components/ui';
import { isNum, fixed, tempLevel, loadLevel, DASH } from '../lib/format';
import { peakOf } from '../hooks/useTelemetry';
import { getTransport } from '../lib/transport';

const SENSOR_DRIVER_URL = 'https://pawnio.eu';

const NETWORK_STATUS = {
  EXCELLENT: ['Excelente', 'success'],
  GOOD: ['Boa', 'success'],
  FAIR: ['Regular', 'caution'],
  POOR: ['Ruim', 'critical'],
  DISCONNECTED: ['Sem conexão', 'critical'],
  MEASURING: ['Medindo', ''],
};

const BOTTLENECK_TONE = { critical: 'critical', warning: 'caution', optimal: 'success', stable: 'success' };

function TempCaption({ temp, limit, peak }) {
  const level = tempLevel(temp, limit);
  const label = { critical: 'Acima do limite', caution: 'Elevada', normal: 'Normal' }[level];
  return (
    <div className="stat-caption">
      {label && <Badge tone={level === 'normal' ? 'success' : level}>{label}</Badge>}
      {isNum(peak) && <span>Pico da sessão {peak.toFixed(0)} °C</span>}
    </div>
  );
}

/** CPU sem temperatura porque falta o driver PawnIO (o instalador instala; recusado o UAC, fica este aviso). */
function SensorDriverInfoBar() {
  const transport = getTransport();
  return (
    <InfoBar
      tone="caution"
      title="Temperatura da CPU indisponível: falta o driver PawnIO."
      actions={
        transport.openSensorDriverPage ? (
          <button className="btn accent" onClick={() => transport.openSensorDriverPage()}>
            Baixar o PawnIO
          </button>
        ) : (
          <a className="btn accent" href={SENSOR_DRIVER_URL} target="_blank" rel="noreferrer">
            Baixar o PawnIO
          </a>
        )
      }
    >
      O PC Sentinel lê a temperatura do processador por esse driver. Instale o PawnIO e reinicie o app.
    </InfoBar>
  );
}

export function Overview({ metrics, history, appInfo, onNavigate, onRelaunchAsAdmin }) {
  if (!metrics) {
    return (
      <div className="page">
        <PageHeader title="Visão geral" />
        <Card>
          <EmptyState>Aguardando a primeira leitura dos sensores…</EmptyState>
        </Card>
      </div>
    );
  }

  const t = metrics.temperatures || {};
  const thresholds = metrics.alerts?.thresholds || { cpuTempC: 85, gpuTempC: 85 };
  const memory = metrics.memory || {};
  const network = metrics.network || {};
  const disks = metrics.disks || [];
  const cores = metrics.cpu?.cores || [];
  const bottleneck = metrics.bottleneck;
  const processes = metrics.processes || [];
  const [netLabel, netTone] = NETWORK_STATUS[network.status] || [DASH, ''];
  const noTemps = !isNum(t.cpuMain) && !isNum(t.gpu);

  return (
    <div className="page">
      <PageHeader title="Visão geral" subtitle={t.cpuName || metrics.cpu?.model} />

      {metrics.alerts?.active?.map((a) => (
        <InfoBar key={a.sensor} tone="critical" title={`${a.label} em ${a.temp.toFixed(1)} °C.`}>
          Acima do limite de {a.limit} °C. Verifique a refrigeração ou reduza a carga.
        </InfoBar>
      ))}

      {noTemps && t.requiresElevation && (
        <InfoBar
          tone="caution"
          title="Temperaturas indisponíveis."
          actions={
            appInfo?.canRelaunchElevated && (
              <button className="btn accent" onClick={onRelaunchAsAdmin}>
                Reiniciar como administrador
              </button>
            )
          }
        >
          Os sensores de CPU e GPU exigem privilégio de administrador.
          {!appInfo?.canRelaunchElevated && ' Abra o terminal como administrador e rode o app de novo.'}
        </InfoBar>
      )}

      {t.sensorDriverMissing && !t.requiresElevation && <SensorDriverInfoBar />}

      {metrics.degradationAlert?.hasDegradation && (
        <InfoBar tone="caution" title="Temperatura em repouso subiu.">
          {`+${metrics.degradationAlert.deltaTemp} °C em relação a duas semanas atrás. Considere limpar o cooler ou trocar a pasta térmica.`}
        </InfoBar>
      )}

      <div className="grid">
        <Card
          title="Processador"
          icon={Cpu}
          footer={
            <LabeledMeter
              label="Uso"
              valueText={`${fixed(metrics.cpu?.loadPercent)}%`}
              value={metrics.cpu?.loadPercent}
              level={loadLevel(metrics.cpu?.loadPercent)}
              ariaLabel="Uso do processador"
            />
          }
        >
          <StatValue value={t.cpuMain} unit="°C" />
          <TempCaption temp={t.cpuMain} limit={thresholds.cpuTempC} peak={peakOf(history, 'cpuTemp')} />
        </Card>

        <Card
          title="Placa de vídeo"
          icon={GraphicsCard}
          footer={
            <div className="stat-caption">
              {t.gpuName || 'GPU'}
              {isNum(t.gpuVramUsedMB) &&
                isNum(t.gpuVramTotalMB) &&
                ` · VRAM ${(t.gpuVramUsedMB / 1024).toFixed(1)}/${(t.gpuVramTotalMB / 1024).toFixed(1)} GB`}
              {isNum(t.gpuPowerWatts) && ` · ${t.gpuPowerWatts.toFixed(0)} W`}
            </div>
          }
        >
          <StatValue value={t.gpu} unit="°C" />
          <TempCaption temp={t.gpu} limit={thresholds.gpuTempC} peak={peakOf(history, 'gpuTemp')} />
        </Card>

        <Card
          title="Memória"
          icon={Memory}
          footer={
            <LabeledMeter
              label="Uso"
              valueText={`${fixed(memory.percentUsed)}%`}
              value={memory.percentUsed}
              level={loadLevel(memory.percentUsed)}
              ariaLabel="Uso de memória"
            />
          }
        >
          <StatValue value={memory.percentUsed} unit="%" emptyText={DASH} />
          <div className="stat-caption">
            {fixed(memory.usedGB, 1)} de {fixed(memory.totalGB, 1)} GB em uso
            {isNum(metrics.swap?.usedMB) &&
              metrics.swap.totalMB > 0 &&
              ` · paginação ${(metrics.swap.usedMB / 1024).toFixed(1)} GB`}
          </div>
        </Card>

        <Card
          title="Rede"
          icon={WifiHigh}
          action={<Badge tone={netTone}>{netLabel}</Badge>}
          footer={
            <div className="stat-caption">
              Variação {fixed(network.jitterMs, 1)} ms · perda {fixed(network.packetLossPercent)}%
            </div>
          }
        >
          <StatValue value={network.latencyMs} unit="ms" emptyText={DASH} />
          <div className="stat-caption">Latência até {network.host || '1.1.1.1'}</div>
        </Card>
      </div>

      <div className="grid-2">
        <Card title="Núcleos" icon={Cpu} action={<span className="faint">{cores.length} threads</span>}>
          <div className="cores">
            {cores.map((load, i) => (
              <LabeledMeter
                key={i}
                label={i}
                valueText={`${fixed(load)}%`}
                value={load}
                level={loadLevel(load)}
                ariaLabel={`Núcleo ${i}`}
              />
            ))}
          </div>
        </Card>

        <Card title="Armazenamento" icon={HardDrives}>
          <Rows>
            {disks.length === 0 && <Row label="Unidades">{DASH}</Row>}
            {disks.map((d) => (
              <div className="row meter-row" key={d.mount || d.fs}>
                <LabeledMeter
                  strong
                  label={d.mount || d.fs}
                  valueText={`${fixed(d.usedGB, 0)} de ${fixed(d.sizeGB, 0)} GB`}
                  value={d.percentUsed}
                  level={loadLevel(d.percentUsed)}
                  ariaLabel={`Ocupação de ${d.mount}`}
                />
              </div>
            ))}
            <Row label="Leitura / gravação">
              {metrics.diskIo?.isReal
                ? `${fixed(metrics.diskIo.readMBps, 1)} / ${fixed(metrics.diskIo.writeMBps, 1)} MB/s`
                : 'Sem sensor'}
            </Row>
          </Rows>
        </Card>
      </div>

      <div className="grid-2">
        <Card
          title="Diagnóstico"
          icon={Stethoscope}
          action={bottleneck && <Badge tone={BOTTLENECK_TONE[bottleneck.severity]}>{bottleneck.label}</Badge>}
        >
          {bottleneck ? (
            <div className="stack-sm">
              <p>{bottleneck.description}</p>
              <ul className="recommendations">
                {(bottleneck.recommendations || []).map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
          ) : (
            <span className="muted">{DASH}</span>
          )}
        </Card>

        <Card title="Outros sensores" icon={Thermometer}>
          <Rows>
            <Row label="Placa-mãe">
              {isNum(t.motherboard?.temp) ? `${t.motherboard.temp.toFixed(0)} °C` : 'Sem sensor'}
            </Row>
            <Row label="SSD / HD">{isNum(t.storage?.temp) ? `${t.storage.temp.toFixed(0)} °C` : 'Sem sensor'}</Row>
            <Row label="GPU (ponto mais quente)">
              {isNum(t.gpuHotspotTemp) ? `${t.gpuHotspotTemp.toFixed(0)} °C` : 'Sem sensor'}
            </Row>
            <Row label="Ventoinha">
              {metrics.fan?.isReal && isNum(metrics.fan.rpm) ? `${metrics.fan.rpm} RPM` : 'Sem sensor'}
            </Row>
          </Rows>
        </Card>
      </div>

      <Card
        title="Processos que mais consomem"
        icon={ListBullets}
        action={
          <button className="btn subtle" onClick={() => onNavigate('processes')}>
            Ver todos <CaretRight size={14} />
          </button>
        }
      >
        <Rows>
          {processes.length === 0 && <Row label="Nenhum processo com consumo relevante">{DASH}</Row>}
          {processes.slice(0, 3).map((p) => (
            <Row key={p.pid} label={p.name}>
              {fixed(p.cpuPercent, 1)}% CPU · {fixed(p.memoryMB)} MB
            </Row>
          ))}
        </Rows>
      </Card>
    </div>
  );
}
