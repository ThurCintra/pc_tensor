import { useCallback, useEffect, useState } from 'react';
import { Moon, Sun } from '@phosphor-icons/react';
import { Badge, Card as UiCard, EmptyState, PageHeader, Section, Setting, Switch } from '../components/ui';
import { useSentinel } from '../realtime/useSentinel';
import type { CrashReport } from '../realtime/flight-recorder';
import type { TelemetryFrame } from '../realtime/protocol';
import type { SentinelStore } from '../realtime/sentinel-store';
import { EfficiencyCard, LagJudgeCard, MaintenanceCard, ThermalCard, VramCard } from './cards';
import { EnergyCard } from './EnergyCard';
import { StutterBusterCard } from './StutterBusterCard';
import { XRayCard } from './XRayCard';
import { PostMortem } from './PostMortem';
import { PROFILE_LABELS, SIZE_CLASSES, layoutFor, type CardSlot } from './layout';
import { useOledShift, usePersistentToggle, useWakeLock, type WakeLockStatus } from './useWakeLock';

const STATUS_TONE = {
  idle: 'caution',
  connecting: 'caution',
  online: 'success',
  stalled: 'critical',
  offline: 'caution',
} as const;

const STATUS_TEXT = {
  idle: 'Procurando o serviço do PC…',
  connecting: 'Conectando ao PC…',
  online: 'Ao vivo',
  stalled: 'O PC parou de responder',
  offline: 'Sem conexão: tentando de novo',
} as const;

/**
 * Pit Wall: o HUD de "engenheiro de box" com o contrato v2 do serviço nativo.
 * O layout do Bento Grid acompanha o perfil do app em foco no PC, sem recarregar a página.
 */
export function PitWall() {
  const { status, hello, frame, frameAt, alerts, crash, store } = useSentinel();
  // Alerta recente = chegou até 15 s antes do último quadro (comparação pura, sem ler o relógio na renderização)
  const latestAlert = alerts[0];
  const recentAlert =
    latestAlert && frameAt !== null && frameAt - latestAlert.receivedAt < 15_000 ? latestAlert.message : null;
  const profile = frame?.context.profile ?? 'IDLE';
  const slots = layoutFor(profile);

  const closeCrash = useCallback(() => store.dismissCrash(), [store]);
  const deleteCrash = useCallback(async () => {
    if (crash) await store.recorder.deleteReport(crash.report.id);
    store.dismissCrash();
  }, [crash, store]);

  // HUD de mesa: tela sempre acesa enquanto o PC está ao vivo, e proteção contra burn-in no OLED
  const [keepAwake, setKeepAwake] = usePersistentToggle('pc-sentinel-wake-lock', true);
  const [oled, setOled] = usePersistentToggle('pc-sentinel-oled', false);
  const wakeLock = useWakeLock(keepAwake && status === 'online');
  const [shiftX, shiftY] = useOledShift(oled);

  useEffect(() => {
    if (!oled) return undefined;
    document.documentElement.classList.add('oled-guard');
    return () => document.documentElement.classList.remove('oled-guard');
  }, [oled]);

  return (
    <div
      className={`page${oled ? ' oled-shift' : ''}`}
      style={oled ? { transform: `translate(${shiftX}px, ${shiftY}px)` } : undefined}
      data-testid="pit-wall"
    >
      <PageHeader
        title="Pit Wall"
        subtitle={
          frame
            ? `${PROFILE_LABELS[profile]}${frame.context.foregroundExe ? ` · ${frame.context.foregroundExe}` : ''}`
            : 'Telemetria ao vivo do PC, alertas e caixa preta'
        }
      >
        <HudControls
          keepAwake={keepAwake}
          onKeepAwake={setKeepAwake}
          wakeLock={wakeLock}
          oled={oled}
          onOled={setOled}
        />
      </PageHeader>

      <StatusBar status={status} alert={recentAlert} />

      {frame ? (
        <div className="[display:grid] grid-flow-dense auto-rows-[minmax(140px,auto)] grid-cols-2 gap-4 md:grid-cols-4">
          {slots.map((slot) => (
            <Card key={slot.id} slot={slot} frame={frame} store={store} hello={hello} online={status === 'online'} />
          ))}
        </div>
      ) : (
        <UiCard>
          <EmptyState>
            {status === 'idle'
              ? 'O serviço nativo do PC Sentinel ainda não respondeu. No PC, abra o app; no celular, leia o QR Code de novo.'
              : 'Aguardando a primeira leitura…'}
          </EmptyState>
        </UiCard>
      )}

      <BlackBox store={store} refreshKey={crash?.report.id ?? null} />
      <HapticToggle store={store} />

      {crash && <PostMortem crash={crash} onClose={closeCrash} onDelete={deleteCrash} />}
    </div>
  );
}

function Card({
  slot,
  frame,
  store,
  hello,
  online,
}: {
  slot: CardSlot;
  frame: TelemetryFrame;
  store: SentinelStore;
  hello: ReturnType<typeof useSentinel>['hello'];
  online: boolean;
}) {
  const props = { frame, highlight: slot.highlight, className: SIZE_CLASSES[slot.size] };
  switch (slot.id) {
    case 'cpu':
    case 'gpu':
      return <ThermalCard component={slot.id} {...props} />;
    case 'lag':
      return <LagJudgeCard {...props} />;
    case 'vram':
      return <VramCard {...props} />;
    case 'maintenance':
      return <MaintenanceCard {...props} />;
    case 'efficiency':
      return <EfficiencyCard {...props} />;
    case 'xray':
      return <XRayCard {...props} />;
    case 'energy':
      return <EnergyCard {...props} store={store} />;
    case 'stutter':
      return (
        <StutterBusterCard
          store={store}
          hello={hello}
          online={online}
          highlight={slot.highlight}
          className={props.className}
        />
      );
  }
}

const WAKE_LOCK_HINT: Record<WakeLockStatus, string> = {
  active: 'Tela sempre ativa: o celular não apaga a tela enquanto o PC está ao vivo.',
  idle: 'Tela sempre ativa: liga quando o PC estiver ao vivo.',
  denied: 'O navegador recusou manter a tela acesa (economia de bateria?). Tenta de novo ao voltar para a aba.',
  unsupported: 'Este navegador não permite manter a tela acesa.',
};

/** Controles do HUD de mesa: tela sempre ativa (Wake Lock) e proteção OLED. */
function HudControls({
  keepAwake,
  onKeepAwake,
  wakeLock,
  oled,
  onOled,
}: {
  keepAwake: boolean;
  onKeepAwake: (value: boolean) => void;
  wakeLock: WakeLockStatus;
  oled: boolean;
  onOled: (value: boolean) => void;
}) {
  const wakeLockOn = keepAwake && wakeLock !== 'unsupported';
  return (
    <>
      <button
        type="button"
        className="btn subtle toggle"
        aria-pressed={wakeLockOn}
        disabled={wakeLock === 'unsupported'}
        title={keepAwake ? WAKE_LOCK_HINT[wakeLock] : 'Tela sempre ativa: desligada.'}
        onClick={() => onKeepAwake(!keepAwake)}
      >
        <Sun size={14} aria-hidden />
        Tela sempre ativa
        {keepAwake && wakeLock === 'active' && <span className="sr-only"> (ativa agora)</span>}
      </button>
      <button
        type="button"
        className="btn subtle toggle"
        aria-pressed={oled}
        title="Fundo preto absoluto e um deslocamento de 1 px por minuto para não marcar telas OLED."
        onClick={() => onOled(!oled)}
      >
        <Moon size={14} aria-hidden />
        Proteção OLED
      </button>
    </>
  );
}

function StatusBar({ status, alert }: { status: keyof typeof STATUS_TEXT; alert: string | null }) {
  return (
    <div className="cluster" role="status" aria-live="polite">
      <Badge tone={STATUS_TONE[status]} dot>
        {STATUS_TEXT[status]}
      </Badge>
      {alert && <span className="text-sm font-semibold text-warn">{alert}</span>}
    </div>
  );
}

/** Relatórios de travamento guardados neste aparelho. */
function BlackBox({ store, refreshKey }: { store: SentinelStore; refreshKey: string | null }) {
  const [reports, setReports] = useState<Omit<CrashReport, 'frames'>[]>([]);

  useEffect(() => {
    let active = true;
    store.recorder
      .listReports()
      .then((list) => active && setReports(list))
      .catch(() => active && setReports([]));
    return () => {
      active = false;
    };
  }, [store, refreshKey]);

  if (reports.length === 0) return null;
  return (
    <Section title="Caixa preta">
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {reports.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              className="btn subtle w-full justify-between"
              onClick={() => void store.openReport(r.id)}
            >
              <span>Queda em {new Date(r.lastFrameAt).toLocaleString('pt-BR')}</span>
              <span className="text-fg-3">Abrir Post-Mortem</span>
            </button>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function HapticToggle({ store }: { store: SentinelStore }) {
  const [enabled, setEnabled] = useState(store.haptics.enabled);
  if (!store.haptics.supported) return null;
  return (
    <Setting title="Vibrar com alertas durante jogos" description="Neste celular, cada alerta do PC vira uma vibração">
      <Switch
        checked={enabled}
        onChange={(checked) => {
          store.haptics.setEnabled(checked);
          setEnabled(checked);
        }}
      />
    </Setting>
  );
}
