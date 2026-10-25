import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts', 'apps/*/src/**/*.test.ts'],
    environment: 'node',
    // PGlite sobe um PostgreSQL em WASM por arquivo de teste; alguns segundos é normal
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
