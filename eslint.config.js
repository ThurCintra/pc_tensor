const js = require('@eslint/js');
const globals = require('globals');
const reactHooks = require('eslint-plugin-react-hooks');
const prettier = require('eslint-config-prettier');

module.exports = [
  { ignores: ['dist/', 'release/', 'coverage/', 'resources/', 'node_modules/'] },

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

  // Service worker do PWA
  {
    files: ['src/renderer/public/sw.js'],
    languageOptions: { sourceType: 'script', globals: globals.serviceworker },
  },

  // Testes (Vitest com require de módulos CommonJS)
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      sourceType: 'module',
      globals: { ...globals.node, ...globals.vitest },
    },
  },

  {
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },

  prettier,
];
