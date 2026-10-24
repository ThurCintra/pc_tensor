'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { Alert, Button, Input } from '@/components/ui';
import { apiFetch } from '@/lib/api';
import { OAuthButtons } from '../oauth-buttons';

export function RegisterForm({ oauth }: { oauth: { google: boolean; github: boolean } }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') ?? '');
    const email = String(form.get('email') ?? '');
    const password = String(form.get('password') ?? '');
    if (password !== form.get('confirm')) {
      setError('As senhas não conferem.');
      return;
    }

    setError(null);
    setLoading(true);
    try {
      await apiFetch('/api/auth/register', { method: 'POST', body: { name, email, password } });
      const result = await signIn('credentials', { email, password, redirect: false });
      if (result?.error) throw new Error('Conta criada, mas não foi possível entrar. Tente pela tela de login.');
      router.replace('/computadores');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível criar a conta.');
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold">Criar conta</h1>
        <p className="mt-1 text-sm text-fg-2">Grátis. Depois é só parear os seus PCs.</p>
      </div>

      {error && <Alert>{error}</Alert>}

      <form onSubmit={submit} className="flex flex-col gap-4">
        <Input label="Nome" name="name" autoComplete="name" required maxLength={80} autoFocus />
        <Input label="E-mail" name="email" type="email" autoComplete="email" required />
        <Input
          label="Senha"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          hint="Pelo menos 10 caracteres. Uma frase é mais fácil de lembrar e mais segura."
        />
        <Input
          label="Confirmar senha"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
        />
        <Button type="submit" loading={loading}>
          Criar conta
        </Button>
      </form>

      <OAuthButtons providers={oauth} />

      <p className="text-center text-sm text-fg-2">
        Já tem conta?{' '}
        <Link href="/entrar" className="font-medium text-accent hover:underline">
          Entrar
        </Link>
      </p>
    </div>
  );
}
