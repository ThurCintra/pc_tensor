import { Fragment, useCallback, useEffect, useState } from 'react';
import {
  RefreshCw,
  Copy,
  Download,
  Check,
  Monitor,
  CircuitBoard,
  Cpu,
  MonitorSmartphone,
  MemoryStick,
  HardDrive,
  Network,
  Eye,
  EyeOff,
} from 'lucide-react';
import { PageHeader, Card, Rows, Row, InfoBar, EmptyState } from '../components/ui';
import { getTransport } from '../lib/transport';
import { formatBytes, formatMHz, formatUptime, text, maskMac, isNum, DASH } from '../lib/format';

// navigator.clipboard exige contexto seguro (https/localhost); no celular via http usa o fallback
async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = value;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

function toSummary(info) {
  const lines = [
    `Sistema: ${text(info.os?.osName)} (build ${text(info.os?.build)}, ${text(info.os?.arch)})`,
    `Placa-mãe: ${text(info.motherboard?.manufacturer)} ${text(info.motherboard?.model)} · BIOS ${text(info.motherboard?.biosVersion)}`,
    `Processador: ${text(info.cpu?.name)} · ${info.cpu?.cores ?? DASH} núcleos / ${info.cpu?.threads ?? DASH} threads`,
    ...(info.gpus || []).map((g) => `Placa de vídeo: ${text(g.name)} · ${formatBytes(g.vramTotalBytes, 0)}`),
    `Memória: ${formatBytes(info.ram?.totalBytes, 0)} ${text(info.ram?.type)} · ${formatMHz(info.ram?.speedMHz)} · ${text(info.ram?.channelMode)}`,
    ...(info.disks || []).map(
      (d) => `Disco ${text(d.label)}: ${text(d.model)} · ${d.type} · ${formatBytes(d.totalBytes, 0)}`,
    ),
  ];
  return lines.join('\n');
}

export function Hardware() {
  const [info, setInfo] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showMac, setShowMac] = useState(false);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      setInfo(await getTransport().getHardwareInfo(force));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(false);
  }, [load]);

  const handleCopy = async () => {
    if (await copyText(toSummary(info))) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(info, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pc-sentinel-hardware-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="page">
      <PageHeader title="Hardware" subtitle="Componentes detectados neste PC">
        <button className="btn" onClick={() => load(true)} disabled={loading}>
          <RefreshCw size={14} /> {loading ? 'Atualizando…' : 'Atualizar'}
        </button>
        <button className="btn" onClick={handleCopy} disabled={!info}>
          {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copiado' : 'Copiar resumo'}
        </button>
        <button className="btn" onClick={handleExport} disabled={!info}>
          <Download size={14} /> Exportar JSON
        </button>
      </PageHeader>

      {error && (
        <InfoBar tone="critical" title="Não foi possível ler o hardware.">
          {error}
        </InfoBar>
      )}
      {!info && !error && (
        <Card>
          <EmptyState>Lendo componentes…</EmptyState>
        </Card>
      )}

      {info && (
        <div className="grid-2">
          <Card title="Sistema" icon={Monitor}>
            <Rows>
              <Row label="Windows">{text(info.os?.osName)}</Row>
              <Row label="Build">{text(info.os?.build)}</Row>
              <Row label="Arquitetura">{text(info.os?.arch)}</Row>
              <Row label="Nome do PC">{text(info.os?.hostname)}</Row>
              <Row label="Ligado há">{formatUptime(info.os?.uptimeSeconds)}</Row>
            </Rows>
          </Card>

          <Card title="Placa-mãe" icon={CircuitBoard}>
            <Rows>
              <Row label="Fabricante">{text(info.motherboard?.manufacturer)}</Row>
              <Row label="Modelo">{text(info.motherboard?.model)}</Row>
              <Row label="BIOS">{text(info.motherboard?.biosVersion)}</Row>
              <Row label="Data da BIOS">{text(info.motherboard?.biosDate)}</Row>
            </Rows>
          </Card>

          <Card title="Processador" icon={Cpu}>
            <Rows>
              <Row label="Modelo">{text(info.cpu?.name)}</Row>
              <Row label="Núcleos / threads">
                {info.cpu?.cores ?? DASH} / {info.cpu?.threads ?? DASH}
              </Row>
              <Row label="Frequência base / máxima">
                {formatMHz(info.cpu?.baseSpeedMHz)} / {formatMHz(info.cpu?.maxSpeedMHz)}
              </Row>
              <Row label="Soquete">{text(info.cpu?.socket)}</Row>
              <Row label="Cache L2 / L3">
                {formatBytes(info.cpu?.l2CacheBytes, 0)} / {formatBytes(info.cpu?.l3CacheBytes, 0)}
              </Row>
            </Rows>
          </Card>

          <Card title="Placa de vídeo" icon={MonitorSmartphone}>
            <Rows>
              {(info.gpus || []).length === 0 && <Row label="GPU">{DASH}</Row>}
              {(info.gpus || []).map((g, i) => (
                <Fragment key={i}>
                  <Row label={info.gpus.length > 1 ? `GPU ${i + 1}` : 'Modelo'}>{text(g.name)}</Row>
                  <Row label="Memória de vídeo">{formatBytes(g.vramTotalBytes, 0)}</Row>
                  <Row label="Driver">{text(g.driverVersion)}</Row>
                </Fragment>
              ))}
            </Rows>
          </Card>

          <Card title="Memória" icon={MemoryStick}>
            <Rows>
              <Row label="Total">{formatBytes(info.ram?.totalBytes, 0)}</Row>
              <Row label="Tipo / velocidade">
                {text(info.ram?.type)} · {formatMHz(info.ram?.speedMHz)}
              </Row>
              <Row label="Canais">{text(info.ram?.channelMode)}</Row>
              {(info.ram?.slots || []).map((s) => (
                <Row key={s.slot} label={s.slot}>
                  {formatBytes(s.capacityBytes, 0)} {s.manufacturer ? `· ${s.manufacturer}` : ''}
                </Row>
              ))}
            </Rows>
          </Card>

          <Card title="Armazenamento" icon={HardDrive}>
            <Rows>
              {(info.disks || []).map((d) => (
                <Row key={d.id} label={`${text(d.label)} · ${d.type}`}>
                  {text(d.model)} · {formatBytes(d.totalBytes, 0)}
                </Row>
              ))}
            </Rows>
          </Card>

          <Card
            title="Rede"
            icon={Network}
            action={
              <button
                className="btn subtle"
                onClick={() => setShowMac((v) => !v)}
                aria-label={showMac ? 'Ocultar endereço MAC' : 'Mostrar endereço MAC'}
              >
                {showMac ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            }
          >
            <Rows>
              <Row label="Adaptador">{text(info.network?.interface)}</Row>
              <Row label="Tipo">{text(info.network?.type)}</Row>
              <Row label="IP local">{text(info.network?.localIp)}</Row>
              <Row label="Velocidade do link">
                {isNum(info.network?.linkSpeedMbps) ? `${info.network.linkSpeedMbps} Mbps` : DASH}
              </Row>
              <Row label="MAC">{showMac ? text(info.network?.macAddress) : maskMac(info.network?.macAddress)}</Row>
            </Rows>
          </Card>
        </div>
      )}
    </div>
  );
}
