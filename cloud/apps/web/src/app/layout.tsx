import type { ReactNode } from 'react';

export const metadata = {
  title: 'pc_tensor Cloud',
  description: 'Seus computadores em tempo real, de qualquer lugar.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
