import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { auth, oauthProviders } from '@/auth';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Entrar' };

/** Mensagens para os códigos de erro que o Auth.js põe na URL (?error=). */
const AUTH_ERRORS: Record<string, string> = {
  CredentialsSignin: 'E-mail ou senha incorretos.',
  AccessDenied: 'Não foi possível entrar com essa conta. O e-mail precisa estar verificado no provedor.',
  OAuthAccountNotLinked: 'Este e-mail já tem conta. Entre com a senha.',
  Configuration: 'Login indisponível no momento. Tente de novo.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; redefinida?: string }>;
}) {
  if ((await auth())?.user?.id) redirect('/computadores');
  const { error, redefinida } = await searchParams;
  return (
    <LoginForm
      oauth={oauthProviders}
      initialError={error ? (AUTH_ERRORS[error] ?? 'Não foi possível entrar. Tente de novo.') : null}
      passwordReset={redefinida === '1'}
    />
  );
}
