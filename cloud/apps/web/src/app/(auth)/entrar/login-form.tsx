'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { Alert, Button, Input } from '@/components/ui';
import { OAuthButtons } from '../oauth-buttons';

export function LoginForm({
  oauth,
  initialError,
  passwordReset,
}: {
  oauth: { google: boolean; github: boolean };
  initialError: string | null;
  passwordReset: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState(initialError);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    const form = new FormData(event.currentTarget);
    const result = await signIn('credentials', {
      email: form.get('email'),
      password: form.get('password'),
      redirect: false,
    });
    setLoading(false);
    if (result?.error) {
      setError('E-mail ou senha incorretos. Muitas tentativas seguidas bloqueiam o login por 1 minuto.');
      return;
    }
    router.replace('/computadores');
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold">Entrar</h1>
        <p className="mt-1 text-sm text-fg-2">Acesse os seus computadores.</p>
      </div>

      {passwordReset && <Alert tone="ok">Senha alterada. Entre com a nova senha.</Alert>}
      {error && <Alert>{error}</Alert>}

      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Input label="E-mail" name="email" type="email" autoComplete="email" required autoFocus />
        <Input label="Senha" name="password" type="password" autoComplete="current-password" required />
        <div className="-mt-1 text-right">
          <Link href="/esqueci-senha" className="text-xs text-accent hover:underline">
            Esqueci minha senha
          </Link>
        </div>
        <Button type="submit" loading={loading}>
          Entrar
        </Button>
      </form>

      <OAuthButtons providers={oauth} />

      <p className="text-center text-sm text-fg-2">
        Não tem conta?{' '}
        <Link href="/cadastrar" className="font-medium text-accent hover:underline">
          Criar conta
        </Link>
      </p>
    </div>
  );
}
