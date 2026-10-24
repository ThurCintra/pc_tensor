import { redirect } from 'next/navigation';
import { auth } from '@/auth';

/** A raiz leva direto para os computadores (logado) ou para o login. */
export default async function Home() {
  const session = await auth();
  redirect(session?.user?.id ? '/computadores' : '/entrar');
}
