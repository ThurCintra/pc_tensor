'use client';

import { Suspense, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Alert, Button, Input } from '@/components/ui';
import { apiFetch } from '@/lib/api';

function ResetForm() {
  const token = useSearchParams().get('token') ?? '';
  const router = useRouter();
  const [error, setError] = useState<string | null>(token ? null : 'Link incompleto. Abra o link do e-mail de novo.');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password') ?? '');
    if (password !== form.get('confirm')) {
      setError('As senhas não conferem.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await apiFetch('/api/auth/password/reset', { method: 'POST', body: { token, password } });
      router.replace('/entrar?redefinida=1');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível trocar a senha.');
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {error && <Alert>{error}</Alert>}
      <Input
        label="Nova senha"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={10}
        autoFocus
        hint="Pelo menos 10 caracteres."
      />
      <Input
        label="Confirmar nova senha"
        name="confirm"
        type="password"
        autoComplete="new-password"
        required
        minLength={10}
      />
      <Button type="submit" loading={loading} disabled={!token}>
        Salvar nova senha
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold">Nova senha</h1>
        <p className="mt-1 text-sm text-fg-2">Escolha a senha que vai usar daqui para frente.</p>
      </div>
      <Suspense>
        <ResetForm />
      </Suspense>
      <p className="text-center text-sm">
        <Link href="/esqueci-senha" className="text-accent hover:underline">
          Pedir outro link
        </Link>
      </p>
    </div>
  );
}
