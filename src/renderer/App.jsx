import React, { useState, useEffect } from 'react';
import { 
  Activity, 
  Flame, 
  Smartphone, 
  Radio, 
  Gauge,
  CheckCircle,
  Minimize2,
  ExternalLink,
  Cpu,
  Copy,
  Check,
  Gamepad2,
  Terminal,
  EyeOff,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert
} from 'lucide-react';

import { BentoCard } from './components/ui/BentoCard';
import { OverviewPanel } from './components/telemetry/OverviewPanel';
import { HistoryTimelinePanel } from './components/telemetry/HistoryTimelinePanel';
import { DiagnosticsPanel } from './components/telemetry/DiagnosticsPanel';
import { SessionReportModal } from './components/telemetry/SessionReportModal';
import { MiniWidget } from './components/widget/MiniWidget';
import { backendUrl, backendWsUrl, authHeaders } from './lib/backend';

export default function App() {
  const [metrics, setMetrics] = useState(null);
  const [mobileInfo, setMobileInfo] = useState(null);
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'history' | 'diagnostics' | 'mobile'
  const [viewPreset, setViewPreset] = useState('GAMING'); // 'GAMING' | 'DEV' | 'STEALTH'
  const [sessionReport, setSessionReport] = useState(null);
  const [dismissedDegradation, setDismissedDegradation] = useState(false);
  const [isMobileServerRunning, setIsMobileServerRunning] = useState(true);
  const [isMiniMode, setIsMiniMode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [history, setHistory] = useState([]);

  const handleCopyLink = () => {
    const url = mobileInfo?.url || 'http://127.0.0.1:3890';
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const maxHistoryPoints = 60; // Amostragem temporal contínua

  useEffect(() => {
    const handleNewMetrics = (data) => {
      setMetrics(data);

      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
      const cpuT = typeof data?.temperatures?.cpuMain === 'number' ? data.temperatures.cpuMain : null;
      const gpuT = typeof data?.temperatures?.gpu === 'number' ? data.temperatures.gpu : null;
      const cpuL = data?.cpu?.loadPercent || 0;
      const gpuL = typeof data?.gpu?.loadPercent === 'number' ? data.gpu.loadPercent : 0;
      const ramP = data?.memory?.percentUsed || 0;

      setHistory((prev) => {
        const next = [...prev, { time: timeStr, cpuTemp: cpuT, gpuTemp: gpuT, cpuLoad: cpuL, gpuLoad: gpuL, ramPercent: ramP }];
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
      // Modo Web: Conecta ao WebSocket do backend Sentinel sem gerar dados falsos
      fetch(backendUrl('/api/info'), { headers: authHeaders() })
        .then((res) => res.json())
        .then((info) => {
          setMobileInfo(info);
          setIsMobileServerRunning(info.isRunning);
        })
        .catch(() => {});

      let ws = null;
      let reconnectTimer = null;

      const connectWebSocket = () => {
        try {
          ws = new WebSocket(backendWsUrl());
          ws.onmessage = (event) => {
            try {
              const msg = JSON.parse(event.data);
              if (msg.type === 'metrics_update' && msg.data) {
                handleNewMetrics(msg.data);
              } else if (msg.type === 'session_report' && msg.data) {
                setSessionReport(msg.data);
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
        const res = await fetch(backendUrl('/api/server/toggle'), {
          method: 'POST',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
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

  const cpuLoad = metrics?.cpu?.loadPercent ?? 0;
  const ramPercent = metrics?.memory?.percentUsed ?? 0;
  const cpuTemp = typeof metrics?.temperatures?.cpuMain === 'number' ? metrics.temperatures.cpuMain : null;
  const gpuTemp = typeof metrics?.temperatures?.gpu === 'number' ? metrics.temperatures.gpu : null;
  const isAdmin = Boolean(metrics?.temperatures?.isAdmin);
  const requiresElevation = Boolean(metrics?.temperatures?.requiresElevation);

  // Modo Mini-Widget compacto flutuante
  if (isMiniMode) {
    return (
      <MiniWidget
        cpuTemp={cpuTemp ?? 45}
        gpuTemp={gpuTemp ?? 48}
        ramPercent={ramPercent}
        onExpand={() => handleToggleMiniWidget(false)}
      />
    );
  }

  return (
    <div className={`app-container ${viewPreset === 'STEALTH' ? 'stealth-mode' : ''}`}>
      {/* Sidebar Técnica de Bancada */}
      <aside className="sidebar">
        {/* Marca / Identidade */}
        <div className="sidebar-brand">
          <div className="sidebar-logo">
            <Activity size={18} strokeWidth={2.2} />
          </div>
          <div className="sidebar-brand-text">
            <h1
              style={{
                fontSize: '0.98rem',
                fontWeight: 700,
                color: 'var(--text-primary)',
                letterSpacing: '0.04em',
                fontFamily: 'var(--font-mono)',
              }}
            >
              PC SENTINEL
            </h1>
            <span style={{ fontSize: '0.66rem', color: 'var(--text-muted)', letterSpacing: '0.02em' }}>
              Telemetria de Hardware
            </span>
          </div>
        </div>

        {/* Navegação entre os 3 Painéis Especializados + Conexão */}
        <nav className="sidebar-nav">
          <button
            onClick={() => setActiveTab('overview')}
            className={`sidebar-btn ${activeTab === 'overview' ? 'active' : ''}`}
            title="Visão Geral em Tempo Real"
          >
            <Gauge size={18} style={{ flexShrink: 0 }} />
            <span>Visão Geral</span>
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`sidebar-btn ${activeTab === 'history' ? 'active' : ''}`}
            title="Linha do Tempo e Gráficos de Temperatura"
          >
            <Activity size={18} style={{ flexShrink: 0 }} />
            <span>Linha do Tempo</span>
          </button>

          <button
            onClick={() => setActiveTab('diagnostics')}
            className={`sidebar-btn ${activeTab === 'diagnostics' ? 'active' : ''}`}
            title="Inventário de Hardware e Processos Ativos"
          >
            <Cpu size={18} style={{ flexShrink: 0 }} />
            <span>Componentes & Processos</span>
          </button>

          <button
            onClick={() => setActiveTab('mobile')}
            className={`sidebar-btn ${activeTab === 'mobile' ? 'active' : ''}`}
            title="Transmissão Remota para Celular ou Navegador"
          >
            <Smartphone size={18} style={{ flexShrink: 0 }} />
            <span>Transmissão Remota</span>
          </button>

          {/* Botão de Alternância para o Modo Compacto */}
          <button
            onClick={() => handleToggleMiniWidget(true)}
            className="sidebar-btn"
            title="Alternar para widget compacto flutuante"
          >
            <Minimize2 size={16} style={{ flexShrink: 0 }} />
            <span>Modo Compacto</span>
          </button>
        </nav>

        {/* Status do Servidor e Permissões na Sidebar */}
        <div className="sidebar-footer" title={isAdmin ? 'Executando com privilégios de Administrador' : 'Executando em modo de usuário padrão'}>
          <div className="sidebar-footer-text">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ fontSize: '0.66rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Permissão
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.68rem', color: isAdmin ? 'var(--color-nominal)' : 'var(--text-secondary)', fontWeight: 500 }}>
                {isAdmin ? <ShieldCheck size={11} color="var(--color-nominal)" /> : <ShieldAlert size={11} color="var(--color-elevated)" />}
                {isAdmin ? 'Administrador' : 'Usuário'}
              </span>
            </div>
            <div
              style={{
                fontSize: '0.7rem',
                color: 'var(--text-secondary)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {mobileInfo?.url || '127.0.0.1:3890'}
            </div>
          </div>
        </div>
      </aside>

      {/* Área Principal de Conteúdo */}
      <main className="main-content">
        {/* Cabeçalho Superior da Janela */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
              {activeTab === 'overview' && 'Visão Geral em Tempo Real'}
              {activeTab === 'history' && 'Histórico e Tendências Térmicas'}
              {activeTab === 'diagnostics' && 'Diagnóstico Técnico de Hardware'}
              {activeTab === 'mobile' && 'Pareamento de Transmissão Remota'}
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: '2px' }}>
              {activeTab === 'overview' && 'Leituras diretas dos sensores físicos da máquina sem simulações'}
              {activeTab === 'history' && 'Curvas contínuas de temperatura de junção e carga de trabalho'}
              {activeTab === 'diagnostics' && 'Detalhamento do processador, placa de vídeo, placa-mãe e processos'}
              {activeTab === 'mobile' && 'Acesso via navegador local para smartphones e telas auxiliares'}
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {activeTab === 'overview' && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '2px',
                  background: 'var(--bg-inset)',
                  padding: '3px',
                  borderRadius: 'var(--border-radius-inner)',
                  border: '1px solid var(--border-hairline)',
                }}
              >
                <button
                  onClick={() => setViewPreset('GAMING')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '4px 9px',
                    borderRadius: 'var(--border-radius-sm)',
                    border: viewPreset === 'GAMING' ? '1px solid var(--border-subtle)' : '1px solid transparent',
                    background: viewPreset === 'GAMING' ? 'var(--bg-card)' : 'transparent',
                    color: viewPreset === 'GAMING' ? 'var(--text-primary)' : 'var(--text-muted)',
                    fontWeight: 600,
                    fontSize: '0.72rem',
                    cursor: 'pointer',
                  }}
                >
                  <Gamepad2 size={12} />
                  <span>JOGOS</span>
                </button>

                <button
                  onClick={() => setViewPreset('DEV')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '4px 9px',
                    borderRadius: 'var(--border-radius-sm)',
                    border: viewPreset === 'DEV' ? '1px solid var(--border-subtle)' : '1px solid transparent',
                    background: viewPreset === 'DEV' ? 'var(--bg-card)' : 'transparent',
                    color: viewPreset === 'DEV' ? 'var(--text-primary)' : 'var(--text-muted)',
                    fontWeight: 600,
                    fontSize: '0.72rem',
                    cursor: 'pointer',
                  }}
                >
                  <Terminal size={12} />
                  <span>TRABALHO</span>
                </button>

                <button
                  onClick={() => setViewPreset('STEALTH')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '4px 9px',
                    borderRadius: 'var(--border-radius-sm)',
                    border: viewPreset === 'STEALTH' ? '1px solid var(--border-subtle)' : '1px solid transparent',
                    background: viewPreset === 'STEALTH' ? 'var(--bg-card)' : 'transparent',
                    color: viewPreset === 'STEALTH' ? 'var(--text-primary)' : 'var(--text-muted)',
                    fontWeight: 600,
                    fontSize: '0.72rem',
                    cursor: 'pointer',
                  }}
                >
                  <EyeOff size={12} />
                  <span>DISCRETO</span>
                </button>
              </div>
            )}

            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                background: 'var(--bg-inset)',
                border: '1px solid var(--border-hairline)',
                color: metrics ? 'var(--color-nominal)' : 'var(--text-muted)',
                padding: '4px 10px',
                borderRadius: 'var(--border-radius-sm)',
                fontSize: '0.72rem',
                fontWeight: 500,
              }}
            >
              <CheckCircle size={12} />
              {metrics ? 'Sincronizado' : 'Conectando'}
            </span>
          </div>
        </div>

        {/* Banner Preventivo de Degradação Térmica */}
        {metrics?.degradationAlert?.hasDegradation && !dismissedDegradation && (
          <div
            style={{
              background: 'var(--bg-inset)',
              border: '1px solid var(--color-critical)',
              borderRadius: 'var(--border-radius-inner)',
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <AlertTriangle color="var(--color-critical)" size={16} />
              <div>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-critical)' }}>
                  Alerta de Degradação Térmica (+{metrics.degradationAlert.delta}°C acima da linha de base)
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  {metrics.degradationAlert.recommendation || 'Verifique o fluxo de ar e o estado térmico do sistema.'}
                </div>
              </div>
            </div>
            <button
              onClick={() => setDismissedDegradation(true)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: '0.72rem',
                textDecoration: 'underline',
              }}
            >
              Dispensar
            </button>
          </div>
        )}

        {/* Estado sem dados antes da conexão inicial */}
        {!metrics && (
          <div
            style={{
              padding: '60px 20px',
              textAlign: 'center',
              background: 'var(--bg-card)',
              borderRadius: 'var(--border-radius-card)',
              border: '1px solid var(--border-hairline)',
              color: 'var(--text-muted)',
              fontSize: '0.84rem',
            }}
          >
            Aguardando sinal dos sensores físicos de hardware...
          </div>
        )}

        {/* 1. Painel de Visão Geral */}
        {metrics && activeTab === 'overview' && (
          <OverviewPanel
            metrics={metrics}
            viewPreset={viewPreset}
          />
        )}

        {/* 2. Painel de Linha do Tempo e Gráficos */}
        {metrics && activeTab === 'history' && (
          <HistoryTimelinePanel
            history={history}
            cpuTemp={cpuTemp}
            gpuTemp={gpuTemp}
            cpuLoad={cpuLoad}
            gpuLoad={metrics?.gpu?.loadPercent ?? 0}
            ramPercent={ramPercent}
          />
        )}

        {/* 3. Painel de Diagnóstico e Componentes */}
        {activeTab === 'diagnostics' && (
          <DiagnosticsPanel
            metrics={metrics}
          />
        )}

        {/* 4. Painel de Conexão Móvel */}
        {activeTab === 'mobile' && (
          <div style={{ maxWidth: '680px', margin: '8px auto', width: '100%' }}>
            <BentoCard style={{ textAlign: 'center', padding: '28px 24px', alignItems: 'center', gap: '14px' }}>
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: 'var(--border-radius-sm)',
                  background: 'var(--bg-chip)',
                  border: '1px solid var(--border-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--color-accent)',
                }}
              >
                <Smartphone size={22} />
              </div>

              <div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
                  Pareamento com Smartphone ou Dispositivo Remoto
                </h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', maxWidth: '480px', margin: '0 auto', lineHeight: 1.4 }}>
                  Acesse pelo navegador do smartphone ou de qualquer computador na mesma rede local.
                </p>
              </div>

              {mobileInfo?.qrCodeDataUrl ? (
                <div
                  style={{
                    display: 'inline-block',
                    padding: '12px',
                    background: 'var(--bg-inset)',
                    borderRadius: 'var(--border-radius-card)',
                    border: '1px solid var(--border-subtle)',
                    margin: '6px 0',
                  }}
                >
                  <img
                    src={mobileInfo.qrCodeDataUrl}
                    alt="QR Code para pareamento com smartphone"
                    style={{ width: '190px', height: '190px', display: 'block', borderRadius: '4px' }}
                  />
                </div>
              ) : (
                <div style={{ padding: '40px', color: 'var(--text-muted)' }}>Gerando código de pareamento...</div>
              )}

              <div style={{ width: '100%' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                  Ou abra este endereço no navegador do aparelho:
                </div>
                <button
                  onClick={handleCopyLink}
                  title="Clique para copiar o link"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.86rem',
                    color: copiedLink ? 'var(--color-nominal)' : 'var(--text-primary)',
                    background: 'var(--bg-inset)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 16px',
                    borderRadius: 'var(--border-radius-inner)',
                    border: copiedLink ? '1px solid var(--color-nominal)' : '1px solid var(--border-subtle)',
                    cursor: 'pointer',
                    maxWidth: '100%',
                    wordBreak: 'break-all',
                  }}
                >
                  {copiedLink ? <Check size={14} color="var(--color-nominal)" /> : <Copy size={14} />}
                  <span>{copiedLink ? 'Link copiado' : (mobileInfo?.url || 'http://127.0.0.1:3890')}</span>
                </button>
              </div>

              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center', marginTop: '6px' }}>
                <button
                  onClick={handleToggleMobileServer}
                  className="btn-instrument"
                  style={{
                    borderColor: isMobileServerRunning ? 'var(--color-critical)' : 'var(--color-nominal)',
                    color: isMobileServerRunning ? 'var(--color-critical)' : 'var(--color-nominal)',
                  }}
                >
                  {isMobileServerRunning ? 'Pausar transmissão' : 'Iniciar transmissão'}
                </button>

                <button
                  onClick={() => setActiveTab('overview')}
                  className="btn-instrument active"
                >
                  Voltar à Visão Geral
                </button>
              </div>
            </BentoCard>
          </div>
        )}
      </main>

      {/* Relatório Pós-Sessão Térmica */}
      {sessionReport && (
        <SessionReportModal
          report={sessionReport}
          onClose={() => setSessionReport(null)}
        />
      )}
    </div>
  );
}
