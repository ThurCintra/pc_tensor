import { useState } from 'react';
import { Rocket } from 'lucide-react';
import type { HelloData, StutterBusterResult } from '../realtime/protocol';
import type { SentinelStore } from '../realtime/sentinel-store';
import { BentoCard, Muted } from './BentoCard';
import { num } from './format';

interface StutterBusterCardProps {
  store: SentinelStore;
  hello: HelloData | null;
  online: boolean;
  highlight?: boolean;
  className?: string;
}

type RunState =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'done'; result: StutterBusterResult }
  | { kind: 'error'; message: string };

/** Modo pânico contra engasgos: limpa a lista standby da RAM e rebaixa apps de segundo plano por 5 min. */
export function StutterBusterCard({ store, hello, online, highlight, className }: StutterBusterCardProps) {
  const [state, setState] = useState<RunState>({ kind: 'idle' });
  const available = hello?.capabilities.stutterBuster ?? false;

  const run = async () => {
    setState({ kind: 'running' });
    try {
      setState({ kind: 'done', result: await store.stutterBuster() });
    } catch (err) {
      setState({ kind: 'error', message: err instanceof Error ? err.message : 'Falhou.' });
    }
  };

  return (
    <BentoCard title="Stutter Buster" icon={Rocket} highlight={highlight} className={className}>
      <button
        type="button"
        className="btn accent min-h-12 w-full text-base font-semibold"
        disabled={!online || !available || state.kind === 'running'}
        onClick={run}
      >
        {state.kind === 'running' ? 'Liberando…' : 'Acabar com os engasgos'}
      </button>
      {state.kind === 'done' && <ResultText result={state.result} />}
      {state.kind === 'error' && <p className="m-0 text-sm text-crit">{state.message}</p>}
      {state.kind === 'idle' && (
        <Muted>
          {available
            ? 'Esvazia o cache de memória do Windows e baixa a prioridade de navegadores e launchers por 5 minutos.'
            : 'Disponível com o PC Sentinel aberto como administrador.'}
        </Muted>
      )}
    </BentoCard>
  );
}

function ResultText({ result }: { result: StutterBusterResult }) {
  const memory = result.standbyPurged
    ? `${num(result.standbyFreedMb)} MB de cache liberados`
    : (result.standbyError ?? 'Cache de memória não foi limpo');
  const apps =
    result.deprioritized.length > 0
      ? `${result.deprioritized.length} apps em segundo plano: ${result.deprioritized.join(', ')}`
      : 'nenhum app em segundo plano para rebaixar';
  return (
    <p className="m-0 text-sm text-fg-2">
      <span className={result.standbyPurged ? 'text-ok' : 'text-warn'}>{memory}</span>; {apps}. Volta ao normal em{' '}
      {Math.round(result.restoreAfterS / 60)} min.
    </p>
  );
}
