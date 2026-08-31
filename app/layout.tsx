import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Nihongo | Treinos de japonês',
  description: 'Pratique kanji e vocabulário em modos de estudo independentes.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
