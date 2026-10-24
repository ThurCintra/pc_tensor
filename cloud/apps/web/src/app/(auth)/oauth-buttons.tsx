'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { Button } from '@/components/ui';

const PROVIDERS = [
  {
    id: 'google',
    label: 'Continuar com Google',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
        <path
          fill="#EA4335"
          d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.8-5.5 3.8-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.2 14.6 2.2 12 2.2 6.6 2.2 2.3 6.6 2.3 12s4.3 9.8 9.7 9.8c5.6 0 9.3-3.9 9.3-9.5 0-.6-.1-1.1-.2-1.6H12z"
        />
      </svg>
    ),
  },
  {
    id: 'github',
    label: 'Continuar com GitHub',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden fill="currentColor">
        <path d="M12 2C6.5 2 2 6.6 2 12.2c0 4.5 2.9 8.3 6.8 9.6.5.1.7-.2.7-.5v-1.7c-2.8.6-3.4-1.4-3.4-1.4-.5-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.6 2.4 1.1 2.9.9.1-.7.4-1.1.7-1.4-2.2-.3-4.6-1.1-4.6-5 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.7 0 0 .8-.3 2.8 1a9.4 9.4 0 0 1 5 0c1.9-1.3 2.8-1 2.8-1 .5 1.4.2 2.4.1 2.7.6.7 1 1.6 1 2.7 0 3.9-2.4 4.7-4.6 5 .4.3.7.9.7 1.9v2.8c0 .3.2.6.7.5 4-1.3 6.8-5.1 6.8-9.6C22 6.6 17.5 2 12 2z" />
      </svg>
    ),
  },
] as const;

/** Botões de login social, só para os provedores configurados no servidor. */
export function OAuthButtons({ providers }: { providers: { google: boolean; github: boolean } }) {
  const [pending, setPending] = useState<string | null>(null);
  const enabled = PROVIDERS.filter((p) => providers[p.id]);
  if (enabled.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 text-xs text-fg-3">
        <span className="h-px flex-1 bg-line" /> ou <span className="h-px flex-1 bg-line" />
      </div>
      {enabled.map((p) => (
        <Button
          key={p.id}
          variant="secondary"
          loading={pending === p.id}
          onClick={() => {
            setPending(p.id);
            void signIn(p.id, { redirectTo: '/computadores' });
          }}
        >
          {pending !== p.id && p.icon}
          {p.label}
        </Button>
      ))}
    </div>
  );
}
