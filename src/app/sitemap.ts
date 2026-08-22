import type { MetadataRoute } from 'next';

import { ROUTES as MARKETING_ROUTES } from '@/content/marketing';
import { publicEnv } from '@/lib/env';

/** Public LMS routes worth indexing. Signed-in areas are excluded by the proxy. */
const APP_ROUTES = ['/', '/catalog', '/catalog/simulators', '/cohorts', '/verify', '/register'];

export default function sitemap(): MetadataRoute.Sitemap {
  const base = publicEnv.siteUrl.replace(/\/+$/, '');
  return [...APP_ROUTES, ...MARKETING_ROUTES].map((path) => ({
    url: `${base}${path === '/' ? '' : path}`,
    changeFrequency: 'monthly' as const,
    priority: path === '/' || path === '/home' ? 1 : 0.7,
  }));
}
