import React, { useState, useEffect, useRef } from 'react';
import { 
  Activity, 
  Flame, 
  Smartphone, 
  Radio, 
  Gauge,
  CheckCircle,
  Minimize2,
  Maximize2,
  Wifi,
  ExternalLink,
  ShieldCheck,
  Server,
  Cpu,
  Copy,
  Check,
  Gamepad2,
  Terminal,
  EyeOff,
  AlertTriangle
} from 'lucide-react';

import { BentoCard } from './components/ui/BentoCard';
import { ThermalHeroGauge } from './components/telemetry/ThermalHeroGauge';
import { ThermalSplineChart } from './components/telemetry/ThermalSplineChart';
import { EqualizerCard } from './components/telemetry/EqualizerBar';
import { FanSpeedCard } from './components/telemetry/FanSpeedCard';
import { StorageCard } from './components/telemetry/StorageCard';
import { BottleneckCard } from './components/telemetry/BottleneckCard';
import { NetworkCard } from './components/telemetry/NetworkCard';
import { ProcessListCard } from './components/telemetry/ProcessListCard';
import { SessionReportModal } from './components/telemetry/SessionReportModal';
import { MiniWidget } from './components/widget/MiniWidget';
import { HardwareSpecsView } from './components/hardware/HardwareSpecsView';

export default function App() {
  const [metrics, setMetrics] = useState(null);
  const [mobileInfo, setMobileInfo] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [viewPreset, setViewPreset] = useState('GAMING'); // 'GAMING' | 'DEV' | 'STEALTH'
  const [sessionReport, setSessionReport] = useState(null);
  const [dismissedDegradation, setDismissedDegradation] = useState(false);
  const [isMobileServerRunning, setIsMobileServerRunning] = useState(true);
  const [isMiniMode, setIsMiniMode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [history, setHistory] = useState([]);

  const handleCopyLink = () => {
    const url = mobileInfo?.url || 'http://192.168.100.85:3890';
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // Buffer circular deslizante de 30 minutos em memória
  const maxHistoryPoints = 60; // Amostragem temporal

  useEffect(() => {
    const handleNewMetrics = (data) => {
      setMetrics(data);

      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      const cpuT = typeof data?.temperatures?.cpuMain === 'number'
        ? data.temperatures.cpuMain
        : Number((39 + ((data?.cpu?.loadPercent || 0) * 0.42)).toFixed(1));
      const load = data?.cpu?.loadPercent || 0;

      setHistory((prev) => {
        const next = [...prev, { temp: cpuT, load, time: timeStr }];
        if (next.length > maxHistoryPoints) next.shift();
        return next;
      });
    };

    if (window.sentinelAPI) {
      window.sentinelAPI.getMobileServerInfo().then((info) => {
        setMobileInfo(info);
        setIsMobileServerRunning(info.isRunning);
      });

      const unsubscribe = window.sentinelAPI.onMetricsUpdate((data) => {
        handleNewMetrics(data);
      });

      let unsubSession = null;
      if (window.sentinelAPI.onSessionReport) {
        unsubSession = window.sentinelAPI.onSessionReport((report) => {
          setSessionReport(report);
        });
      }

      return () => {
        if (unsubscribe) unsubscribe();
        if (unsubSession) unsubSession();
      };
    } else {
      // Modo Web: Conecta ao WebSocket do backend Sentinel e consulta REST APIs
      const host = window.location.hostname || '127.0.0.1';

      fetch(`http://${host}:3890/api/info`)
        .then((res) => res.json())
        .then((info) => {
          setMobileInfo(info);
          setIsMobileServerRunning(info.isRunning);
        })
        .catch(() => {});

      let ws = null;
      let reconnectTimer = null;
      let mockTimer = null;
      let receivedLiveStream = false;

      // Inicia com fallback mock inicial que é desativado assim que a telemetria ao vivo chegar
      mockTimer = setInterval(() => {
        if (receivedLiveStream) {
          clearInterval(mockTimer);
          return;
        }
        const dummyLoad = Math.round(25 + Math.random() * 35);
        const dummyTemp = Number((42 + dummyLoad * 0.38 + (Math.random() * 1.5)).toFixed(1));
        const mockData = {
          timestamp: Date.now(),
          temperatures: {
            cpuMain: dummyTemp,
            cpuMax: Number((dummyTemp + 3.2).toFixed(1)),
            gpu: Number((dummyTemp - 2).toFixed(1)),
            gpuName: 'AMD Radeon RX 7600',
            isEstimated: true,
          },
          cpu: { loadPercent: dummyLoad, cores: [dummyLoad - 4, dummyLoad + 6, dummyLoad, dummyLoad - 2] },
          memory: { totalGB: 16, usedGB: 7.8, percentUsed: 48.7 },
          disks: [{ mount: 'C:', sizeGB: 1000, usedGB: 460, percentUsed: 46 }],
          fan: { rpm: 1150 + dummyLoad * 14, pwmPercent: 48 + Math.round(dummyLoad * 0.4), maxRpm: 2400 },
          diskIo: { readMBps: 18.4, writeMBps: 6.2 },
          bottleneck: { state: 'BALANCED', reason: 'Tudo operando dentro dos parâmetros ideais' },
          network: { latencyMs: 14, jitterMs: 1.2, packetLossPercent: 0, status: 'EXCELLENT' },
          processes: [
            { pid: 4820, name: 'Cyberpunk2077.exe', cpuPercent: 42.5, memMB: 4800 },
            { pid: 1092, name: 'Discord.exe', cpuPercent: 4.2, memMB: 480 },
            { pid: 8124, name: 'chrome.exe', cpuPercent: 3.8, memMB: 1250 },
            { pid: 6140, name: 'Code.exe', cpuPercent: 2.1, memMB: 650 },
            { pid: 2190, name: 'Spotify.exe', cpuPercent: 1.2, memMB: 280 },
          ],
          swap: { totalMB: 8192, usedMB: 1240, percentUsed: 15.1 },
        };
        handleNewMetrics(mockData);
      }, 1200);

      const connectWebSocket = () => {
        try {
          ws = new WebSocket(`ws://${host}:3890`);
          ws.onmessage = (event) => {
            try {
              const msg = JSON.parse(event.data);
              if (msg.type === 'metrics_update' && msg.data) {
                receivedLiveStream = true;
                if (mockTimer) clearInterval(mockTimer);
                handleNewMetrics(msg.data);
              } else if (msg.type === 'SESSION_REPORT_READY' && msg.report) {
                setSessionReport(msg.report);
              }
            } catch (e) {}
          };

          ws.onclose = () => {
            reconnectTimer = setTimeout(connectWebSocket, 2000);
          };

          ws.onerror = () => {
            try { ws.close(); } catch (e) {}
          };
        } catch (e) {
          reconnectTimer = setTimeout(connectWebSocket, 2000);
        }
      };

      connectWebSocket();

      return () => {
        if (ws) ws.close();
        if (reconnectTimer) clearTimeout(reconnectTimer);
        if (mockTimer) clearInterval(mockTimer);
      };
    }
  }, []);

  const handleToggleMobileServer = async () => {
    const nextState = !isMobileServerRunning;
    if (window.sentinelAPI) {
      const updatedInfo = await window.sentinelAPI.toggleMobileServer(nextState);
      setMobileInfo(updatedInfo);
      setIsMobileServerRunning(updatedInfo.isRunning);
    } else {
      try {
        const host = window.location.hostname || '127.0.0.1';
        const res = await fetch(`http://${host}:3890/api/server/toggle`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ shouldStart: nextState }),
        });
        if (res.ok) {
          const updatedInfo = await res.json();
          setMobileInfo(updatedInfo);
          setIsMobileServerRunning(updatedInfo.isRunning);
        }
      } catch (e) {
        console.error('Falha ao alternar streaming mobile:', e);
      }
    }
  };

  const handleToggleMiniWidget = async (toMini) => {
    const nextMode = typeof toMini === 'boolean' ? toMini : !isMiniMode;
    if (window.sentinelAPI && window.sentinelAPI.toggleMiniWidget) {
      const confirmedMode = await window.sentinelAPI.toggleMiniWidget(nextMode);
      setIsMiniMode(confirmedMode);
    } else {
      setIsMiniMode(nextMode);
    }
  };

  // Extração e normalização de telemetria
  const cpuLoad = metrics?.cpu?.loadPercent ?? 0;
  const ramPercent = metrics?.memory?.percentUsed ?? 0;
  const isCpuEstimated = metrics?.temperatures?.isCpuEstimated ?? metrics?.temperatures?.isEstimated ?? true;
  const isGpuEstimated = metrics?.temperatures?.isGpuEstimated ?? metrics?.temperatures?.isEstimated ?? true;
  const isEstimated = metrics?.temperatures?.isEstimated ?? (isCpuEstimated || isGpuEstimated);
  const cpuTemp = typeof metrics?.temperatures?.cpuMain === 'number'
    ? metrics.temperatures.cpuMain
    : Number((39 + (cpuLoad * 0.42)).toFixed(1));
  const gpuTemp = typeof metrics?.temperatures?.gpu === 'number'
    ? metrics.temperatures.gpu
    : Number((42 + (cpuLoad * 0.35)).toFixed(1));
  const cpuMax = metrics?.temperatures?.cpuMax ?? Math.round(cpuTemp + 3);
  const gpuMax = Math.round(gpuTemp + 2);
  const cpuModelName = metrics?.cpu?.model || metrics?.cpu?.brand || metrics?.temperatures?.cpuName || 'Processador';

  const fanRpm = metrics?.fan?.rpm ?? Math.round(850 + (cpuLoad * 12));
  const pwmPercent = metrics?.fan?.pwmPercent ?? Math.min(100, Math.round((fanRpm / 2400) * 100));

  const diskIo = metrics?.diskIo ?? { readMBps: 14.8, writeMBps: 5.4 };
  const disks = metrics?.disks ?? [{ mount: 'C:', sizeGB: 950, usedGB: 460, percentUsed: 48 }];
  const memory = metrics?.memory ?? { totalGB: 16, usedGB: 7.8, percentUsed: 48 };

  // Se o Modo Mini-Widget flutuante estiver ativo, renderiza exclusivamente o componente compacto
  if (isMiniMode) {
    return (
      <MiniWidget
        cpuTemp={cpuTemp}
        gpuTemp={gpuTemp}
        ramPercent={ramPercent}
        onExpand={() => handleToggleMiniWidget(false)}
      />
    );
  }

  return (
    <div className={`app-container ${viewPreset === 'STEALTH' ? 'stealth-mode' : ''}`}>
      {/* Sidebar Técnica Dark Cyber-Clean */}
      <aside className="sidebar">
        {/* Brand Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '28px' }}>
          <div
            style={{
              width: '34px',
              height: '34px',
              borderRadius: '9px',
              background: 'linear-gradient(135deg, #00F0FF, #10B981)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 16px rgba(0, 240, 255, 0.3)',
            }}
          >
            <Activity color="#0B0F19" size={20} strokeWidth={2.5} />
          </div>
          <div>
            <h1
              style={{
                fontSize: '1.05rem',
                fontWeight: 700,
                color: '#F3F4F6',
                letterSpacing: '0.6px',
                fontFamily: 'var(--font-mono)',
              }}
            >
              PC SENTINEL
            </h1>
            <span style={{ fontSize: '0.68rem', color: '#00F0FF', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
              Dark Cyber-Clean
            </span>
          </div>
        </div>

        {/* Navegação entre Módulos */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
          <button
            onClick={() => setActiveTab('dashboard')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 12px',
              borderRadius: '8px',
              border: activeTab === 'dashboard' ? '1px solid rgba(0, 240, 255, 0.35)' : '1px solid transparent',
              background: activeTab === 'dashboard' ? 'rgba(0, 240, 255, 0.1)' : 'transparent',
              color: activeTab === 'dashboard' ? '#00F0FF' : '#9CA3AF',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.84rem',
              textAlign: 'left',
              transition: 'all 0.2s',
            }}
          >
            <Gauge size={16} />
            <span>Dashboard Principal</span>
          </button>

          <button
            onClick={() => setActiveTab('hardware')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 12px',
              borderRadius: '8px',
              border: activeTab === 'hardware' ? '1px solid rgba(0, 240, 255, 0.35)' : '1px solid transparent',
              background: activeTab === 'hardware' ? 'rgba(0, 240, 255, 0.1)' : 'transparent',
              color: activeTab === 'hardware' ? '#00F0FF' : '#9CA3AF',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.84rem',
              textAlign: 'left',
              transition: 'all 0.2s',
            }}
          >
            <Cpu size={16} />
            <span>Hardware & Sistema</span>
          </button>

          <button
            onClick={() => setActiveTab('mobile')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 12px',
              borderRadius: '8px',
              border: activeTab === 'mobile' ? '1px solid rgba(0, 240, 255, 0.35)' : '1px solid transparent',
              background: activeTab === 'mobile' ? 'rgba(0, 240, 255, 0.1)' : 'transparent',
              color: activeTab === 'mobile' ? '#00F0FF' : '#9CA3AF',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.84rem',
              textAlign: 'left',
              transition: 'all 0.2s',
            }}
          >
            <Smartphone size={16} />
            <span>Transmissão Celular</span>
          </button>

          {/* Botão de Alternância para o Modo Mini-Widget */}
          <button
            onClick={() => handleToggleMiniWidget(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 12px',
              borderRadius: '8px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              background: 'rgba(255, 255, 255, 0.03)',
              color: '#9CA3AF',
              cursor: 'pointer',
              fontWeight: 500,
              fontSize: '0.82rem',
              textAlign: 'left',
              marginTop: '4px',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#F3F4F6';
              e.currentTarget.style.borderColor = 'rgba(0, 240, 255, 0.3)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = '#9CA3AF';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
            }}
          >
            <Minimize2 size={16} color="#00F0FF" />
            <span>Modo Mini-Widget</span>
          </button>
        </nav>

        {/* Status do Servidor Mobile na Sidebar */}
        <div
          style={{
            background: 'rgba(17, 24, 39, 0.7)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '10px',
            padding: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ fontSize: '0.68rem', color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              STREAM LOCAL
            </span>
            {isMobileServerRunning ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', color: '#10B981', fontWeight: 700 }}>
                <Radio size={11} /> ATIVO
              </span>
            ) : (
              <span style={{ fontSize: '0.7rem', color: '#FF2A54', fontWeight: 700 }}>PARADO</span>
            )}
          </div>
          <div
            style={{
              fontSize: '0.72rem',
              color: '#9CA3AF',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {mobileInfo?.url || 'http://127.0.0.1:3890'}
          </div>
        </div>
      </aside>

      {/* Área Principal de Conteúdo */}
      <main className="main-content">
        {activeTab === 'dashboard' && (
          <>
            {/* Barra de Status e Cabeçalho do Dashboard */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#F3F4F6', letterSpacing: '0.5px' }}>
                  TELEMETRIA EM TEMPO REAL
                </h2>
                <p style={{ color: '#6B7280', fontSize: '0.8rem', marginTop: '2px' }}>
                  Bento Grid modular de alto desempenho com iluminação semântica dinâmica
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {/* Seletor de Presets de Layout Dinâmico */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    background: 'rgba(11, 15, 25, 0.75)',
                    padding: '3px',
                    borderRadius: '10px',
                    border: '1px solid #1F2937',
                  }}
                >
                  <button
                    onClick={() => setViewPreset('GAMING')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: '5px 10px',
                      borderRadius: '7px',
                      border: 'none',
                      background: viewPreset === 'GAMING' ? 'rgba(0, 240, 255, 0.15)' : 'transparent',
                      color: viewPreset === 'GAMING' ? '#00F0FF' : '#9CA3AF',
                      fontWeight: 600,
                      fontSize: '0.74rem',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <Gamepad2 size={13} />
                    <span>GAMING</span>
                  </button>

                  <button
                    onClick={() => setViewPreset('DEV')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: '5px 10px',
                      borderRadius: '7px',
                      border: 'none',
                      background: viewPreset === 'DEV' ? 'rgba(16, 185, 129, 0.15)' : 'transparent',
                      color: viewPreset === 'DEV' ? '#10B981' : '#9CA3AF',
                      fontWeight: 600,
                      fontSize: '0.74rem',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <Terminal size={13} />
                    <span>DEV / WORK</span>
                  </button>

                  <button
                    onClick={() => setViewPreset('STEALTH')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: '5px 10px',
                      borderRadius: '7px',
                      border: 'none',
                      background: viewPreset === 'STEALTH' ? 'rgba(156, 163, 175, 0.2)' : 'transparent',
                      color: viewPreset === 'STEALTH' ? '#F3F4F6' : '#9CA3AF',
                      fontWeight: 600,
                      fontSize: '0.74rem',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <EyeOff size={13} />
                    <span>STEALTH</span>
                  </button>
                </div>

                <span
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    background: 'rgba(16, 185, 129, 0.08)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    color: '#10B981',
                    padding: '5px 12px',
                    borderRadius: '9999px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    letterSpacing: '0.4px',
                  }}
                >
                  <CheckCircle size={13} /> Sincronizado (1.2s)
                </span>
              </div>
            </div>

            {/* Banner Preventivo de Degradação Térmica */}
            {metrics?.degradationAlert?.hasDegradation && !dismissedDegradation && (
              <div
                style={{
                  background: 'rgba(255, 42, 84, 0.12)',
                  border: '1px solid rgba(255, 42, 84, 0.45)',
                  borderRadius: '10px',
                  padding: '10px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  boxShadow: '0 0 20px rgba(255, 42, 84, 0.2)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <AlertTriangle color="#FF2A54" size={18} />
                  <div>
                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#FF2A54' }}>
                      ALERTA PREVENTIVO DE DEGRADAÇÃO TÉRMICA (+{metrics.degradationAlert.delta}°C acima da baseline)
                    </div>
                    <div style={{ fontSize: '0.74rem', color: '#E5E7EB', marginTop: '2px' }}>
                      {metrics.degradationAlert.recommendation || 'Possível acúmulo de poeira nos dissipadores ou ressecamento da pasta térmica.'}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setDismissedDegradation(true)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#9CA3AF',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    textDecoration: 'underline',
                  }}
                >
                  Dispensar
                </button>
              </div>
            )}

            {/* Layout GAMING: Foco Máximo em Térmica, Gargalo e Latência de Rede */}
            {viewPreset === 'GAMING' && (
              <div className="bento-grid">
                <ThermalHeroGauge
                  className="bento-col-4"
                  cpuTemp={cpuTemp}
                  gpuTemp={gpuTemp}
                  cpuMax={cpuMax}
                  gpuMax={gpuMax}
                  cpuModel={cpuModelName}
                  gpuModel={metrics?.temperatures?.gpuName || 'GPU Primária'}
                  isEstimated={isEstimated}
                  isCpuEstimated={isCpuEstimated}
                  isGpuEstimated={isGpuEstimated}
                />

                <ThermalSplineChart
                  className="bento-col-5"
                  history={history}
                  currentTemp={cpuTemp}
                  currentLoad={cpuLoad}
                />

                <BottleneckCard
                  className="bento-col-3"
                  bottleneck={metrics?.bottleneck}
                  cpuLoad={cpuLoad}
                  gpuLoad={metrics?.gpu?.loadPercent ?? null}
                  ramPercent={ramPercent}
                />

                <NetworkCard
                  className="bento-col-4"
                  network={metrics?.network}
                />

                <FanSpeedCard
                  className="bento-col-4"
                  rpm={fanRpm}
                  pwmPercent={pwmPercent}
                />

                <StorageCard
                  className="bento-col-4"
                  disks={disks}
                  diskIo={diskIo}
                />
              </div>
            )}

            {/* Layout DEV / WORK: Foco em Processos, Swap e Equalizador de Núcleos */}
            {viewPreset === 'DEV' && (
              <div className="bento-grid">
                <ProcessListCard
                  className="bento-col-6"
                  processes={metrics?.processes || []}
                  swap={metrics?.swap}
                />

                <EqualizerCard
                  className="bento-col-6"
                  cpuLoad={cpuLoad}
                  cpuModel={cpuModelName}
                  cores={metrics?.cpu?.cores || []}
                  memory={memory}
                />

                <BottleneckCard
                  className="bento-col-4"
                  bottleneck={metrics?.bottleneck}
                  cpuLoad={cpuLoad}
                  gpuLoad={metrics?.gpu?.loadPercent ?? null}
                  ramPercent={ramPercent}
                />

                <NetworkCard
                  className="bento-col-4"
                  network={metrics?.network}
                />

                <StorageCard
                  className="bento-col-4"
                  disks={disks}
                  diskIo={diskIo}
                />
              </div>
            )}

            {/* Layout STEALTH: Minimalista, Silencioso e de Baixo Contraste */}
            {viewPreset === 'STEALTH' && (
              <div className="bento-grid">
                <ThermalHeroGauge
                  className="bento-col-3"
                  cpuTemp={cpuTemp}
                  gpuTemp={gpuTemp}
                  cpuMax={cpuMax}
                  gpuMax={gpuMax}
                  cpuModel={cpuModelName}
                  gpuModel={metrics?.temperatures?.gpuName || 'GPU Primária'}
                  isEstimated={isEstimated}
                  isCpuEstimated={isCpuEstimated}
                  isGpuEstimated={isGpuEstimated}
                />

                <EqualizerCard
                  className="bento-col-3"
                  cpuLoad={cpuLoad}
                  cpuModel={cpuModelName}
                  cores={metrics?.cpu?.cores || []}
                  memory={memory}
                />

                <ProcessListCard
                  className="bento-col-3"
                  processes={metrics?.processes || []}
                  swap={metrics?.swap}
                />

                <NetworkCard
                  className="bento-col-3"
                  network={metrics?.network}
                />

                <ThermalSplineChart
                  className="bento-col-8"
                  history={history}
                  currentTemp={cpuTemp}
                  currentLoad={cpuLoad}
                />

                <StorageCard
                  className="bento-col-4"
                  disks={disks}
                  diskIo={diskIo}
                />
              </div>
            )}

            {/* Cartão de Atalho Rápido para Streaming no Smartphone */}
            <BentoCard
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 22px',
                background: 'linear-gradient(135deg, rgba(17, 24, 39, 0.85), rgba(11, 15, 25, 0.95))',
                border: '1px solid rgba(0, 240, 255, 0.18)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '10px',
                    background: 'rgba(0, 240, 255, 0.08)',
                    border: '1px solid rgba(0, 240, 255, 0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Smartphone size={22} color="#00F0FF" />
                </div>
                <div>
                  <h4 style={{ fontSize: '0.92rem', fontWeight: 600, color: '#F3F4F6' }}>
                    Streaming Móvel para Smartphone
                  </h4>
                  <p style={{ fontSize: '0.76rem', color: '#9CA3AF', marginTop: '2px' }}>
                    Use a tela do celular como segundo HUD em tempo real enquanto joga ou renderiza.
                  </p>
                </div>
              </div>

              <button
                onClick={() => setActiveTab('mobile')}
                style={{
                  background: 'rgba(0, 240, 255, 0.12)',
                  border: '1px solid rgba(0, 240, 255, 0.4)',
                  color: '#00F0FF',
                  padding: '8px 18px',
                  borderRadius: '8px',
                  fontWeight: 600,
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(0, 240, 255, 0.22)';
                  e.currentTarget.style.boxShadow = '0 0 16px rgba(0, 240, 255, 0.3)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(0, 240, 255, 0.12)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <span>Conectar Celular</span>
                <ExternalLink size={14} />
              </button>
            </BentoCard>
          </>
        )}

        {/* Aba de Hardware & Sistema (Raio-X do PC) */}
        {activeTab === 'hardware' && <HardwareSpecsView />}

        {/* Aba de Pareamento Móvel via QR Code */}
        {activeTab === 'mobile' && (
          <div style={{ maxWidth: '720px', margin: '20px auto', width: '100%' }}>
            <BentoCard style={{ textAlign: 'center', padding: '32px 24px', alignItems: 'center' }}>
              <div
                style={{
                  width: '52px',
                  height: '52px',
                  borderRadius: '14px',
                  background: 'rgba(0, 240, 255, 0.1)',
                  border: '1px solid #00F0FF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '14px',
                  boxShadow: '0 0 20px rgba(0, 240, 255, 0.25)',
                }}
              >
                <Smartphone size={28} color="#00F0FF" />
              </div>

              <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#F3F4F6', marginBottom: '6px' }}>
                PAREAMENTO COM SMARTPHONE OU OUTRO COMPUTADOR
              </h2>
              <p style={{ color: '#9CA3AF', fontSize: '0.88rem', marginBottom: '20px', maxWidth: '520px' }}>
                Conecte seu smartphone ou qualquer outro PC na mesma rede (Wi-Fi ou Cabo) para acompanhar toda a telemetria ao vivo pelo navegador.
              </p>

              {/* QR Code Container */}
              {mobileInfo?.qrCodeDataUrl ? (
                <div
                  style={{
                    display: 'inline-block',
                    padding: '14px',
                    background: '#0D1117',
                    borderRadius: '16px',
                    border: '1px solid rgba(0, 240, 255, 0.35)',
                    boxShadow: '0 0 30px rgba(0, 240, 255, 0.2)',
                    marginBottom: '18px',
                  }}
                >
                  <img
                    src={mobileInfo.qrCodeDataUrl}
                    alt="QR Code de conexão móvel"
                    style={{ width: '200px', height: '200px', display: 'block', borderRadius: '10px' }}
                  />
                </div>
              ) : (
                <div style={{ padding: '60px', color: '#6B7280' }}>Gerando QR Code...</div>
              )}

              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '0.72rem', color: '#6B7280', textTransform: 'uppercase', marginBottom: '8px' }}>
                  Ou abra no navegador do celular ou de qualquer outro PC na mesma rede:
                </div>
                <button
                  onClick={handleCopyLink}
                  title="Clique para copiar o link para a área de transferência"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.95rem',
                    color: copiedLink ? '#10B981' : '#00F0FF',
                    background: copiedLink ? 'rgba(16, 185, 129, 0.12)' : 'rgba(13, 17, 23, 0.85)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '8px 18px',
                    borderRadius: '8px',
                    border: copiedLink ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(0, 240, 255, 0.35)',
                    cursor: 'pointer',
                    boxShadow: copiedLink ? '0 0 16px rgba(16, 185, 129, 0.2)' : '0 0 16px rgba(0, 240, 255, 0.1)',
                    transition: 'all 0.25s',
                  }}
                >
                  {copiedLink ? <Check size={16} color="#10B981" /> : <Copy size={16} color="#00F0FF" />}
                  <span>{copiedLink ? 'Link Copiado!' : (mobileInfo?.url || 'http://192.168.100.85:3890')}</span>
                </button>
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  onClick={handleToggleMobileServer}
                  style={{
                    background: isMobileServerRunning ? 'rgba(255, 42, 84, 0.12)' : 'rgba(16, 185, 129, 0.12)',
                    border: isMobileServerRunning ? '1px solid #FF2A54' : '1px solid #10B981',
                    color: isMobileServerRunning ? '#FF2A54' : '#10B981',
                    padding: '8px 20px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: '0.88rem',
                    transition: 'all 0.2s',
                  }}
                >
                  {isMobileServerRunning ? 'Pausar Transmissão' : 'Iniciar Transmissão'}
                </button>

                <button
                  onClick={() => setActiveTab('dashboard')}
                  style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid var(--border-subtle)',
                    color: '#9CA3AF',
                    padding: '8px 18px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: 500,
                    fontSize: '0.88rem',
                  }}
                >
                  Voltar ao Dashboard
                </button>
              </div>
            </BentoCard>
          </div>
        )}
      </main>

      {/* Modal Cyberpunk de Relatório de Sessão Térmica */}
      {sessionReport && (
        <SessionReportModal
          report={sessionReport}
          onClose={() => setSessionReport(null)}
        />
      )}
    </div>
  );
}
