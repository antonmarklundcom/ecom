import type { Metadata } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: 'Tienda PY',
  description: 'Tienda online paraguaya. Precios en guaraníes, IVA incluido.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-PY">
      <body>{children}</body>
    </html>
  );
}
