'use client';

import { useState, type FormEvent } from 'react';
import type { PublicUser } from '@/server/users';
import { Alert, Button, Card, Input } from '@/components/ui';
import { apiFetch } from '@/lib/api';

export function AccountForm({ user }: { user: PublicUser }) {
  const [message, setMessage] = useState<{ tone: 'ok' | 'crit'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const tariff = Number(String(form.get('kwhTariff') ?? '').replace(',', '.'));
    if (!Number.isFinite(tariff) || tariff < 0 || tariff > 10) {
      setMessage({ tone: 'crit', text: 'Tarifa deve estar entre R$ 0 e R$ 10 por kWh.' });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      await apiFetch('/api/me', { method: 'PATCH', body: { name: String(form.get('name') ?? ''), kwhTariff: tariff } });
      setMessage({ tone: 'ok', text: 'Dados salvos.' });
    } catch (err) {
      setMessage({ tone: 'crit', text: err instanceof Error ? err.message : 'Não foi possível salvar.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-6">
      <form onSubmit={save} className="flex flex-col gap-4">
        {message && <Alert tone={message.tone}>{message.text}</Alert>}
        <Input label="Nome" name="name" defaultValue={user.name} required maxLength={80} />
        <Input
          label="E-mail"
          value={user.email}
          readOnly
          disabled
          hint={user.hasPassword ? undefined : 'Conta criada com Google ou GitHub.'}
        />
        <Input
          label="Tarifa de energia (R$ por kWh)"
          name="kwhTariff"
          inputMode="decimal"
          defaultValue={user.kwhTariff.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
          hint="Está na sua conta de luz, já com impostos. Usada no taxímetro de cada PC."
          required
        />
        <div className="flex justify-end">
          <Button type="submit" loading={saving}>
            Salvar
          </Button>
        </div>
      </form>
    </Card>
  );
}
