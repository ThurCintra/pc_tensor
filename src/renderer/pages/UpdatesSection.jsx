import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowUpCircle, CheckCircle2, Download, ExternalLink, Info, RefreshCw } from 'lucide-react';
import { Badge, Meter, Switch } from '../components/ui';
import { getTransport } from '../lib/transport';
import { describeUpdateState } from '../hooks/useUpdates';

/** Ícone, cor e etiqueta de cada estado do UpdateService (src/main/updater.js). */
const LOOK = {
  unsupported: { icon: Info, tone: '', badge: 'Só no app instalado' },
  idle: { icon: RefreshCw, tone: '', badge: null },
  checking: { icon: RefreshCw, tone: '', badge: 'Verificando', spin: true },
  downloading: { icon: Download, tone: 'caution', badge: 'Baixando' },
  downloaded: { icon: ArrowUpCircle, tone: 'success', badge: 'Pronta para instalar' },
  'up-to-date': { icon: CheckCircle2, tone: 'success', badge: 'Atualizado' },
  error: { icon: AlertTriangle, tone: 'critical', badge: 'Falhou' },
};

const ICON_COLOR = { success: 'var(--success)', caution: 'var(--caution)', critical: 'var(--critical)' };

/** "agora há pouco", "há 5 min", "há 2 h", "em 24/10 às 13:42". */
export function lastCheckedText(checkedAt, now = Date.now()) {
  if (!checkedAt) return 'Ainda não verificado nesta sessão';
  const minutes = Math.floor((now - checkedAt) / 60_000);
  if (minutes < 1) return 'Verificado agora há pouco';
  if (minutes < 60) return `Verificado há ${minutes} min`;
  if (minutes < 24 * 60) return `Verificado há ${Math.floor(minutes / 60)} h`;
  const date = new Date(checkedAt);
  return `Verificado em ${date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

/**
 * Seção "Atualizações" das Configurações: versão instalada, estado da busca com o progresso do download,
 * botões de verificar/instalar, link para as novidades e a opção de procurar sozinho ao abrir o app.
 */
export function UpdatesSection({ appInfo, updates, checkOnStartup, onCheckOnStartupChange }) {
  const transport = getTransport();
  const state = updates?.state;
  const status = state?.status ?? 'idle';
  const look = LOOK[status] ?? LOOK.idle;
  const Icon = look.icon;
  const version = appInfo?.version || state?.currentVersion || '';
  const supported = status !== 'unsupported';
  const busy = !state || ['unsupported', 'checking', 'downloading'].includes(status);
  const notesVersion = state?.availableVersion || version;

  // Atualiza o "verificado há…" sozinho
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex flex-col gap-1">
      <div className="setting" style={{ alignItems: 'flex-start' }}>
        <div className="flex min-w-0 flex-1 gap-3">
          <Icon
            size={28}
            className={`mt-0.5 shrink-0 ${look.spin ? 'animate-spin' : ''}`}
            style={{ color: ICON_COLOR[look.tone] || 'var(--accent)' }}
            aria-hidden
          />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-base font-semibold">PC Sentinel {version}</span>
              {look.badge && (
                <Badge tone={look.tone} dot={status === 'downloaded'}>
                  {look.badge}
                </Badge>
              )}
            </div>
            <div className="setting-desc" role="status" aria-live="polite">
              {describeUpdateState(state)}
            </div>
            {status === 'downloading' && (
              <Meter value={state.percent ?? 0} label={`Download da versão ${state.availableVersion || 'nova'}`} />
            )}
            {status === 'downloaded' && (
              <div className="setting-desc">
                O app fecha, instala em segundos e abre de novo. Suas configurações e o histórico continuam.
              </div>
            )}
            {supported && <div className="setting-desc">{lastCheckedText(state?.checkedAt, now)}</div>}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          {status === 'downloaded' ? (
            <button className="btn accent" onClick={updates.install}>
              Reiniciar e atualizar
            </button>
          ) : (
            <button className="btn" onClick={updates?.check} disabled={busy}>
              <RefreshCw size={14} className={status === 'checking' ? 'animate-spin' : ''} aria-hidden />
              {status === 'checking' ? 'Verificando…' : 'Verificar agora'}
            </button>
          )}
          {transport.openReleaseNotes && (
            <button className="btn subtle" onClick={() => transport.openReleaseNotes(notesVersion)}>
              <ExternalLink size={14} aria-hidden />
              {state?.availableVersion ? `Novidades da ${state.availableVersion}` : 'Novidades desta versão'}
            </button>
          )}
        </div>
      </div>

      <div className="setting">
        <div className="setting-text">
          <div>Procurar atualizações ao abrir o app</div>
          <div className="setting-desc">
            {checkOnStartup
              ? 'Procura alguns segundos depois de abrir e baixa em segundo plano; instala quando você reiniciar o app.'
              : 'Desligado: o app só procura quando você clicar em "Verificar agora".'}
          </div>
        </div>
        <Switch checked={checkOnStartup} disabled={!supported} onChange={onCheckOnStartupChange} />
      </div>
    </div>
  );
}
