import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Pacotes do monorepo são TypeScript puro; o Next compila junto
  transpilePackages: ['@pc-tensor/protocol', '@pc-tensor/db'],
  // Binários nativos ficam fora do bundle
  serverExternalPackages: ['@node-rs/argon2', '@prisma/client', '@prisma/adapter-pg'],
  poweredByHeader: false,
  // Sem o AGENTS.md que o Next gera para assistentes de IA (o repositório não guarda arquivos de agentes)
  agentRules: false,
};

export default nextConfig;
