import React, { useState, useEffect } from 'react';
import { 
  Activity, 
  Cpu, 
  HardDrive, 
  Flame, 
  Smartphone, 
  Wifi, 
  WifiOff, 
  Radio, 
  Gauge,
  CheckCircle,
  AlertTriangle
} from 'lucide-react';

export default function App() {
  const [metrics, setMetrics] = useState(null);
  const [mobileInfo, setMobileInfo] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isMobileServerRunning, setIsMobileServerRunning] = useState(true);

  useEffect(() => {
    // Escuta atualizações de telemetria se estiver no Electron
    if (window.sentinelAPI) {
      window.sentinelAPI.getMobileServerInfo().then((info) => {
        setMobileInfo(info);
        setIsMobileServerRunning(info.isRunning);
      });

      const unsubscribe = window.sentinelAPI.onMetricsUpdate((data) => {
        setMetrics(data);
      });

      return () => {
        if (unsubscribe) unsubscribe();
      };
    } else {
      // Modo Mock/Navegador para testes isolados
      const timer = setInterval(() => {
        setMetrics({
          timestamp: Date.now(),
          temperatures: {
            cpuMain: 58.4,
            cpuMax: 61.2,
            gpu: 52.0,
            gpuName: 'NVIDIA RTX Simulator',
            isEstimated: false,
          },
          cpu: { loadPercent: 38.5, cores: [32, 45, 30, 48] },
          memory: { totalGB: 32, usedGB: 14.2, percentUsed: 44.3 },
          disks: [{ mount: 'C:', sizeGB: 1000, usedGB: 450, percentUsed: 45 }],
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, []);

  const handleToggleMobileServer = async () => {
    if (window.sentinelAPI) {
      const nextState = !isMobileServerRunning;
      const updatedInfo = await window.sentinelAPI.toggleMobileServer(nextState);
      setMobileInfo(updatedInfo);
      setIsMobileServerRunning(updatedInfo.isRunning);
    }
  };

  const cpuLoad = metrics?.cpu?.loadPercent ?? 0;
  const ramPercent = metrics?.memory?.percentUsed ?? 0;
  const isEstimated = metrics?.temperatures?.isEstimated ?? false;
  const cpuTemp = typeof metrics?.temperatures?.cpuMain === 'number'
    ? metrics.temperatures.cpuMain
    : Number((39 + (cpuLoad * 0.42)).toFixed(1));
  const gpuTemp = typeof metrics?.temperatures?.gpu === 'number'
    ? metrics.temperatures.gpu
    : Number((42 + (cpuLoad * 0.35)).toFixed(1));

  return (
    <div className="app-container">
      {/* Sidebar */}
      <aside className="sidebar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px' }}>
          <div style={{
            width: '38px',
            height: '38px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #00f0ff, #ff0055)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 15px rgba(0, 240, 255, 0.4)'
          }}>
            <Activity color="#fff" size={22} />
          </div>
          <div>
            <h1 className="font-orbitron" style={{ fontSize: '1.1rem', fontWeight: 900, color: '#fff', letterSpacing: '1px' }}>PC SENTINEL</h1>
            <span style={{ fontSize: '0.75rem', color: '#00f0ff', letterSpacing: '1px', textTransform: 'uppercase' }}>Thermal & Telemetry</span>
          </div>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
          <button 
            onClick={() => setActiveTab('dashboard')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '12px 14px',
              borderRadius: '10px',
              border: activeTab === 'dashboard' ? '1px solid rgba(0, 240, 255, 0.4)' : '1px solid transparent',
              background: activeTab === 'dashboard' ? 'rgba(0, 240, 255, 0.12)' : 'transparent',
              color: activeTab === 'dashboard' ? '#00f0ff' : '#94a3b8',
              cursor: 'pointer',
              fontWeight: 600,
              textAlign: 'left',
              transition: 'all 0.2s',
            }}>
            <Gauge size={18} />
            <span>Dashboard Principal</span>
          </button>

          <button 
            onClick={() => setActiveTab('mobile')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '12px 14px',
              borderRadius: '10px',
              border: activeTab === 'mobile' ? '1px solid rgba(255, 0, 85, 0.4)' : '1px solid transparent',
              background: activeTab === 'mobile' ? 'rgba(255, 0, 85, 0.12)' : 'transparent',
              color: activeTab === 'mobile' ? '#ff0055' : '#94a3b8',
              cursor: 'pointer',
              fontWeight: 600,
              textAlign: 'left',
              transition: 'all 0.2s',
            }}>
            <Smartphone size={18} />
            <span>Transmissão Celular</span>
          </button>
        </nav>

        {/* Status Box */}
        <div style={{
          background: 'rgba(0, 0, 0, 0.3)',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          borderRadius: '12px',
          padding: '14px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase' }}>Mobile Stream</span>
            {isMobileServerRunning ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: '#00ff88', fontWeight: 700 }}>
                <Radio size={12} className="animate-pulse" /> ATIVO
              </span>
            ) : (
              <span style={{ fontSize: '0.75rem', color: '#ff0055', fontWeight: 700 }}>PARADO</span>
            )}
          </div>
          <span style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>
            {mobileInfo?.url || 'http://127.0.0.1:3890'}
          </span>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        {activeTab === 'dashboard' && (
          <>
            {/* Header com resumo */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div>
                <h2 className="font-orbitron" style={{ fontSize: '1.5rem', fontWeight: 800 }}>TELEMETRIA EM TEMPO REAL</h2>
                <p style={{ color: '#64748b', fontSize: '0.9rem', marginTop: '4px' }}>Monitoramento contínuo de temperaturas de CPU/GPU, carga e uso de memória</p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'rgba(0, 255, 136, 0.1)',
                  border: '1px solid #00ff88',
                  color: '#00ff88',
                  padding: '6px 14px',
                  borderRadius: '20px',
                  fontSize: '0.85rem',
                  fontWeight: 700
                }}>
                  <CheckCircle size={14} /> LIVE 1s
                </span>
              </div>
            </div>

            {/* Cards Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '18px' }}>
              {/* CPU Temp */}
              <div className="glass-panel" style={{ position: 'relative', overflow: 'hidden' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontWeight: 600, letterSpacing: '1px' }}>CPU TEMP</span>
                    <span style={{
                      fontSize: '0.62rem',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      background: isEstimated ? 'rgba(0, 240, 255, 0.12)' : 'rgba(0, 255, 136, 0.12)',
                      color: isEstimated ? '#00f0ff' : '#00ff88',
                      border: isEstimated ? '1px solid rgba(0, 240, 255, 0.3)' : '1px solid rgba(0, 255, 136, 0.3)',
                      fontWeight: 700
                    }}>
                      {isEstimated ? 'ESTIMADO' : 'SENSOR'}
                    </span>
                  </div>
                  <Flame size={18} color="#ff0055" />
                </div>
                <div style={{ margin: '14px 0 8px', display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                  <span className="font-orbitron" style={{ fontSize: '2.4rem', fontWeight: 900, color: '#fff' }}>
                    {cpuTemp}
                  </span>
                  <span style={{ color: '#00f0ff', fontWeight: 700, fontSize: '1.1rem' }}>°C</span>
                </div>
                <div style={{ width: '100%', height: '6px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{
                    width: `${Math.min(100, Math.max(0, ((typeof cpuTemp === 'number' ? cpuTemp : 40) - 30) / 70 * 100))}%`,
                    height: '100%',
                    background: typeof cpuTemp === 'number' && cpuTemp >= 80 ? 'linear-gradient(90deg, #ffb703, #ff0055)' : 'linear-gradient(90deg, #00f0ff, #00ff88)',
                    boxShadow: '0 0 10px rgba(0, 240, 255, 0.5)'
                  }} />
                </div>
                <div style={{ marginTop: '10px', fontSize: '0.75rem', color: '#64748b' }}>
                  Teto Térmico Seguro: 90°C
                </div>
              </div>

              {/* GPU Temp */}
              <div className="glass-panel">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontWeight: 600, letterSpacing: '1px' }}>GPU TEMP</span>
                    <span style={{
                      fontSize: '0.62rem',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      background: isEstimated ? 'rgba(0, 240, 255, 0.12)' : 'rgba(0, 255, 136, 0.12)',
                      color: isEstimated ? '#00f0ff' : '#00ff88',
                      border: isEstimated ? '1px solid rgba(0, 240, 255, 0.3)' : '1px solid rgba(0, 255, 136, 0.3)',
                      fontWeight: 700
                    }}>
                      {isEstimated ? 'ESTIMADO' : 'SENSOR'}
                    </span>
                  </div>
                  <Activity size={18} color="#00f0ff" />
                </div>
                <div style={{ margin: '14px 0 8px', display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                  <span className="font-orbitron" style={{ fontSize: '2.4rem', fontWeight: 900, color: '#fff' }}>
                    {gpuTemp}
                  </span>
                  <span style={{ color: '#00f0ff', fontWeight: 700, fontSize: '1.1rem' }}>°C</span>
                </div>
                <div style={{ width: '100%', height: '6px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{
                    width: `${Math.min(100, Math.max(0, ((typeof gpuTemp === 'number' ? gpuTemp : 40) - 30) / 70 * 100))}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, #00f0ff, #00ff88)',
                    boxShadow: '0 0 10px rgba(0, 240, 255, 0.5)'
                  }} />
                </div>
                <div style={{ marginTop: '10px', fontSize: '0.75rem', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {metrics?.temperatures?.gpuName || 'GPU'}
                </div>
              </div>

              {/* CPU Load */}
              <div className="glass-panel">
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', fontSize: '0.85rem' }}>
                  <span style={{ fontWeight: 600, letterSpacing: '1px' }}>CPU LOAD</span>
                  <Cpu size={18} color="#00ff88" />
                </div>
                <div style={{ margin: '14px 0 8px', display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                  <span className="font-orbitron" style={{ fontSize: '2.4rem', fontWeight: 900, color: '#fff' }}>
                    {cpuLoad}
                  </span>
                  <span style={{ color: '#00ff88', fontWeight: 700, fontSize: '1.1rem' }}>%</span>
                </div>
                <div style={{ width: '100%', height: '6px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{
                    width: `${cpuLoad}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, #00ff88, #ffb703)',
                    boxShadow: '0 0 10px rgba(0, 255, 136, 0.5)'
                  }} />
                </div>
                <div style={{ marginTop: '10px', fontSize: '0.75rem', color: '#64748b' }}>
                  {metrics?.cpu?.cores?.length || 0} Núcleos Lógicos
                </div>
              </div>

              {/* RAM Usage */}
              <div className="glass-panel">
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', fontSize: '0.85rem' }}>
                  <span style={{ fontWeight: 600, letterSpacing: '1px' }}>MEMÓRIA RAM</span>
                  <HardDrive size={18} color="#ffb703" />
                </div>
                <div style={{ margin: '14px 0 8px', display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                  <span className="font-orbitron" style={{ fontSize: '2.4rem', fontWeight: 900, color: '#fff' }}>
                    {ramPercent}
                  </span>
                  <span style={{ color: '#ffb703', fontWeight: 700, fontSize: '1.1rem' }}>%</span>
                </div>
                <div style={{ width: '100%', height: '6px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{
                    width: `${ramPercent}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, #ffb703, #ff0055)',
                    boxShadow: '0 0 10px rgba(255, 183, 3, 0.5)'
                  }} />
                </div>
                <div style={{ marginTop: '10px', fontSize: '0.75rem', color: '#64748b' }}>
                  {metrics?.memory?.usedGB || 0} / {metrics?.memory?.totalGB || 0} GB
                </div>
              </div>
            </div>

            {/* Banner de Conexão Rápida com o Celular */}
            <div className="glass-panel" style={{
              background: 'linear-gradient(135deg, rgba(16, 22, 36, 0.9), rgba(255, 0, 85, 0.1))',
              border: '1px solid rgba(255, 0, 85, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '24px 28px'
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <Smartphone color="#ff0055" size={24} />
                  <h3 className="font-orbitron" style={{ fontSize: '1.2rem', fontWeight: 800 }}>TRANSMISSÃO AO VIVO PARA SMARTPHONE</h3>
                </div>
                <p style={{ color: '#94a3b8', fontSize: '0.95rem', maxWidth: '620px', lineHeight: 1.5 }}>
                  Acompanhe as temperaturas da CPU e GPU na tela do seu celular enquanto joga ou renderiza. Aponte a câmera do seu telefone para o QR Code para conectar instantaneamente via Wi-Fi.
                </p>
              </div>

              <button
                onClick={() => setActiveTab('mobile')}
                style={{
                  background: 'linear-gradient(135deg, #00f0ff, #ff0055)',
                  border: 'none',
                  color: '#fff',
                  padding: '12px 24px',
                  borderRadius: '10px',
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  fontFamily: 'Rajdhani',
                  letterSpacing: '0.5px',
                  cursor: 'pointer',
                  boxShadow: '0 0 20px rgba(0, 240, 255, 0.4)',
                  transition: 'transform 0.2s',
                }}>
                VER QR CODE & CONECTAR
              </button>
            </div>
          </>
        )}

        {activeTab === 'mobile' && (
          <div style={{ maxWidth: '800px', margin: '0 auto', width: '100%' }}>
            <div className="glass-panel" style={{ textAlign: 'center', padding: '36px 24px' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
                <div style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '16px',
                  background: 'rgba(0, 240, 255, 0.1)',
                  border: '1px solid #00f0ff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 0 25px rgba(0, 240, 255, 0.3)'
                }}>
                  <Smartphone size={32} color="#00f0ff" />
                </div>
              </div>

              <h2 className="font-orbitron" style={{ fontSize: '1.6rem', fontWeight: 900, marginBottom: '8px' }}>
                PAREAMENTO COM DISPOSITIVO MÓVEL
              </h2>
              <p style={{ color: '#94a3b8', marginBottom: '24px', fontSize: '1rem' }}>
                Certifique-se de que seu celular está conectado na mesma rede Wi-Fi que este computador.
              </p>

              {/* QR Code Container */}
              {mobileInfo?.qrCodeDataUrl ? (
                <div style={{
                  display: 'inline-block',
                  padding: '16px',
                  background: '#0a0e17',
                  borderRadius: '20px',
                  border: '2px solid rgba(0, 240, 255, 0.4)',
                  boxShadow: '0 0 35px rgba(0, 240, 255, 0.25)',
                  marginBottom: '20px'
                }}>
                  <img 
                    src={mobileInfo.qrCodeDataUrl} 
                    alt="QR Code de conexão móvel" 
                    style={{ width: '220px', height: '220px', display: 'block', borderRadius: '12px' }} 
                  />
                </div>
              ) : (
                <div style={{ padding: '60px', color: '#64748b' }}>Gerando QR Code...</div>
              )}

              <div style={{ marginBottom: '24px' }}>
                <div style={{ fontSize: '0.85rem', color: '#64748b', textTransform: 'uppercase', marginBottom: '6px' }}>
                  Ou abra no navegador do seu smartphone:
                </div>
                <div style={{
                  fontFamily: 'monospace',
                  fontSize: '1.2rem',
                  color: '#00f0ff',
                  background: 'rgba(0, 0, 0, 0.4)',
                  display: 'inline-block',
                  padding: '8px 20px',
                  borderRadius: '8px',
                  border: '1px solid rgba(0, 240, 255, 0.2)'
                }}>
                  {mobileInfo?.url || 'http://192.168.x.x:3890'}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'center', gap: '16px' }}>
                <button
                  onClick={handleToggleMobileServer}
                  style={{
                    background: isMobileServerRunning ? 'rgba(255, 0, 85, 0.15)' : 'rgba(0, 255, 136, 0.15)',
                    border: isMobileServerRunning ? '1px solid #ff0055' : '1px solid #00ff88',
                    color: isMobileServerRunning ? '#ff0055' : '#00ff88',
                    padding: '10px 24px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: 700,
                    fontFamily: 'Rajdhani',
                    fontSize: '1rem',
                  }}>
                  {isMobileServerRunning ? 'Pausar Transmissão' : 'Iniciar Transmissão'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
