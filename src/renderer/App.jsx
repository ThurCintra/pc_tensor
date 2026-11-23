import { useEffect, useState } from 'react';
import {
  ChartLineUp as LineChartIcon,
  Cpu,
  DeviceMobile,
  FlagCheckered,
  GearSix as SettingsIcon,
  ListBullets,
  PictureInPicture,
  SlidersHorizontal,
  SquaresFour,
} from '@phosphor-icons/react';
import { getTransport } from './lib/transport';
import { useTelemetry } from './hooks/useTelemetry';
import { useUpdates } from './hooks/useUpdates';
import { InfoBar } from './components/ui';
import { Logo } from './components/Logo';
import { MiniWidget } from './components/MiniWidget';
import { SessionReportDialog } from './components/SessionReportDialog';
import { Overview } from './pages/Overview';
import { History } from './pages/History';
import { Processes } from './pages/Processes';
import { Controls } from './pages/Controls';
import { Hardware } from './pages/Hardware';
import { Connection } from './pages/Connection';
import { Settings } from './pages/Settings';
import { PitWall } from './pit-wall/PitWall';

const PAGES = [
  { id: 'overview', label: 'Visão geral', short: 'Início', icon: SquaresFour },
  { id: 'pitwall', label: 'Pit Wall', short: 'Pit Wall', icon: FlagCheckered },
  { id: 'history', label: 'Histórico', short: 'Histórico', icon: LineChartIcon },
  { id: 'processes', label: 'Processos', short: 'Processos', icon: ListBullets },
  { id: 'controls', label: 'Controles', short: 'Controles', icon: SlidersHorizontal },
  { id: 'hardware', label: 'Hardware', short: 'Hardware', icon: Cpu },
];

const DESKTOP_PAGES = [
  { id: 'connection', label: 'Celular', short: 'Celular', icon: DeviceMobile, capability: 'connection' },
  { id: 'settings', label: 'Configurações', short: 'Ajustes', icon: SettingsIcon, capability: 'settings' },
];

const STATUS_BADGE = {
  online: ['Ao vivo', 'success'],
  connecting: ['Conectando', ''],
  offline: ['Reconectando', 'caution'],
  unauthorized: ['Não pareado', 'critical'],
};

// Lembra a última página aberta neste aparelho (conveniência local; falha silenciosa)
function readStoredPage() {
  try {
    return window.localStorage.getItem('pc-sentinel-page') || 'overview';
  } catch {
    return 'overview';
  }
}

function NavItem({ page, active, onClick }) {
  const Icon = page.icon;
  return (
    <button
      className={`nav-item ${active ? 'active' : ''}`}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
    >
      <Icon size={18} aria-hidden />
      <span className="nav-label-long">{page.label}</span>
      <span className="nav-label-short">{page.short}</span>
    </button>
  );
}

export default function App() {
  const transport = getTransport();
  const { metrics, history, status, sessionReport, dismissSessionReport } = useTelemetry();
  const [page, setPage] = useState(readStoredPage);
  const [miniMode, setMiniMode] = useState(false);
  const [appInfo, setAppInfo] = useState(null);
  const [notice, setNotice] = useState(null);
  const updates = useUpdates();
  const updateReady = updates.state?.status === 'downloaded';

  const extraPages = DESKTOP_PAGES.filter((p) => transport.capabilities[p.capability]);
  const allPages = [...PAGES, ...extraPages];
  const currentPage = allPages.some((p) => p.id === page) ? page : 'overview';

  useEffect(() => {
    if (transport.getAppInfo) transport.getAppInfo().then(setAppInfo);
  }, [transport]);

  const navigate = (id) => {
    setPage(id);
    try {
      window.localStorage.setItem('pc-sentinel-page', id);
    } catch {}
  };

  const toggleMini = async (toMini) => {
    setMiniMode(await transport.toggleMiniWidget(toMini));
  };

  const relaunchAsAdmin = async () => {
    const res = await transport.relaunchAsAdmin();
    if (!res?.success) setNotice(res?.message || 'Não foi possível reiniciar como administrador.');
  };

  if (miniMode) return <MiniWidget metrics={metrics} onExpand={() => toggleMini(false)} />;

  if (transport.mode === 'web' && status === 'unauthorized') {
    return (
      <div className="content pairing">
        <div className="card">
          <Logo size={40} className="brand-mark" />
          <h1>Pareie este aparelho</h1>
          <p className="muted">
            No PC, abra o PC Sentinel, vá em <b>Celular</b> e leia o QR Code com a câmera. Se o código foi trocado, leia
            o novo.
          </p>
        </div>
      </div>
    );
  }

  const [statusLabel, statusTone] = STATUS_BADGE[status] || STATUS_BADGE.connecting;
  const pageProps = { metrics, history, appInfo, updates, onNavigate: navigate, onRelaunchAsAdmin: relaunchAsAdmin };

  return (
    <div className="app">
      <nav className="sidebar" aria-label="Navegação principal">
        <div className="brand">
          <Logo size={22} className="brand-mark" />
          <div className="brand-text">
            <div className="brand-name">PC Sentinel</div>
            <span className={`status-dot ${statusTone}`} role="status" aria-label={statusLabel} title={statusLabel} />
          </div>
        </div>

        {PAGES.map((p) => (
          <NavItem key={p.id} page={p} active={currentPage === p.id} onClick={() => navigate(p.id)} />
        ))}

        <div className="nav-spacer" />

        {extraPages.map((p) => (
          <NavItem key={p.id} page={p} active={currentPage === p.id} onClick={() => navigate(p.id)} />
        ))}
        {transport.capabilities.miniWidget && (
          <button className="nav-item nav-desktop-only" onClick={() => toggleMini(true)}>
            <PictureInPicture size={18} aria-hidden />
            <span className="nav-label-long">Modo compacto</span>
            <span className="nav-label-short">Compacto</span>
          </button>
        )}
      </nav>

      <main className="content">
        {(status === 'offline' || notice || updateReady) && (
          <div className="page page-notices">
            {status === 'offline' && (
              <InfoBar tone="caution" title="Sem conexão com o PC.">
                Tentando reconectar…
              </InfoBar>
            )}
            {updateReady && (
              <InfoBar
                title={`PC Sentinel ${updates.state.availableVersion} pronto para instalar.`}
                actions={
                  <button className="btn accent" onClick={updates.install}>
                    Reiniciar e atualizar
                  </button>
                }
              >
                A atualização também é instalada na próxima vez que o app for fechado.
              </InfoBar>
            )}
            {notice && (
              <InfoBar tone="caution" onDismiss={() => setNotice(null)}>
                {notice}
              </InfoBar>
            )}
          </div>
        )}

        {currentPage === 'overview' && <Overview {...pageProps} />}
        {currentPage === 'history' && <History {...pageProps} lastReport={sessionReport} />}
        {currentPage === 'processes' && <Processes {...pageProps} />}
        {currentPage === 'controls' && <Controls {...pageProps} />}
        {currentPage === 'hardware' && <Hardware {...pageProps} />}
        {currentPage === 'connection' && <Connection {...pageProps} />}
        {currentPage === 'settings' && <Settings {...pageProps} />}
        {currentPage === 'pitwall' && <PitWall />}
      </main>

      {sessionReport && <SessionReportDialog report={sessionReport} onClose={dismissSessionReport} />}
    </div>
  );
}
