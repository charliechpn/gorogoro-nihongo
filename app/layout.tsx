import type { Metadata } from 'next';
import './globals.css';
import './theme.css';

export const metadata: Metadata = {
  title: 'GoroGoro Nihongo | Japanese practice',
  description: 'Practice kanji and vocabulary at your own pace.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="light" data-language="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: "try{document.documentElement.dataset.theme=localStorage.getItem('nihongo-theme')==='dark'?'dark':'light'}catch{}" }} />
        <script dangerouslySetInnerHTML={{ __html: "try{var language=localStorage.getItem('gorogoro-language')==='pt'?'pt':'en';document.documentElement.dataset.language=language;document.documentElement.lang=language==='pt'?'pt-BR':'en'}catch{}" }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
