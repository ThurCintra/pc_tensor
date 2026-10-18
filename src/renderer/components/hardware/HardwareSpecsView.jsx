import React, { useState, useEffect } from 'react';
import { 
  Cpu, 
  HardDrive, 
  Server, 
  Layers, 
  Wifi, 
  Copy, 
  Check, 
  Download, 
  RefreshCw, 
  Eye, 
  EyeOff, 
  ShieldCheck, 
  Activity, 
  Clock, 
  Zap,
  CheckCircle2,
  XCircle,
  Monitor
} from 'lucide-react';

import { BentoCard } from '../ui/BentoCard';
import { 
  formatBytes, 
  formatMHz, 
  formatUptime, 
  formatFallback, 
  EMPTY_PLACEHOLDER 
} from './formatters';

export function HardwareSpecsView({ initialInfo = null }) {
  const [info, setInfo] = useState(initialInfo);
  const [loading, setLoading] = useState(!initialInfo);
  const [copied, setCopied] = useState(false);
  const [selectedGpuIndex, setSelectedGpuIndex] = useState(0);
  const [isMacMasked, setIsMacMasked] = useState(true);

  const fetchHardwareInfo = async (forceRefresh = false) => {
    setLoading(true);
    try {
      if (window.sentinelAPI && window.sentinelAPI.getHardwareInfo) {
        const data = await window.sentinelAPI.getHardwareInfo(forceRefresh);
        setInfo(data);
      } else {
        // Modo Web: tenta buscar especificações reais da API REST
        let fetchedData = null;
        try {
          const host = window.location.hostname || '127.0.0.1';
          const res = await fetch(`http://${host}:3890/api/hardware${forceRefresh ? '?forceRefresh=true' : ''}`);
          if (res.ok) {
            fetchedData = await res.json();
          }
        } catch (netErr) {
          console.warn('API /api/hardware não disponível, usando fallback:', netErr);
        }

        if (fetchedData) {
          setInfo(fetchedData);
        } else {
          // Fallback para modo mock de navegador
          setInfo({
            os: {
              osName: 'Microsoft Windows 11 Home',
              build: '26300',
              arch: 'x64',
              hostname: 'DESKTOP-UV6BTUV',
              agentVersion: '0.1.0',
              uptimeSeconds: 165225,
            },
            motherboard: {
              manufacturer: 'Micro-Star International Co., Ltd.',
              model: 'PRO B650M-P (MS-7E27)',
              biosVersion: '1.G0',
              biosDate: '2025-06-19',
            },
            cpu: {
              name: 'AMD Ryzen 5 9600X 6-Core Processor',
              cores: 6,
              threads: 12,
              baseSpeedMHz: 3900,
              maxSpeedMHz: 5400,
              socket: 'AM5',
              l1CacheBytes: 480 * 1024,
              l2CacheBytes: 6 * 1024 * 1024,
              l3CacheBytes: 32 * 1024 * 1024,
            },
            gpus: [
              {
                vendor: 'AMD',
                name: 'AMD Radeon RX 7600',
                vramTotalBytes: 8176 * 1024 * 1024,
                driverVersion: '31.0.24033.1003',
                bus: 'PCIe 4.0 x16',
              },
              {
                vendor: 'AMD',
                name: 'AMD Radeon(TM) Graphics',
                vramTotalBytes: 512 * 1024 * 1024,
                driverVersion: null,
                bus: 'PCIe',
              },
            ],
            ram: {
              totalBytes: 16 * 1024 * 1024 * 1024,
              type: 'DDR5',
              speedMHz: 5600,
              channelMode: 'Single Channel',
              slots: [
                {
                  slot: 'DIMM 1 (P0 CHANNEL A)',
                  capacityBytes: 16 * 1024 * 1024 * 1024,
                  manufacturer: 'Kingston',
                  partNumber: 'KF556C40-16',
                  speedMHz: 5600,
                },
              ],
            },
            disks: [
              {
                id: 'C:',
                label: 'C:',
                type: 'NVMe',
                totalBytes: 500105249280,
                fs: 'NTFS',
                model: 'KINGSTON SNV3S500G',
              },
            ],
            network: {
              interface: 'Ethernet',
              localIp: '192.168.100.85',
              type: 'Ethernet',
              macAddress: '34:5a:60:c3:f5:67',
              linkSpeedMbps: 1000,
            },
            capabilities: {
              cpuTemperature: true,
              gpuTemperature: true,
              gpuPower: false,
              perCoreLoad: true,
            },
          });
        }
      }
    } catch (e) {
      console.error('Falha ao carregar hardware info:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHardwareInfo(false);
  }, []);

  // Copia resumo formatado em Markdown para o clipboard
  const handleCopySpecs = () => {
    if (!info) return;

    const gpusText = (info.gpus || [])
      .map((g) => `  * ${g.name || 'GPU'} (${formatBytes(g.vramTotalBytes)} VRAM, ${g.vendor || 'N/A'})`)
      .join('\n');

    const disksText = (info.disks || [])
      .map((d) => `  * ${d.id || 'Disco'} (${d.type || 'SSD'} - ${formatBytes(d.totalBytes)} ${d.fs || ''}) ${d.model || ''}`)
      .join('\n');

    const text = `# Especificações Técnicas de Hardware — PC Sentinel
- Hostname: ${formatFallback(info.os?.hostname)}
- Sistema Operacional: ${formatFallback(info.os?.osName)} (Build ${formatFallback(info.os?.build)}, ${formatFallback(info.os?.arch)})
- Tempo de Atividade (Uptime): ${formatUptime(info.os?.uptimeSeconds)}
- Placa-Mãe: ${formatFallback(info.motherboard?.manufacturer)} ${formatFallback(info.motherboard?.model)} | BIOS ${formatFallback(info.motherboard?.biosVersion)} (${formatFallback(info.motherboard?.biosDate)})
- Processador: ${formatFallback(info.cpu?.name)} (${formatFallback(info.cpu?.cores)} Núcleos / ${formatFallback(info.cpu?.threads)} Threads @ ${formatMHz(info.cpu?.baseSpeedMHz)})
- Memória RAM: ${formatBytes(info.ram?.totalBytes)} (${formatFallback(info.ram?.type)} ${formatMHz(info.ram?.speedMHz)} - ${formatFallback(info.ram?.channelMode)})
- Placa(s) de Vídeo:
${gpusText || '  * Não identificada'}
- Armazenamento:
${disksText || '  * Não identificado'}
- Conectividade: ${formatFallback(info.network?.interface)} (${formatFallback(info.network?.localIp)} @ ${info.network?.linkSpeedMbps ? `${info.network.linkSpeedMbps} Mbps` : EMPTY_PLACEHOLDER})
- Gerado por: PC Sentinel v0.1.0 (Dark Cyber-Clean)
`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2400);
  };

  // Exportar relatório completo em JSON
  const handleExportJson = () => {
    if (!info) return;
    const blob = new Blob([JSON.stringify(info, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pc-sentinel-hardware-${info.os?.hostname || 'specs'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const gpus = info?.gpus && info.gpus.length > 0 ? info.gpus : [{}];
  const activeGpu = gpus[selectedGpuIndex] || gpus[0];

  const getVendorBadge = (vendor) => {
    const v = (vendor || '').toUpperCase();
    if (v.includes('NVIDIA')) {
      return { label: 'NVIDIA', bg: 'rgba(16, 185, 129, 0.15)', border: '#10B981', color: '#10B981' };
    }
    if (v.includes('AMD') || v.includes('RADEON')) {
      return { label: 'AMD', bg: 'rgba(255, 42, 84, 0.15)', border: '#FF2A54', color: '#FF2A54' };
    }
    if (v.includes('INTEL')) {
      return { label: 'INTEL', bg: 'rgba(0, 240, 255, 0.15)', border: '#00F0FF', color: '#00F0FF' };
    }
    return { label: vendor || 'GPU', bg: 'rgba(255, 255, 255, 0.08)', border: 'rgba(255, 255, 255, 0.2)', color: '#9CA3AF' };
  };

  const gpuVendorStyle = getVendorBadge(activeGpu.vendor);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>
      {/* 1. Cabeçalho da Máquina (Top Banner) */}
      <BentoCard
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '14px',
          padding: '16px 20px',
          background: 'linear-gradient(135deg, rgba(17, 24, 39, 0.9), rgba(13, 17, 23, 0.95))',
          border: '1px solid var(--border-subtle)',
        }}
      >
        {/* Identificação do Sistema */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #00F0FF, #10B981)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 16px rgba(0, 240, 255, 0.35)',
            }}
          >
            <Server size={22} color="#0B0F19" strokeWidth={2.4} />
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h2
                style={{
                  fontSize: '1.25rem',
                  fontWeight: 700,
                  color: '#F3F4F6',
                  letterSpacing: '0.6px',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {formatFallback(info?.os?.hostname)}
              </h2>
              <span
                style={{
                  fontSize: '0.68rem',
                  padding: '2px 8px',
                  borderRadius: '9999px',
                  background: 'rgba(0, 240, 255, 0.1)',
                  border: '1px solid rgba(0, 240, 255, 0.3)',
                  color: '#00F0FF',
                  fontWeight: 600,
                }}
              >
                v{info?.os?.agentVersion || '0.1.0'}
              </span>
            </div>

            {/* Badges Técnicos */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.74rem', color: '#9CA3AF' }}>
                {formatFallback(info?.os?.osName)}
              </span>
              <span style={{ color: 'rgba(255, 255, 255, 0.15)' }}>•</span>
              <span style={{ fontSize: '0.72rem', color: '#6B7280', fontFamily: 'var(--font-mono)' }}>
                Build {formatFallback(info?.os?.build)} ({formatFallback(info?.os?.arch)})
              </span>
              <span style={{ color: 'rgba(255, 255, 255, 0.15)' }}>•</span>
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '0.72rem',
                  color: '#10B981',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 500,
                }}
              >
                <Clock size={12} /> Uptime: {formatUptime(info?.os?.uptimeSeconds)}
              </span>
            </div>
          </div>
        </div>

        {/* Botões de Ação Rápida */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={handleCopySpecs}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: '8px',
              border: copied ? '1px solid #10B981' : '1px solid rgba(255, 255, 255, 0.1)',
              background: copied ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.04)',
              color: copied ? '#10B981' : '#F3F4F6',
              fontSize: '0.78rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            <span>{copied ? 'Copiado!' : 'Copiar Especificações'}</span>
          </button>

          <button
            onClick={handleExportJson}
            title="Exportar Relatório JSON"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              background: 'rgba(255, 255, 255, 0.04)',
              color: '#9CA3AF',
              fontSize: '0.78rem',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#00F0FF';
              e.currentTarget.style.borderColor = 'rgba(0, 240, 255, 0.3)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = '#9CA3AF';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
            }}
          >
            <Download size={14} />
            <span>JSON</span>
          </button>

          <button
            onClick={() => fetchHardwareInfo(true)}
            disabled={loading}
            title="Forçar nova varredura de componentes estáticos"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid rgba(0, 240, 255, 0.3)',
              background: 'rgba(0, 240, 255, 0.08)',
              color: '#00F0FF',
              fontSize: '0.78rem',
              fontWeight: 600,
              cursor: loading ? 'wait' : 'pointer',
              transition: 'all 0.2s',
            }}
          >
            <RefreshCw size={14} className={loading ? 'fan-spinner' : ''} />
            <span>{loading ? 'Varrendo...' : 'Atualizar'}</span>
          </button>
        </div>
      </BentoCard>

      {/* 2. Linha Principal do Bento Grid (CPU, GPU e Placa-Mãe) */}
      <div className="bento-grid">
        {/* Card de Processador (CPU) — 4 colunas */}
        <BentoCard className="bento-col-4" style={{ gap: '14px', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Cpu size={18} color="#00F0FF" />
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#9CA3AF', letterSpacing: '0.5px' }}>
                  PROCESSADOR (CPU)
                </span>
              </div>
              <div style={{ display: 'flex', gap: '4px' }}>
                <span
                  style={{
                    fontSize: '0.66rem',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    background: 'rgba(0, 240, 255, 0.1)',
                    color: '#00F0FF',
                    fontWeight: 700,
                  }}
                >
                  {formatFallback(info?.cpu?.cores)} Cores
                </span>
                <span
                  style={{
                    fontSize: '0.66rem',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    background: 'rgba(255, 255, 255, 0.06)',
                    color: '#9CA3AF',
                    fontWeight: 600,
                  }}
                >
                  {formatFallback(info?.cpu?.threads)} Threads
                </span>
              </div>
            </div>

            <h3
              style={{
                fontSize: '1rem',
                fontWeight: 700,
                color: '#F3F4F6',
                lineHeight: 1.35,
                wordBreak: 'break-word',
                margin: '2px 0 6px 0',
              }}
            >
              {formatFallback(info?.cpu?.name)}
            </h3>
            <span style={{ fontSize: '0.72rem', color: '#6B7280' }}>
              Soquete: <strong style={{ color: '#9CA3AF' }}>{formatFallback(info?.cpu?.socket)}</strong>
            </span>
          </div>

          {/* Grade Técnica da CPU */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '8px',
              padding: '10px',
              background: 'rgba(0, 0, 0, 0.25)',
              borderRadius: '8px',
              border: '1px solid rgba(255, 255, 255, 0.04)',
              marginTop: '8px',
            }}
          >
            <div>
              <span style={{ fontSize: '0.65rem', color: '#6B7280' }}>CLOCK BASE</span>
              <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#00F0FF' }} className="tabular-nums">
                {formatMHz(info?.cpu?.baseSpeedMHz)}
              </div>
            </div>
            <div>
              <span style={{ fontSize: '0.65rem', color: '#6B7280' }}>BOOST MÁXIMO</span>
              <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#10B981' }} className="tabular-nums">
                {formatMHz(info?.cpu?.maxSpeedMHz)}
              </div>
            </div>
            <div>
              <span style={{ fontSize: '0.65rem', color: '#6B7280' }}>CACHE L2</span>
              <div style={{ fontSize: '0.84rem', fontWeight: 600, color: '#E2E8F0' }} className="tabular-nums">
                {formatBytes(info?.cpu?.l2CacheBytes, 0)}
              </div>
            </div>
            <div>
              <span style={{ fontSize: '0.65rem', color: '#6B7280' }}>CACHE L3</span>
              <div style={{ fontSize: '0.84rem', fontWeight: 600, color: '#E2E8F0' }} className="tabular-nums">
                {formatBytes(info?.cpu?.l3CacheBytes, 0)}
              </div>
            </div>
          </div>
        </BentoCard>

        {/* Card de Placas de Vídeo (GPU) — 4 colunas */}
        <BentoCard className="bento-col-4" style={{ gap: '14px', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Monitor size={18} color="#FF8A00" />
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#9CA3AF', letterSpacing: '0.5px' }}>
                  PLACA DE VÍDEO (GPU)
                </span>
              </div>

              {/* Abas se houver mais de uma GPU */}
              {gpus.length > 1 && (
                <div
                  style={{
                    display: 'flex',
                    gap: '2px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    padding: '2px',
                    borderRadius: '6px',
                  }}
                >
                  {gpus.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setSelectedGpuIndex(i)}
                      style={{
                        background: selectedGpuIndex === i ? 'rgba(255, 138, 0, 0.2)' : 'transparent',
                        color: selectedGpuIndex === i ? '#FF8A00' : '#6B7280',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '2px 8px',
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      GPU {i + 1}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span
                style={{
                  fontSize: '0.65rem',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  background: gpuVendorStyle.bg,
                  border: `1px solid ${gpuVendorStyle.border}`,
                  color: gpuVendorStyle.color,
                  fontWeight: 700,
                }}
              >
                {gpuVendorStyle.label}
              </span>
              <span style={{ fontSize: '0.72rem', color: '#6B7280' }}>
                {formatFallback(activeGpu.bus)}
              </span>
            </div>

            <h3
              style={{
                fontSize: '1rem',
                fontWeight: 700,
                color: '#F3F4F6',
                lineHeight: 1.35,
                wordBreak: 'break-word',
                margin: '2px 0 6px 0',
              }}
            >
              {formatFallback(activeGpu.name)}
            </h3>
          </div>

          {/* VRAM Bar e Driver */}
          <div
            style={{
              padding: '10px',
              background: 'rgba(0, 0, 0, 0.25)',
              borderRadius: '8px',
              border: '1px solid rgba(255, 255, 255, 0.04)',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              marginTop: '8px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem' }}>
              <span style={{ color: '#9CA3AF' }}>Memória VRAM Dedicada</span>
              <strong style={{ color: '#FF8A00' }} className="tabular-nums">
                {formatBytes(activeGpu.vramTotalBytes)}
              </strong>
            </div>

            <div
              style={{
                width: '100%',
                height: '5px',
                background: 'rgba(255, 255, 255, 0.08)',
                borderRadius: '3px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: activeGpu.vramTotalBytes ? '100%' : '0%',
                  height: '100%',
                  background: 'linear-gradient(90deg, #FF8A00, #FF2A54)',
                  borderRadius: '3px',
                  boxShadow: '0 0 8px rgba(255, 138, 0, 0.4)',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: '#6B7280', marginTop: '2px' }}>
              <span>Versão do Driver</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: '#9CA3AF' }}>
                {formatFallback(activeGpu.driverVersion)}
              </span>
            </div>
          </div>
        </BentoCard>

        {/* Card de Placa-Mãe e BIOS — 4 colunas */}
        <BentoCard className="bento-col-4" style={{ gap: '14px', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <Layers size={18} color="#10B981" />
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#9CA3AF', letterSpacing: '0.5px' }}>
                PLACA-MÃE & FIRMWARE (BIOS)
              </span>
            </div>

            <span style={{ fontSize: '0.72rem', color: '#10B981', fontWeight: 600 }}>
              {formatFallback(info?.motherboard?.manufacturer)}
            </span>
            <h3
              style={{
                fontSize: '1rem',
                fontWeight: 700,
                color: '#F3F4F6',
                lineHeight: 1.35,
                wordBreak: 'break-word',
                margin: '2px 0 6px 0',
              }}
            >
              {formatFallback(info?.motherboard?.model)}
            </h3>
          </div>

          <div
            style={{
              padding: '10px',
              background: 'rgba(0, 0, 0, 0.25)',
              borderRadius: '8px',
              border: '1px solid rgba(255, 255, 255, 0.04)',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              marginTop: '8px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem' }}>
              <span style={{ color: '#6B7280' }}>Versão da BIOS</span>
              <strong style={{ color: '#E2E8F0', fontFamily: 'var(--font-mono)' }}>
                {formatFallback(info?.motherboard?.biosVersion)}
              </strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem' }}>
              <span style={{ color: '#6B7280' }}>Data de Lançamento</span>
              <span style={{ color: '#9CA3AF', fontFamily: 'var(--font-mono)' }}>
                {formatFallback(info?.motherboard?.biosDate)}
              </span>
            </div>
          </div>
        </BentoCard>
      </div>

      {/* 3. Linha Secundária do Bento Grid (RAM, Discos e Rede) */}
      <div className="bento-grid">
        {/* Card de Memória RAM — 4 colunas */}
        <BentoCard className="bento-col-4" style={{ gap: '12px', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Zap size={18} color="#00F0FF" />
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#9CA3AF', letterSpacing: '0.5px' }}>
                  MEMÓRIA RAM
                </span>
              </div>
              <span
                style={{
                  fontSize: '0.66rem',
                  padding: '2px 7px',
                  borderRadius: '4px',
                  background: 'rgba(0, 240, 255, 0.1)',
                  color: '#00F0FF',
                  fontWeight: 600,
                }}
              >
                {formatFallback(info?.ram?.channelMode)}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '10px' }}>
              <span style={{ fontSize: '1.45rem', fontWeight: 700, color: '#F3F4F6' }} className="tabular-nums">
                {formatBytes(info?.ram?.totalBytes)}
              </span>
              <span style={{ fontSize: '0.8rem', color: '#9CA3AF', fontWeight: 500 }}>
                {formatFallback(info?.ram?.type)} @ {formatMHz(info?.ram?.speedMHz)}
              </span>
            </div>
          </div>

          {/* Gráfico dos Módulos / DIMMs Instalados */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '0.68rem', color: '#6B7280', textTransform: 'uppercase' }}>
              Slots Ocupados ({info?.ram?.slots?.length || 0})
            </span>
            {(info?.ram?.slots && info.ram.slots.length > 0) ? (
              info.ram.slots.map((stick, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 10px',
                    background: 'rgba(255, 255, 255, 0.03)',
                    borderRadius: '6px',
                    border: '1px solid rgba(255, 255, 255, 0.05)',
                    fontSize: '0.72rem',
                    gap: '8px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: '80px', flexShrink: 0 }}>
                    <span
                      style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        background: '#00F0FF',
                        boxShadow: '0 0 6px #00F0FF',
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ fontWeight: 600, color: '#E2E8F0' }}>{stick.slot || `Slot ${idx + 1}`}</span>
                  </div>
                  <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ color: '#00F0FF', fontWeight: 700 }} className="tabular-nums">
                      {formatBytes(stick.capacityBytes)}
                    </span>
                    <span
                      style={{
                        color: '#6B7280',
                        fontSize: '0.68rem',
                        maxWidth: '130px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={`${stick.manufacturer || ''} ${stick.partNumber ? `(${stick.partNumber})` : ''}`}
                    >
                      {formatFallback(stick.manufacturer)} {stick.partNumber ? `(${stick.partNumber})` : ''}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div style={{ fontSize: '0.74rem', color: '#6B7280', padding: '8px 0' }}>
                Nenhum slot reportado diretamente
              </div>
            )}
          </div>
        </BentoCard>

        {/* Card de Armazenamento (Discos) — 4 colunas */}
        <BentoCard className="bento-col-4" style={{ gap: '12px', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
            <HardDrive size={18} color="#10B981" />
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#9CA3AF', letterSpacing: '0.5px' }}>
              UNIDADES DE ARMAZENAMENTO
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {(info?.disks && info.disks.length > 0) ? (
              info.disks.map((d, idx) => {
                const isNvme = d.type === 'NVMe';
                const isSsd = d.type === 'SSD';
                const badgeColor = isNvme ? '#00F0FF' : isSsd ? '#10B981' : '#9CA3AF';
                const badgeBg = isNvme ? 'rgba(0, 240, 255, 0.12)' : isSsd ? 'rgba(16, 185, 129, 0.12)' : 'rgba(255, 255, 255, 0.06)';

                return (
                  <div
                    key={idx}
                    style={{
                      padding: '8px 10px',
                      background: 'rgba(0, 0, 0, 0.25)',
                      borderRadius: '8px',
                      border: '1px solid rgba(255, 255, 255, 0.04)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span
                          style={{
                            fontSize: '0.62rem',
                            padding: '1px 5px',
                            borderRadius: '4px',
                            background: badgeBg,
                            color: badgeColor,
                            border: `1px solid ${badgeColor}40`,
                            fontWeight: 700,
                          }}
                        >
                          {d.type || 'SSD'}
                        </span>
                        <strong style={{ fontSize: '0.82rem', color: '#F3F4F6' }}>
                          {d.id || `Disco ${idx + 1}`}
                        </strong>
                      </div>
                      <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#10B981' }} className="tabular-nums">
                        {formatBytes(d.totalBytes)}
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.68rem', color: '#6B7280', marginTop: '2px' }}>
                      <span
                        style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '70%' }}
                        title={d.model || ''}
                      >
                        {formatFallback(d.model)}
                      </span>
                      <span style={{ fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
                        {formatFallback(d.fs || d.fsType)}
                      </span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div style={{ fontSize: '0.74rem', color: '#6B7280', padding: '10px 0' }}>
                Nenhuma unidade detectada
              </div>
            )}
          </div>
        </BentoCard>

        {/* Card de Conectividade de Rede — 4 colunas */}
        <BentoCard className="bento-col-4" style={{ gap: '12px', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <Wifi size={18} color="#00F0FF" />
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#9CA3AF', letterSpacing: '0.5px' }}>
                CONECTIVIDADE DE REDE
              </span>
            </div>

            <div
              style={{
                padding: '10px',
                background: 'rgba(0, 0, 0, 0.25)',
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.04)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.74rem', gap: '8px' }}>
                <span style={{ color: '#6B7280', flexShrink: 0 }}>Interface Ativa</span>
                <span style={{ color: '#F3F4F6', fontWeight: 600, textAlign: 'right', wordBreak: 'break-word', maxWidth: '65%' }}>
                  {formatFallback(info?.network?.interface)} {info?.network?.type ? `(${info.network.type})` : ''}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.74rem' }}>
                <span style={{ color: '#6B7280' }}>Endereço IP Local</span>
                <strong style={{ color: '#00F0FF', fontFamily: 'var(--font-mono)' }}>
                  {formatFallback(info?.network?.localIp)}
                </strong>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.74rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ color: '#6B7280' }}>Endereço MAC</span>
                  <button
                    onClick={() => setIsMacMasked(!isMacMasked)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#6B7280',
                      cursor: 'pointer',
                      padding: '0 2px',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                    title={isMacMasked ? 'Revelar MAC Address' : 'Ocultar MAC Address'}
                  >
                    {isMacMasked ? <Eye size={12} /> : <EyeOff size={12} />}
                  </button>
                </div>
                <span style={{ color: '#9CA3AF', fontFamily: 'var(--font-mono)' }}>
                  {isMacMasked 
                    ? '••:••:••:••:••:••' 
                    : formatFallback(info?.network?.macAddress)}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.74rem' }}>
                <span style={{ color: '#6B7280' }}>Velocidade do Link</span>
                <span style={{ color: '#10B981', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                  {info?.network?.linkSpeedMbps ? `${info.network.linkSpeedMbps} Mbps` : EMPTY_PLACEHOLDER}
                </span>
              </div>
            </div>
          </div>

          <div style={{ fontSize: '0.65rem', color: '#4B5563', lineHeight: 1.4, marginTop: '4px' }}>
            * Regra de privacidade ativa: O endereço IP público nunca é coletado nem transmitido.
          </div>
        </BentoCard>
      </div>

      {/* 4. Rodapé Técnico — Diagnóstico de Sensores (Capabilities) */}
      <BentoCard
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          padding: '12px 20px',
          background: 'rgba(13, 17, 23, 0.95)',
          border: '1px solid var(--border-subtle)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ShieldCheck size={16} color="#10B981" />
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#9CA3AF', letterSpacing: '0.5px' }}>
            DIAGNÓSTICO DE CAPACIDADES DE TELEMETRIA
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '18px', flexWrap: 'wrap' }}>
          {[
            { label: 'Temperatura da CPU', active: info?.capabilities?.cpuTemperature },
            { label: 'Temperatura da GPU', active: info?.capabilities?.gpuTemperature },
            { label: 'Consumo GPU (Watts)', active: info?.capabilities?.gpuPower },
            { label: 'Carga por Núcleo', active: info?.capabilities?.perCoreLoad },
          ].map((cap, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span
                style={{
                  width: '7px',
                  height: '7px',
                  borderRadius: '50%',
                  background: cap.active ? '#10B981' : '#4B5563',
                  boxShadow: cap.active ? '0 0 8px #10B981' : 'none',
                }}
              />
              <span
                style={{
                  fontSize: '0.72rem',
                  color: cap.active ? '#E2E8F0' : '#6B7280',
                  fontWeight: cap.active ? 600 : 400,
                }}
              >
                {cap.label}
              </span>
            </div>
          ))}
        </div>
      </BentoCard>
    </div>
  );
}
