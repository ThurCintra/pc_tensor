'use client';

import { useState } from 'react';
import { CheckCircle2, Rocket, XCircle } from 'lucide-react';
import type { Command, CommandResult } from '@pc-tensor/protocol';
import { BentoCard, Muted } from './bento';

interface StutterBusterCardProps {
  online: boolean;
  send: (command: Command) => Promise<CommandResult>;
  highlight?: boolean;
  className?: string;
}

interface StepResult {
  label: string;
  ok: boolean;
  message: string;
}

type RunState = { kind: 'idle' } | { kind: 'running'; step: string } | { kind: 'done'; steps: StepResult[] };

/** As duas ações da allowlist que formam o Stutter Buster, na ordem em que rodam. */
export const STUTTER_STEPS: readonly { label: string; command: Command }[] = [
  { label: 'Memória', command: { action: 'ACTION_CLEAN_RAM' } },
  { label: 'Prioridades', command: { action: 'ACTION_OPTIMIZE_PRIORITY' } },
];

/**
 * Stutter Buster remoto: pede ao PC para esvaziar a lista standby da RAM e baixar a prioridade de apps em segundo
 * plano por 5 minutos. São dois comandos da allowlist do agente; nada além disso sai do site.
 */
export function StutterBusterCard({ online, send, highlight, className }: StutterBusterCardProps) {
  const [state, setState] = useState<RunState>({ kind: 'idle' });

  async function run() {
    const steps: StepResult[] = [];
    for (const step of STUTTER_STEPS) {
      setState({ kind: 'running', step: step.label });
      try {
        const result = await send(step.command);
        steps.push({ label: step.label, ok: result.ok, message: result.message });
      } catch (err) {
        steps.push({ label: step.label, ok: false, message: err instanceof Error ? err.message : 'Falhou.' });
      }
    }
    setState({ kind: 'done', steps });
  }

  return (
    <BentoCard title="Stutter Buster" icon={Rocket} highlight={highlight} className={className}>
      <button
        type="button"
        className="min-h-12 w-full rounded-lg bg-accent px-4 py-2 text-base font-semibold text-accent-fg transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
        disabled={!online || state.kind === 'running'}
        onClick={() => void run()}
      >
        {state.kind === 'running' ? `Liberando: ${state.step.toLowerCase()}…` : 'Acabar com os engasgos'}
      </button>
      {state.kind === 'done' ? (
        <ul className="flex flex-col gap-1.5 text-sm" aria-live="polite">
          {state.steps.map((s) => (
            <li key={s.label} className="flex items-start gap-1.5">
              {s.ok ? (
                <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-ok" aria-label="Feito" />
              ) : (
                <XCircle size={16} className="mt-0.5 shrink-0 text-warn" aria-label="Não feito" />
              )}
              <span className="text-fg-2">{s.message}</span>
            </li>
          ))}
        </ul>
      ) : (
        <Muted>
          {online
            ? 'Esvazia o cache de memória do Windows e baixa a prioridade de navegadores e launchers por 5 minutos. A limpeza da memória exige o PC Sentinel aberto como administrador.'
            : 'Disponível com o PC ligado e conectado.'}
        </Muted>
      )}
    </BentoCard>
  );
}
