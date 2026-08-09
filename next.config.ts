import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // Security headers are set per-request in src/proxy.ts so the CSP can vary
  // between the app and the embeddable surface. The few static headers below
  // cover assets that bypass the proxy matcher.
  async headers() {
    return [
      {
        source: '/embed.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Access-Control-Allow-Origin', value: '*' },
          {
            key: 'Cache-Control',
            value: 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
          },
        ],
      },
      {
        source: '/:path*',
        headers: [{ key: 'X-Content-Type-Options', value: 'nosniff' }],
      },
    ];
  },

  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: 'www.afriorbit.space' },
    ],
  },

  experimental: {
    // Keeps server action payloads small; lab narratives are the largest input.
    serverActions: { bodySizeLimit: '2mb' },
  },

  // Lint is run separately (`npm run lint`) — Next 16 no longer runs ESLint
  // during `next build`.
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
