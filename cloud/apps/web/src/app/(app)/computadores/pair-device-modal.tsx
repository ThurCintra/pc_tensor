'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Copy, RefreshCw } from 'lucide-react';
import type { DeviceSummary } from '@/server/devices';
import { Alert, Button, Modal } from '@/components/ui';
import { apiFetch } from '@/lib/api';

type Phase =
  | { kind: 'loading' }
  | { kind: 'code'; code: string; expiresAt: number }
  | { kind: 'expired' }
  | { kind: 'paired'; device: DeviceSummary }
  | { kind: 'error'; message: string };

const POLL_MS = 2500;

/**
 * "Adicionar computador": mostra o código de 6 dígitos (5 minutos) e espera o PC aparecer na conta.
 * A espera consulta a lista a cada 2,5 s; o status pelo tempo real costuma chegar antes.
 */
export function PairDeviceModal({
  open,
  onClose,
  knownIds,
  reload,
  siteUrl,
}: {
  open: boolean;
  onClose: () => void;
  knownIds: string[];
  reload: () => Promise<DeviceSummary[]>;
  siteUrl: string | null;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [now, setNow] = useState(() => Date.now());
  const known = useRef<string[]>(knownIds);

  const generate = useCallback(async () => {
    setPhase({ kind: 'loading' });
    try {
      const { code, expiresAt } = await apiFetch<{ code: string; expiresAt: string }>('/api/pairing-codes', {
        method: 'POST',
      });
      setPhase({ kind: 'code', code, expiresAt: new Date(expiresAt).getTime() });
    } catch (err) {
      setPhase({ kind: 'error', message: err instanceof Error ? err.message : 'Não foi possível gerar o código.' });
    }
  }, []);

  // Abriu: guarda os PCs que já existiam e gera o código
  useEffect(() => {
    if (!open) return;
    known.current = knownIds;
    void generate();
    // knownIds de propósito fora: só a lista do momento em que o modal abriu conta como "antiga"
  }, [open, generate]);

  // Relógio da contagem regressiva e espera do PC novo
  useEffect(() => {
    if (!open || phase.kind !== 'code') return undefined;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const poll = setInterval(async () => {
      if (Date.now() >= phase.expiresAt) {
        setPhase({ kind: 'expired' });
        return;
      }
      const devices = await reload().catch(() => null);
      const fresh = devices?.find((d) => !known.current.includes(d.id));
      if (fresh) setPhase({ kind: 'paired', device: fresh });
    }, POLL_MS);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [open, phase, reload]);

  const address = siteUrl ?? (typeof window !== 'undefined' ? window.location.origin : '');

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={phase.kind === 'paired' ? 'Computador vinculado' : 'Adicionar computador'}
    >
      {phase.kind === 'loading' && <p className="py-8 text-center text-sm text-fg-2">Gerando código…</p>}

      {phase.kind === 'error' && (
        <>
          <Alert>{phase.message}</Alert>
          <Button onClick={() => void generate()}>Tentar de novo</Button>
        </>
      )}

      {phase.kind === 'code' && (
        <>
          <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm text-fg-2">
            <li>
              No PC, abra o <strong className="text-fg">PC Sentinel</strong> e vá em{' '}
              <strong className="text-fg">Configurações → pc_tensor Cloud</strong>.
            </li>
            <li>
              Em endereço do site, use <CopyText text={address} />
            </li>
            <li>Digite o código abaixo e clique em Vincular.</li>
          </ol>

          <div className="flex flex-col items-center gap-2 rounded-xl bg-surface-2 py-5">
            <div className="flex gap-2" aria-label={`Código ${phase.code.split('').join(' ')}`}>
              {phase.code.split('').map((digit, i) => (
                <span
                  key={i}
                  className="flex h-14 w-11 items-center justify-center rounded-lg border border-line bg-surface font-mono text-3xl font-semibold"
                  aria-hidden
                >
                  {digit}
                </span>
              ))}
            </div>
            <Countdown remainingMs={phase.expiresAt - now} />
          </div>

          <p className="flex items-center justify-center gap-2 text-sm text-fg-2" role="status">
            <span className="size-2 animate-pulse-dot rounded-full bg-accent" aria-hidden /> Esperando o computador…
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => void generate()}>
              <RefreshCw size={14} aria-hidden /> Gerar outro
            </Button>
          </div>
        </>
      )}

      {phase.kind === 'expired' && (
        <>
          <Alert tone="warn">O código expirou. Por segurança ele vale só 5 minutos.</Alert>
          <Button onClick={() => void generate()}>Gerar novo código</Button>
        </>
      )}

      {phase.kind === 'paired' && (
        <>
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <CheckCircle2 size={48} className="text-ok" aria-hidden />
            <div>
              <p className="text-lg font-semibold">{phase.device.name}</p>
              <p className="mt-1 text-sm text-fg-2">
                {[
                  phase.device.cpuModel,
                  phase.device.gpuModel,
                  phase.device.totalRamGb && `${phase.device.totalRamGb} GB`,
                ]
                  .filter(Boolean)
                  .join(' · ') || 'Hardware detectado ao conectar'}
              </p>
            </div>
          </div>
          <Button onClick={onClose}>Concluir</Button>
        </>
      )}
    </Modal>
  );
}

function Countdown({ remainingMs }: { remainingMs: number }) {
  const total = Math.max(0, Math.ceil(remainingMs / 1000));
  const text = `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  return (
    <p className={`text-xs ${total <= 30 ? 'text-warn' : 'text-fg-3'}`}>
      Expira em <span className="font-mono tabular-nums">{text}</span>
    </p>
  );
}

function CopyText({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="inline-flex max-w-full items-center gap-1 rounded-md bg-surface-2 px-2 py-0.5 font-mono text-xs text-fg hover:bg-line"
      title="Copiar"
    >
      <span className="truncate">{text}</span>
      <Copy size={12} aria-hidden />
      <span className="sr-only">{copied ? 'Copiado' : 'Copiar endereço'}</span>
      {copied && <span className="text-ok">copiado</span>}
    </button>
  );
}
