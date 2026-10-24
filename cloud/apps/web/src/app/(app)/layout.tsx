import type { ReactNode } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { Logo } from '@/components/ui';
import { UserMenu } from './user-menu';

/** Área logada: sem sessão volta para o login. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect('/entrar');

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4 sm:gap-6">
          <Link href="/computadores" aria-label="Início">
            <Logo compact />
          </Link>
          <nav className="flex gap-1 text-sm" aria-label="Principal">
            <Link
              href="/computadores"
              className="rounded-md px-2 py-1.5 text-fg-2 sm:px-3 hover:bg-surface-2 hover:text-fg"
            >
              Computadores
            </Link>
            <Link href="/conta" className="rounded-md px-2 py-1.5 text-fg-2 sm:px-3 hover:bg-surface-2 hover:text-fg">
              Conta
            </Link>
          </nav>
          <div className="ml-auto">
            <UserMenu name={session.user.name ?? session.user.email ?? 'Conta'} />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
