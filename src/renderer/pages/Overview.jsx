import {
  Cpu,
  MonitorSmartphone,
  MemoryStick,
  Wifi,
  HardDrive,
  Stethoscope,
  Thermometer,
  ListOrdered,
  ChevronRight,
} from 'lucide-react';
import { PageHeader, Card, Meter, Badge, InfoBar, Rows, Row, StatValue, EmptyState } from '../components/ui';
import { isNum, fixed, tempLevel, loadLevel, DASH } from '../lib/format';
import { peakOf } from '../hooks/useTelemetry';

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
    <div className="stat-caption" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      {label && <Badge tone={level === 'normal' ? 'success' : level}>{label}</Badge>}
      {isNum(peak) && <span>Pico da sessão {peak.toFixed(0)} °C</span>}
    </div>
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

      {metrics.degradationAlert?.hasDegradation && (
        <InfoBar tone="caution" title="Temperatura em repouso subiu.">
          {`+${metrics.degradationAlert.deltaTemp} °C em relação a duas semanas atrás. Considere limpar o cooler ou trocar a pasta térmica.`}
        </InfoBar>
      )}

      <div className="grid">
        <Card title="Processador" icon={Cpu}>
          <StatValue value={t.cpuMain} unit="°C" />
          <TempCaption temp={t.cpuMain} limit={thresholds.cpuTempC} peak={peakOf(history, 'cpuTemp')} />
          <div style={{ marginTop: 14 }}>
            <div className="core-label">
              <span>Uso</span>
              <span className="tabular">{fixed(metrics.cpu?.loadPercent)}%</span>
            </div>
            <Meter
              value={metrics.cpu?.loadPercent}
              level={loadLevel(metrics.cpu?.loadPercent)}
              label="Uso do processador"
            />
          </div>
        </Card>

        <Card title="Placa de vídeo" icon={MonitorSmartphone}>
          <StatValue value={t.gpu} unit="°C" />
          <TempCaption temp={t.gpu} limit={thresholds.gpuTempC} peak={peakOf(history, 'gpuTemp')} />
          <div className="stat-caption" style={{ marginTop: 14 }}>
            {t.gpuName || 'GPU'}
            {isNum(t.gpuVramUsedMB) &&
              isNum(t.gpuVramTotalMB) &&
              ` · VRAM ${(t.gpuVramUsedMB / 1024).toFixed(1)}/${(t.gpuVramTotalMB / 1024).toFixed(1)} GB`}
            {isNum(t.gpuPowerWatts) && ` · ${t.gpuPowerWatts.toFixed(0)} W`}
          </div>
        </Card>

        <Card title="Memória" icon={MemoryStick}>
          <StatValue value={memory.percentUsed} unit="%" emptyText={DASH} />
          <div className="stat-caption">
            {fixed(memory.usedGB, 1)} de {fixed(memory.totalGB, 1)} GB em uso
          </div>
          <div style={{ marginTop: 14 }}>
            <Meter value={memory.percentUsed} level={loadLevel(memory.percentUsed)} label="Uso de memória" />
          </div>
          {isNum(metrics.swap?.usedMB) && metrics.swap.totalMB > 0 && (
            <div className="stat-caption" style={{ marginTop: 8 }}>
              Arquivo de paginação {(metrics.swap.usedMB / 1024).toFixed(1)} GB
            </div>
          )}
        </Card>

        <Card title="Rede" icon={Wifi} action={<Badge tone={netTone}>{netLabel}</Badge>}>
          <StatValue value={network.latencyMs} unit="ms" emptyText={DASH} />
          <div className="stat-caption">
            Latência até {network.host || '1.1.1.1'} · variação {fixed(network.jitterMs, 1)} ms · perda{' '}
            {fixed(network.packetLossPercent)}%
          </div>
        </Card>
      </div>

      <div className="grid-2">
        <Card title="Núcleos" icon={Cpu} action={<span className="faint">{cores.length} threads</span>}>
          <div className="cores">
            {cores.map((load, i) => (
              <div key={i}>
                <div className="core-label">
                  <span>{i}</span>
                  <span className="tabular">{fixed(load)}%</span>
                </div>
                <Meter value={load} level={loadLevel(load)} label={`Núcleo ${i}`} />
              </div>
            ))}
          </div>
        </Card>

        <Card title="Armazenamento" icon={HardDrive}>
          <Rows>
            {disks.length === 0 && <Row label="Unidades">{DASH}</Row>}
            {disks.map((d) => (
              <div className="row" key={d.mount || d.fs} style={{ display: 'block' }}>
                <div className="core-label" style={{ fontSize: 14, color: 'var(--text)' }}>
                  <span>{d.mount || d.fs}</span>
                  <span className="tabular muted">
                    {fixed(d.usedGB, 0)} de {fixed(d.sizeGB, 0)} GB
                  </span>
                </div>
                <Meter value={d.percentUsed} level={loadLevel(d.percentUsed)} label={`Ocupação de ${d.mount}`} />
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
            <>
              <p style={{ margin: '0 0 8px' }}>{bottleneck.description}</p>
              <ul style={{ margin: 0, paddingLeft: 18 }} className="muted">
                {(bottleneck.recommendations || []).map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </>
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
        icon={ListOrdered}
        action={
          <button className="btn subtle" onClick={() => onNavigate('processes')}>
            Ver todos <ChevronRight size={14} />
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
