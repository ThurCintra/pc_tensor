import type { ReactNode } from 'react';
import type { Icon as PhosphorIcon } from '@phosphor-icons/react';

interface BentoCardProps {
  title: string;
  icon: PhosphorIcon;
  highlight?: boolean;
  className?: string;
  action?: ReactNode;
  children: ReactNode;
}

/** Moldura dos cards do Pit Wall, no visual dos cards do resto do app. */
export function BentoCard({ title, icon: Icon, highlight, className = '', action, children }: BentoCardProps) {
  return (
    <section className={`card min-h-0 gap-3 ${highlight ? 'highlight' : ''} ${className}`}>
      <header className="flex items-center gap-2">
        <h2 className="card-title flex-1">
          <Icon size={16} aria-hidden />
          {title}
        </h2>
        {action}
      </header>
      {children}
    </section>
  );
}

/** Número grande com unidade. */
export function BigValue({ value, unit, color }: { value: string; unit?: string; color?: string }) {
  return (
    <div
      className="font-display text-4xl leading-none font-semibold tabular-nums"
      style={color ? { color } : undefined}
    >
      {value}
      {unit && <span className="ml-1 text-base font-normal text-fg-2">{unit}</span>}
    </div>
  );
}

/** Barra de progresso fina (0–100). */
export function Bar({ pct, color }: { pct: number | null; color: string }) {
  const width = pct === null ? 0 : Math.max(0, Math.min(100, pct));
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-track" role="presentation">
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{ width: `${width}%`, background: color }}
      />
    </div>
  );
}

export function Muted({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`m-0 text-xs text-fg-3 ${className}`}>{children}</p>;
}
