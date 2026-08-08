import { NextResponse, type NextRequest } from 'next/server';

import { publicEnv, serverEnv } from '@/lib/env';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import type { Course } from '@/types/db';

export const runtime = 'nodejs';
export const revalidate = 300;

/**
 * Public JSON feed of published courses, for the marketing site or any partner
 * who wants to render the catalogue themselves.
 *
 * Only published-course fields that already appear on the public catalogue are
 * exposed. CORS is restricted to the configured embed origins.
 */
export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin');
  const allowed = serverEnv.embedAllowedOrigins;
  const corsOrigin = origin && allowed.includes(origin) ? origin : allowed[0];

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('courses')
    .select(
      'slug, title, subtitle, summary, level, tags, estimated_minutes, requires_hardware, issues_certificate, price_cents, currency, sort_order',
    )
    .eq('status', 'published')
    .order('sort_order')
    .returns<Course[]>();

  if (error) {
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }

  return NextResponse.json(
    {
      site: publicEnv.siteUrl,
      generated_at: new Date().toISOString(),
      courses: (data ?? []).map((course) => ({
        ...course,
        url: `${publicEnv.siteUrl}/catalog/${course.slug}`,
      })),
    },
    {
      headers: {
        'Access-Control-Allow-Origin': corsOrigin,
        Vary: 'Origin',
        'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=600',
      },
    },
  );
}

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin');
  const allowed = serverEnv.embedAllowedOrigins;
  const corsOrigin = origin && allowed.includes(origin) ? origin : allowed[0];

  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': corsOrigin,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    },
  });
}
