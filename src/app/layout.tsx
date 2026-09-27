import type { Metadata, Viewport } from 'next';
import { Be_Vietnam_Pro, Bricolage_Grotesque } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const body = Be_Vietnam_Pro({
  variable: '--font-body',
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '600', '700', '800'],
});
const display = Bricolage_Grotesque({
  variable: '--font-display',
  subsets: ['latin', 'vietnamese'],
});

export const metadata: Metadata = {
  title: 'Neon Arcade',
  description: 'Tetris, cờ vua, cờ tướng, caro, tiến lên, cờ tỉ phú và vài game khác.',
};

export const viewport: Viewport = {
  themeColor: '#0e1015',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="vi" className={`${body.variable} ${display.variable} h-full antialiased`}>
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
