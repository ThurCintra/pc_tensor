import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // Só a CLI (migrate deploy) usa esta URL; a aplicação recebe a conexão em createDb()
  datasource: { url: process.env.DATABASE_URL ?? 'postgresql://localhost:5432/pc_tensor' },
});
