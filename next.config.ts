import type { NextConfig } from 'next';

// Static export of the simulators only, served by the LMS at /sims/
// (same origin as lms.afriorbit.space, so lessons can iframe it).
// basePath must match the URL prefix or every /_next/ asset 404s.
const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
  basePath: '/sims',
  reactStrictMode: true,
  poweredByHeader: false,
  images: { unoptimized: true },
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
