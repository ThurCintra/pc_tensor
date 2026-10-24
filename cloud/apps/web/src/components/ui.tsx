'use client';

import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { Loader2, X } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-strong',
  secondary: 'border border-line bg-surface-2 text-fg hover:border-fg-3',
  ghost: 'text-fg-2 hover:bg-surface-2 hover:text-fg',
  danger: 'border border-crit/40 text-crit hover:bg-crit-bg',
};

export function Button({
  variant = 'primary',
  loading = false,
  className = '',
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 size={16} className="animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string | null }
>(function Input({ label, hint, error, className = '', id, ...props }, ref) {
  const generated = useId();
  const inputId = id ?? generated;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium text-fg-2">
        {label}
      </label>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`h-10 rounded-lg border bg-surface px-3 text-sm text-fg outline-none transition-colors placeholder:text-fg-3 focus:border-accent ${
          error ? 'border-crit' : 'border-line'
        } ${className}`}
        {...props}
      />
      {error ? (
        <p id={`${inputId}-error`} className="text-xs text-crit">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${inputId}-hint`} className="text-xs text-fg-3">
            {hint}
          </p>
        )
      )}
    </div>
  );
});

export function Alert({ tone = 'crit', children }: { tone?: 'crit' | 'ok' | 'warn'; children: ReactNode }) {
  const tones = {
    crit: 'border-crit/30 bg-crit-bg text-crit',
    ok: 'border-ok/30 bg-ok-bg text-ok',
    warn: 'border-warn/30 bg-warn-bg text-warn',
  };
  return (
    <div role={tone === 'crit' ? 'alert' : 'status'} className={`rounded-lg border px-3 py-2 text-sm ${tones[tone]}`}>
      {children}
    </div>
  );
}

export function Card({ className = '', children }: { className?: string; children: ReactNode }) {
  return <div className={`rounded-xl border border-line bg-surface ${className}`}>{children}</div>;
}

export function Logo({ className = '', compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold tracking-tight ${className}`}>
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
        <rect x="2" y="4" width="20" height="14" rx="3" fill="none" stroke="currentColor" strokeWidth="2" />
        <path
          d="M6 13l3-3 3 2 4-5 2 2"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M8 21h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      pc_tensor <span className={`font-normal text-fg-3 ${compact ? 'hidden sm:inline' : ''}`}>Cloud</span>
    </span>
  );
}

/** Modal acessível com <dialog> nativo: foco preso, Esc fecha, fundo escurecido. */
export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-auto w-[min(440px,calc(100vw-32px))] rounded-2xl border border-line bg-surface p-0 text-fg shadow-2xl backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      {open && (
        <div className="flex flex-col gap-5 p-6">
          <div className="flex items-start justify-between gap-4">
            <h2 id={titleId} className="text-lg font-semibold">
              {title}
            </h2>
            <button
              onClick={onClose}
              className="rounded-md p-1 text-fg-3 hover:bg-surface-2 hover:text-fg"
              aria-label="Fechar"
            >
              <X size={18} />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
