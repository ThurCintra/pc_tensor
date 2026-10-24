import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { auth, oauthProviders } from '@/auth';
import { RegisterForm } from './register-form';

export const metadata: Metadata = { title: 'Criar conta' };

export default async function RegisterPage() {
  if ((await auth())?.user?.id) redirect('/computadores');
  return <RegisterForm oauth={oauthProviders} />;
}
