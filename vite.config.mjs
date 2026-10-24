import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const root = import.meta.dirname;

// CSP só no build: em desenvolvimento o Vite injeta scripts inline para o hot reload.
// connect-src libera WebSocket/HTTP da mesma origem (celular falando com o PC).
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "connect-src 'self' ws: wss:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
].join('; ');

const cspPlugin = {
  name: 'pc-sentinel-csp',
  apply: 'build',
  transformIndexHtml: () => [
    {
      tag: 'meta',
      attrs: { 'http-equiv': 'Content-Security-Policy', content: CONTENT_SECURITY_POLICY },
      injectTo: 'head-prepend',
    },
  ],
};

export default defineConfig({
  plugins: [react(), cspPlugin],
  root: path.join(root, 'src/renderer'),
  base: './',
  build: {
    outDir: path.join(root, 'dist'),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
