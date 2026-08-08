import type { Metadata, Viewport } from 'next';

import { publicEnv } from '@/lib/env';

import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(publicEnv.siteUrl),
  title: {
    default: 'AfriOrbit Learning — Satellite & IoT Engineering Training',
    template: '%s · AfriOrbit Learning',
  },
  description:
    'Hands-on CubeSat and satellite-to-IoT engineering training from AfriOrbit Space, built around the EduSat platform and IoT edge device.',
  openGraph: {
    type: 'website',
    siteName: 'AfriOrbit Learning',
    title: 'AfriOrbit Learning',
    description:
      'Hands-on CubeSat and satellite-to-IoT engineering training built around the EduSat platform.',
  },
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
      <body className="min-h-dvh antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-ion-600 focus:px-4 focus:py-2 focus:text-white"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
