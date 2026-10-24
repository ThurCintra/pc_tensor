import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

interface BentoCardProps {
  title: string;
  icon: LucideIcon;
  highlight?: boolean;
  className?: string;
  action?: ReactNode;
  children: ReactNode;
}

/** Moldura dos cards do Pit Wall, no visual dos cards do resto do app. */
export function BentoCard({ title, icon: Icon, highlight, className = '', action, children }: BentoCardProps) {
  return (
    <section
      className={`flex min-h-0 flex-col gap-3 rounded-card border bg-card p-4 transition-[border-color,box-shadow] duration-300 ${
        highlight ? 'border-accent shadow-[0_0_0_1px_var(--accent)]' : 'border-line'
      } ${className}`}
    >
      <header className="flex items-center gap-2 text-sm font-semibold text-fg-2">
        <Icon size={16} aria-hidden />
        <h2 className="m-0 flex-1 text-sm font-semibold">{title}</h2>
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
