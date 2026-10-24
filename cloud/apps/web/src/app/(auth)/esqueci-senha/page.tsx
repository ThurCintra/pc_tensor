'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Alert, Button, Input } from '@/components/ui';
import { apiFetch } from '@/lib/api';

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await apiFetch('/api/auth/password/forgot', {
        method: 'POST',
        body: { email: String(new FormData(event.currentTarget).get('email') ?? '') },
      });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível enviar agora.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold">Esqueci minha senha</h1>
        <p className="mt-1 text-sm text-fg-2">Enviamos um link para criar uma nova senha.</p>
      </div>

      {sent ? (
        <Alert tone="ok">
          Se houver uma conta com esse e-mail, o link chega em alguns minutos. Ele vale por 1 hora.
        </Alert>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          {error && <Alert>{error}</Alert>}
          <Input label="E-mail da conta" name="email" type="email" autoComplete="email" required autoFocus />
          <Button type="submit" loading={loading}>
            Enviar link
          </Button>
        </form>
      )}

      <p className="text-center text-sm">
        <Link href="/entrar" className="text-accent hover:underline">
          Voltar para o login
        </Link>
      </p>
    </div>
  );
}
