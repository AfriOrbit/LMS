import { NextResponse, type NextRequest } from 'next/server';

import { ApiAuthError, requireApiUser } from '@/lib/auth';
import { publicEnv } from '@/lib/env';
import { audit, rateLimit } from '@/lib/security';
import { getStripe } from '@/lib/stripe';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { uuidSchema } from '@/lib/validation';

export const runtime = 'nodejs';

/**
 * Creates a Stripe Checkout session for a paid course.
 *
 * The price is read from the database, never from the request — a client that
 * POSTs its own amount is ignored.
 */
export async function POST(request: NextRequest) {
  let ctx;
  try {
    ctx = await requireApiUser();
  } catch (error) {
    if (error instanceof ApiAuthError) {
      return NextResponse.redirect(new URL('/login', request.url), { status: 303 });
    }
    throw error;
  }

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: 'payments_not_configured' }, { status: 503 });
  }

  const limit = await rateLimit('checkout', ctx.userId, 10, 3600);
  if (!limit.allowed) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  const form = await request.formData();
  const parsedCourseId = uuidSchema.safeParse(form.get('courseId'));
  if (!parsedCourseId.success) {
    return NextResponse.json({ error: 'invalid_course' }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: course } = await supabase
    .from('courses')
    .select('id, slug, title, summary, price_cents, currency, status')
    .eq('id', parsedCourseId.data)
    .maybeSingle<{
      id: string;
      slug: string;
      title: string;
      summary: string;
      price_cents: number;
      currency: string;
      status: string;
    }>();

  if (!course || course.status !== 'published') {
    return NextResponse.json({ error: 'course_unavailable' }, { status: 404 });
  }
  if (course.price_cents <= 0) {
    return NextResponse.json({ error: 'course_is_free' }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from('enrollments')
    .select('id')
    .eq('user_id', ctx.userId)
    .eq('course_id', course.id)
    .maybeSingle<{ id: string }>();

  if (existing) {
    return NextResponse.redirect(new URL(`/learn/${course.slug}`, request.url), {
      status: 303,
    });
  }

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      user_id: ctx.userId,
      email: ctx.email,
      course_id: course.id,
      amount_cents: course.price_cents,
      currency: course.currency,
      status: 'pending',
    })
    .select('id')
    .single<{ id: string }>();

  if (orderError || !order) {
    return NextResponse.json({ error: 'order_failed' }, { status: 500 });
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer_email: ctx.email,
    client_reference_id: order.id,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: course.currency.toLowerCase(),
          unit_amount: course.price_cents,
          product_data: {
            name: course.title,
            description: course.summary.slice(0, 300) || undefined,
          },
        },
      },
    ],
    // The webhook is the source of truth for enrolment; these two carry the
    // identity it needs without trusting anything the browser sends back.
    metadata: {
      order_id: order.id,
      user_id: ctx.userId,
      course_id: course.id,
    },
    success_url: `${publicEnv.siteUrl}/learn/${course.slug}?purchased=1`,
    cancel_url: `${publicEnv.siteUrl}/catalog/${course.slug}?cancelled=1`,
  });

  await supabase
    .from('orders')
    .update({ stripe_session_id: session.id })
    .eq('id', order.id);

  await audit('checkout.started', {
    entity: 'order',
    entityId: order.id,
    metadata: { course_id: course.id, amount_cents: course.price_cents },
  });

  if (!session.url) {
    return NextResponse.json({ error: 'stripe_session_failed' }, { status: 502 });
  }

  return NextResponse.redirect(session.url, { status: 303 });
}
