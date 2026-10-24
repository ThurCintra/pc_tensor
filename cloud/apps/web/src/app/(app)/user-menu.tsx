'use client';

import { LogOut } from 'lucide-react';
import { signOut } from 'next-auth/react';

export function UserMenu({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="hidden max-w-48 truncate text-fg-2 sm:inline" title={name}>
        {name}
      </span>
      <button
        onClick={() => void signOut({ redirectTo: '/entrar' })}
        title="Sair"
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-fg-2 hover:bg-surface-2 hover:text-fg"
      >
        <LogOut size={16} aria-hidden /> <span className="sr-only sm:not-sr-only">Sair</span>
      </button>
    </div>
  );
}
