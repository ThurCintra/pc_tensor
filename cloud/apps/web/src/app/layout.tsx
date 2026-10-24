import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono-face', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'pc_tensor Cloud', template: '%s · pc_tensor Cloud' },
  description: 'Seus computadores em tempo real, de qualquer lugar: temperaturas, consumo e alertas.',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0b0f14' },
    { media: '(prefers-color-scheme: light)', color: '#f5f7fa' },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${mono.variable}`}>
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
