import React from 'react';
import { Zap, Gauge, Music, SkipBack, SkipForward, Play, Volume1, Volume2, VolumeX, X } from 'lucide-react';
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
  { command: 'PLAY_PAUSE', label: 'Reproduzir / pausar', icon: Play },
  { command: 'NEXT_TRACK', label: 'Próxima faixa', icon: SkipForward },
  { command: 'VOLUME_DOWN', label: 'Diminuir volume', icon: Volume1 },
  { command: 'VOLUME_UP', label: 'Aumentar volume', icon: Volume2 },
  { command: 'MUTE_VOLUME', label: 'Silenciar', icon: VolumeX },
];

export function Controls() {
  const { run, busy, result, clearResult } = useAction();

  return (
    <div className="page">
      <PageHeader title="Controles" subtitle="Atalhos para comandar o PC daqui" />

      {result && (
        <InfoBar tone={result.tone} actions={<button className="btn subtle" onClick={clearResult} aria-label="Fechar"><X size={14} /></button>}>
          {result.message}
        </InfoBar>
      )}

      <Card title="Mídia" icon={Music}>
        <div className="btn-group">
          {MEDIA.map(({ command, label, icon: Icon }) => (
            <button
              key={command}
              className="btn"
              title={label}
              aria-label={label}
              disabled={busy === command}
              onClick={() => run('MEDIA_AUDIO_CONTROL', { command }, command)}
              style={{ minWidth: 48 }}
            >
              <Icon size={16} />
            </button>
          ))}
        </div>
      </Card>

      <Card title="Plano de energia" icon={Gauge}>
        <div className="btn-group">
          {POWER_PLANS.map((plan) => (
            <button key={plan.id} className="btn" disabled={busy === plan.id} onClick={() => run('SET_POWER_PLAN', { plan: plan.id }, plan.id)}>
              {plan.label}
            </button>
          ))}
        </div>
        <p className="faint" style={{ margin: '10px 0 0', fontSize: 12 }}>
          "Desempenho máximo" só aparece no Windows se o plano tiver sido habilitado no sistema.
        </p>
      </Card>

      <Card title="Modo Boost" icon={Zap}>
        <p className="muted" style={{ marginTop: 0 }}>
          Fecha apps em segundo plano da sua lista (Discord, Spotify, OneDrive…) para liberar memória antes de jogar.
        </p>
        <button className="btn accent" disabled={busy === 'BOOST_CLEANUP'} onClick={() => run('BOOST_CLEANUP')}>
          <Zap size={14} />
          {busy === 'BOOST_CLEANUP' ? 'Liberando…' : 'Liberar memória'}
        </button>
      </Card>
    </div>
  );
}
