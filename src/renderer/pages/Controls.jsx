import {
  Gauge,
  Lightning,
  MusicNotes,
  PlayPause,
  SkipBack,
  SkipForward,
  SpeakerHigh,
  SpeakerLow,
  SpeakerX,
} from '@phosphor-icons/react';
import { PageHeader, Card, InfoBar } from '../components/ui';
import { useAction } from '../hooks/useAction';

const POWER_PLANS = [
  { id: 'SAVER', label: 'Economia de energia' },
  { id: 'BALANCED', label: 'Equilibrado' },
  { id: 'HIGH_PERFORMANCE', label: 'Alto desempenho' },
  { id: 'ULTIMATE', label: 'Desempenho máximo' },
];

const MEDIA = [
  { command: 'PREV_TRACK', label: 'Faixa anterior', icon: SkipBack },
  { command: 'PLAY_PAUSE', label: 'Reproduzir / pausar', icon: PlayPause },
  { command: 'NEXT_TRACK', label: 'Próxima faixa', icon: SkipForward },
  { command: 'VOLUME_DOWN', label: 'Diminuir volume', icon: SpeakerLow },
  { command: 'VOLUME_UP', label: 'Aumentar volume', icon: SpeakerHigh },
  { command: 'MUTE_VOLUME', label: 'Silenciar', icon: SpeakerX },
];

export function Controls() {
  const { run, busy, result, clearResult } = useAction();

  return (
    <div className="page">
      <PageHeader title="Controles" subtitle="Atalhos para comandar o PC daqui" />

      {result && (
        <InfoBar tone={result.tone} onDismiss={clearResult}>
          {result.message}
        </InfoBar>
      )}

      <Card title="Mídia" icon={MusicNotes}>
        <div className="btn-group">
          {MEDIA.map(({ command, label, icon: Icon }) => (
            <button
              key={command}
              className="btn icon large"
              title={label}
              aria-label={label}
              disabled={busy === command}
              onClick={() => run('MEDIA_AUDIO_CONTROL', { command }, command)}
            >
              <Icon size={16} />
            </button>
          ))}
        </div>
      </Card>

      <Card
        title="Plano de energia"
        icon={Gauge}
        footer={
          <p className="hint">
            &ldquo;Desempenho máximo&rdquo; só aparece no Windows se o plano tiver sido habilitado no sistema.
          </p>
        }
      >
        <div className="btn-group">
          {POWER_PLANS.map((plan) => (
            <button
              key={plan.id}
              className="btn"
              disabled={busy === plan.id}
              onClick={() => run('SET_POWER_PLAN', { plan: plan.id }, plan.id)}
            >
              {plan.label}
            </button>
          ))}
        </div>
      </Card>

      <Card title="Modo Boost" icon={Lightning}>
        <div className="stack">
          <p className="muted">
            Fecha apps em segundo plano da sua lista (Discord, Spotify, OneDrive…) para liberar memória antes de jogar.
          </p>
          <div>
            <button className="btn accent" disabled={busy === 'BOOST_CLEANUP'} onClick={() => run('BOOST_CLEANUP')}>
              <Lightning size={14} />
              {busy === 'BOOST_CLEANUP' ? 'Liberando…' : 'Liberar memória'}
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}
