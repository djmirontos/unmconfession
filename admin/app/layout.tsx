import type { Metadata, Viewport } from 'next';
import { Public_Sans } from 'next/font/google';
import { connection } from 'next/server';

import { Toaster } from '@/components/ui/sonner';

import './globals.css';

// Self-hosted at build time by next/font (no request to Google from the browser).
const publicSans = Public_Sans({ variable: '--font-public-sans', subsets: ['latin'] });

export const metadata: Metadata = {
  title: { default: 'Moderation panel', template: '%s · UNM Freedom Confessions' },
  description: 'Moderation and administration for UNM Freedom Confessions.',
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  // Same policy as the header: 'no-referrer' would make form POSTs send Origin: null (see next.config.ts).
  referrer: 'same-origin',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // The on-screen keyboard shrinks the layout (Android), so sticky dialog footers stay above it.
  // Zoom stays allowed; inputs use 16 px text on phones so iOS does not zoom on focus.
  interactiveWidget: 'resizes-content',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#03224b' },
    { media: '(prefers-color-scheme: dark)', color: '#061a38' },
  ],
};

export default async function RootLayout({ children }: LayoutProps<'/'>) {
  // Every page renders per request so the proxy's CSP nonce reaches Next.js's scripts.
  await connection();
  return (
    <html lang="en" className={`${publicSans.variable} h-full antialiased`}>
      <body className="min-h-full">
        {children}
        <Toaster position="top-right" />
      </body>
    </html>
  );
}
