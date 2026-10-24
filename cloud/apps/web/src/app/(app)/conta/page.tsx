import type { Metadata } from 'next';
import { getDb } from '@pc-tensor/db';
import { auth } from '@/auth';
import { getUser } from '@/server/users';
import { AccountForm } from './account-form';

export const metadata: Metadata = { title: 'Conta' };

export default async function AccountPage() {
  const session = await auth();
  const user = await getUser(getDb(), session!.user.id);
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Conta</h1>
        <p className="mt-1 text-sm text-fg-2">Seus dados e a tarifa usada no cálculo da conta de luz.</p>
      </div>
      <AccountForm user={user} />
    </div>
  );
}
