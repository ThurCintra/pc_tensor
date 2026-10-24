import { useState, type FormEvent } from 'react';
import { Zap } from 'lucide-react';
import type { TelemetryFrame } from '../realtime/protocol';
import type { SentinelStore } from '../realtime/sentinel-store';
import { BentoCard, Muted } from './BentoCard';
import { brl, num } from './format';

interface EnergyCardProps {
  frame: TelemetryFrame;
  store: SentinelStore;
  highlight?: boolean;
  className?: string;
}

/**
 * Taxímetro: custo da sessão em reais atualizado 4 vezes por segundo, com consumo do mês e a tarifa
 * editável (salva no serviço pelo comando SET_ENERGY_CONFIG).
 */
export function EnergyCard({ frame, store, highlight, className }: EnergyCardProps) {
  const e = frame.energy;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const startEdit = () => {
    setDraft(e.tariffBrlPerKwh.toLocaleString('pt-BR', { minimumFractionDigits: 2 }));
    setError(null);
    setEditing(true);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const tariff = Number(draft.replace(/\./g, '').replace(',', '.'));
    if (!Number.isFinite(tariff)) {
      setError('Digite um valor como 0,95.');
      return;
    }
    try {
      await store.setEnergyConfig({ tariffBrlPerKwh: tariff });
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar.');
    }
  };

  return (
    <BentoCard title="Taxímetro de energia" icon={Zap} highlight={highlight} className={className}>
      <div>
        <div className="text-xs text-fg-3">Esta sessão</div>
        <div
          className="font-mono text-4xl font-semibold tabular-nums text-accent"
          aria-live="off"
          title={`${num(e.sessionKwh, 4)} kWh`}
        >
          {brl(e.sessionCostBrl)}
        </div>
      </div>
      <dl className="m-0 [display:grid] grid-cols-3 gap-2 text-sm">
        <div>
          <dt className="text-xs text-fg-3">Agora</dt>
          <dd className="m-0 font-semibold tabular-nums">{num(e.systemPowerW)} W</dd>
        </div>
        <div>
          <dt className="text-xs text-fg-3">No mês</dt>
          <dd className="m-0 font-semibold tabular-nums">{brl(e.monthCostBrl)}</dd>
        </div>
        <div>
          <dt className="text-xs text-fg-3">Consumo do mês</dt>
          <dd className="m-0 font-semibold tabular-nums">{num(e.monthKwh, e.monthKwh < 10 ? 2 : 1)} kWh</dd>
        </div>
      </dl>

      {editing ? (
        <form onSubmit={save} className="flex flex-wrap items-center gap-2 text-sm">
          <label htmlFor="tariff" className="text-fg-2">
            Tarifa (R$/kWh)
          </label>
          <input
            id="tariff"
            className="input w-24"
            inputMode="decimal"
            value={draft}
            onChange={(ev) => setDraft(ev.target.value)}
            autoFocus
          />
          <button type="submit" className="btn accent">
            Salvar
          </button>
          <button type="button" className="btn subtle" onClick={() => setEditing(false)}>
            Cancelar
          </button>
          {error && <span className="w-full text-crit">{error}</span>}
        </form>
      ) : (
        // mt-auto: a tarifa fica no rodapé quando o card ocupa duas linhas da grade
        <Muted className="mt-auto">
          Tarifa {brl(e.tariffBrlPerKwh)}/kWh ·{' '}
          <button
            type="button"
            className="cursor-pointer border-0 bg-transparent p-0 text-accent underline"
            onClick={startEdit}
          >
            alterar
          </button>{' '}
          · CPU + GPU + {num(e.baseLoadW)} W estimados do resto do PC
        </Muted>
      )}
    </BentoCard>
  );
}
