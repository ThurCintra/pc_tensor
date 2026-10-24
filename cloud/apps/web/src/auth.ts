import NextAuth, { type DefaultSession } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import GitHub from 'next-auth/providers/github';
import Google from 'next-auth/providers/google';
import type { Provider } from 'next-auth/providers';
import { getDb } from '@pc-tensor/db';
import { upsertOAuthUser, verifyCredentials } from './server/users';
import { limits } from './server/rate-limit';

declare module 'next-auth' {
  interface Session {
    user: { id: string } & DefaultSession['user'];
  }
}

/** Google e GitHub só entram se as credenciais estiverem configuradas. */
const providers: Provider[] = [
  Credentials({
    credentials: { email: { label: 'E-mail', type: 'email' }, password: { label: 'Senha', type: 'password' } },
    async authorize(credentials, request) {
      const email = typeof credentials?.email === 'string' ? credentials.email : '';
      const password = typeof credentials?.password === 'string' ? credentials.password : '';
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'desconhecido';
      try {
        limits.auth.consume(`login:${ip}`);
        limits.auth.consume(`login:${email.toLowerCase()}`);
      } catch {
        return null; // limite estourado: o Auth.js responde "credenciais inválidas"
      }
      const user = await verifyCredentials(getDb(), email, password);
      return user && { id: user.id, name: user.name, email: user.email, image: user.image };
    },
  }),
];
if (process.env.AUTH_GOOGLE_ID) providers.push(Google);
if (process.env.AUTH_GITHUB_ID) providers.push(GitHub);

/**
 * O Auth.js pega o e-mail principal do GitHub sem olhar se ele foi verificado. Sem essa conferência,
 * alguém poderia criar um GitHub com o e-mail de outra pessoa e entrar na conta dela.
 */
async function githubEmailVerified(
  accessToken: string | undefined,
  email: string | null | undefined,
): Promise<boolean> {
  if (!accessToken || !email) return false;
  const response = await fetch('https://api.github.com/user/emails', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'pc-tensor',
    },
  });
  if (!response.ok) return false;
  const emails = (await response.json()) as { email: string; verified: boolean }[];
  return emails.some((e) => e.verified && e.email.toLowerCase() === email.toLowerCase());
}

export const oauthProviders = {
  google: Boolean(process.env.AUTH_GOOGLE_ID),
  github: Boolean(process.env.AUTH_GITHUB_ID),
};

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  // JWT: a sessão não precisa de consulta ao banco a cada página; dura 30 dias e renova com o uso
  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: '/entrar', error: '/entrar' },
  trustHost: true,
  callbacks: {
    async signIn({ user, account, profile }) {
      if (!account || account.provider === 'credentials') return true;
      // Google informa email_verified no perfil; no GitHub é preciso consultar a lista de e-mails da conta
      const emailVerified =
        account.provider === 'github'
          ? await githubEmailVerified(account.access_token, user.email)
          : profile?.email_verified === true;
      const appUser = await upsertOAuthUser(getDb(), {
        provider: account.provider,
        providerAccountId: account.providerAccountId,
        email: user.email ?? '',
        emailVerified,
        name: user.name ?? null,
        image: user.image ?? null,
      });
      // A partir daqui o id é o do nosso banco, não o do provedor
      user.id = appUser.id;
      return true;
    },
    jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
});
