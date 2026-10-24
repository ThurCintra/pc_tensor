const js = require('@eslint/js');
const globals = require('globals');
const reactHooks = require('eslint-plugin-react-hooks');
const prettier = require('eslint-config-prettier');
const tseslint = require('typescript-eslint');

module.exports = [
  // cloud/ é um projeto à parte (Next.js + servidor de tempo real), verificado pelo tsc e testes de lá
  { ignores: ['dist/', 'release/', 'coverage/', 'resources/', 'node_modules/', 'cloud/'] },

  js.configs.recommended,

  // Processo principal, servidor do celular, preload e scripts (Node + CommonJS)
  {
    files: ['src/main/**/*.js', 'src/server/**/*.js', 'src/preload/**/*.js', 'scripts/**/*.js', '*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: globals.node,
    },
  },

  // Configurações do Vite/Vitest (ESM)
  {
    files: ['**/*.mjs'],
    languageOptions: { sourceType: 'module', globals: globals.node },
  },

  // Interface React (navegador + ESM)
  {
    files: ['src/renderer/**/*.{js,jsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: reactHooks.configs.recommended.rules,
  },

  // Camada de tempo real em TypeScript (contrato v2 com o serviço .NET)
  ...tseslint.configs.recommended.map((config) => ({ ...config, files: ['**/*.ts', '**/*.tsx'] })),
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: { globals: globals.browser },
    rules: reactHooks.configs.recommended.rules,
  },

  // Service worker do PWA
  {
    files: ['src/renderer/public/sw.js'],
    languageOptions: { sourceType: 'script', globals: globals.serviceworker },
  },

  // Testes (Vitest com require de módulos CommonJS)
  {
    files: ['tests/**/*.{js,ts,tsx}'],
    languageOptions: {
      sourceType: 'module',
      globals: { ...globals.node, ...globals.vitest },
    },
  },

  {
    rules: { 'no-empty': ['error', { allowEmptyCatch: true }] },
  },
  {
    files: ['**/*.{js,jsx,mjs}'],
    rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }] },
  },
  {
    files: ['**/*.{ts,tsx}'],
    rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }] },
  },

  prettier,
];
