import type { Metadata, Viewport } from 'next';

import { ThemeScript } from '@/components/theme';

import './globals.css';

export const metadata: Metadata = {
  title: { default: 'AfriOrbit Simulators', template: '%s · AfriOrbit Simulators' },
  description:
    'Engineering sandboxes built on AfriOrbit flight hardware and CAD. They run in your browser; every configuration becomes a shareable link.',
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: '#05070d',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
