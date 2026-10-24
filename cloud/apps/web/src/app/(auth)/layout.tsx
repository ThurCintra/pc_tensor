import type { ReactNode } from 'react';
import { Logo } from '@/components/ui';

/** Telas de conta: cartão central sobre uma grade discreta. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10">
      <div className="grid-backdrop pointer-events-none absolute inset-0 opacity-60" aria-hidden />
      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex justify-center text-xl">
          <Logo />
        </div>
        <div className="rounded-2xl border border-line bg-surface/90 p-6 shadow-xl backdrop-blur sm:p-8">
          {children}
        </div>
        <p className="mt-6 text-center text-xs text-fg-3">
          Temperaturas, consumo e alertas dos seus PCs, de qualquer lugar.
        </p>
      </div>
    </main>
  );
}
