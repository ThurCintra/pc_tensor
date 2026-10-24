import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // cloud/ tem as próprias dependências, configuração e testes (npm test dentro de cloud/)
    exclude: ['**/node_modules/**', 'cloud/**'],
  },
});
