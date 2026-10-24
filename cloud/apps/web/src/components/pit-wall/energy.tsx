import Link from 'next/link';
import { Zap } from 'lucide-react';
import type { TelemetryFrame } from '@/lib/telemetry';
import { liveMonthWh, monthFraction, projectMonth, type MonthEnergy } from '@/lib/energy';
import { BentoCard, Muted, Stat } from './bento';
import { brl, num } from './format';

export type { MonthEnergy };

interface EnergyCardProps {
  frame: TelemetryFrame;
  tariff: number;
  month: MonthEnergy | null;
  now: number;
  highlight?: boolean;
  className?: string;
}

/**
 * Taxímetro: custo da sessão em reais atualizado 4 vezes por segundo, o custo por hora no ritmo atual e o mês
 * (somado dos resumos gravados na nuvem) com projeção até o fim do mês, tudo pela tarifa da conta.
 */
export function EnergyCard({ frame, tariff, month, now, highlight, className }: EnergyCardProps) {
  const e = frame.energy;
  const sessionCost = e.sessionKwh * tariff;
  const perHour = (e.systemPowerW / 1000) * tariff;
  const monthWh = month ? liveMonthWh(month, e.sessionKwh) : null;
  const monthCost = monthWh === null ? null : (monthWh / 1000) * tariff;
  const projection = projectMonth(monthCost, month ? monthFraction(month.since, now) : 0);

  return (
    <BentoCard title="Taxímetro de energia" icon={Zap} highlight={highlight} className={className}>
      <div>
        <div className="text-xs text-fg-3">Esta sessão</div>
        <div
          className="font-mono text-4xl font-semibold text-accent tabular-nums"
          title={`${num(e.sessionKwh, 4)} kWh`}
        >
          {brl(sessionCost)}
        </div>
      </div>
      <dl className="grid grid-cols-3 gap-2 text-sm">
        <Stat label="Agora" value={`${num(e.systemPowerW)} W`} />
        <Stat label="Por hora" value={brl(perHour)} />
        <Stat label="No mês" value={brl(monthCost)} />
      </dl>
      <Muted className="mt-auto">
        {projection !== null && <>Projeção do mês {brl(projection)} · </>}
        {monthWh !== null && <>{num(monthWh / 1000, monthWh < 10_000 ? 2 : 1)} kWh no mês · </>}
        Tarifa {brl(tariff)}/kWh (
        <Link href="/conta" className="text-accent underline">
          alterar
        </Link>
        ) · CPU + GPU + {num(e.baseLoadW)} W estimados do resto do PC
      </Muted>
    </BentoCard>
  );
}
