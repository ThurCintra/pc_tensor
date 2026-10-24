import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Pacotes do monorepo são TypeScript puro; o Next compila junto
  transpilePackages: ['@pc-tensor/protocol', '@pc-tensor/db'],
  // Binários nativos ficam fora do bundle
  serverExternalPackages: ['@node-rs/argon2', '@prisma/client', '@prisma/adapter-pg'],
  poweredByHeader: false,
};

export default nextConfig;
