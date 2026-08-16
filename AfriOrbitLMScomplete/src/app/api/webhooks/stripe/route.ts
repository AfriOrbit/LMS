import { NextResponse, type NextRequest } from 'next/server';
import type Stripe from 'stripe';

import { serverEnv } from '@/lib/env';
import { auditAsSystem } from '@/lib/security';
import { getStripe } from '@/lib/stripe';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
// Stripe signs the raw body; any framework body parsing would break the check.
export const dynamic = 'force-dynamic';

/**
 * Stripe webhook.
 *
 * Two properties matter here and both are easy to get wrong:
 *   1. The signature is verified against the RAW body before anything else.
 *   2. Handling is idempotent — Stripe retries, and a retried
 *      `checkout.session.completed` must not enrol twice or double-count seats.
 *      The `webhook_events` table is the idempotency ledger.
 */
export async function POST(request: NextRequest) {
  const stripe = getStripe();
  const secret = serverEnv.stripeWebhookSecret;

  if (!stripe || !secret) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'missing_signature' }, { status: 400 });
  }

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, secret);
  } catch (error) {
    console.error('[stripe] signature verification failed', error);
    return NextResponse.json({ error: 'invalid_signature' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();

  // Idempotency: the primary key rejects a duplicate event id.
  const { error: ledgerError } = await admin.from('webhook_events').insert({
    id: event.id,
    type: event.type,
    payload: { object: event.data.object } as unknown as Record<string, unknown>,
  });

  if (ledgerError) {
    if (ledgerError.code === '23505') {
      return NextResponse.json({ received: true, duplicate: true });
    }
    console.error('[stripe] could not write ledger', ledgerError);
    // Returning 500 makes Stripe retry, which is what we want if we cannot
    // guarantee exactly-once handling.
    return NextResponse.json({ error: 'ledger_failed' }, { status: 500 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const orderId = session.metadata?.order_id ?? session.client_reference_id;
        const userId = session.metadata?.user_id;
        const courseId = session.metadata?.course_id;

        if (!orderId || !userId || !courseId) {
          console.error('[stripe] session missing metadata', session.id);
          break;
        }

        if (session.payment_status !== 'paid') break;

        await admin
          .from('orders')
          .update({
            status: 'paid',
            stripe_payment_intent:
              typeof session.payment_intent === 'string' ? session.payment_intent : null,
          })
          .eq('id', orderId);

        await admin.from('enrollments').upsert(
          {
            user_id: userId,
            course_id: courseId,
            source: 'purchase',
            status: 'active',
          },
          { onConflict: 'user_id,course_id' },
        );

        await auditAsSystem('payment.completed', {
          actorId: userId,
          entity: 'order',
          entityId: orderId,
          metadata: { course_id: courseId, amount: session.amount_total },
        });
        break;
      }

      case 'checkout.session.expired': {
        const session = event.data.object;
        const orderId = session.metadata?.order_id ?? session.client_reference_id;
        if (orderId) {
          await admin.from('orders').update({ status: 'cancelled' }).eq('id', orderId);
        }
        break;
      }

      case 'charge.refunded': {
        const charge = event.data.object;
        const intent =
          typeof charge.payment_intent === 'string' ? charge.payment_intent : null;
        if (!intent) break;

        const { data: order } = await admin
          .from('orders')
          .select('id, user_id, course_id')
          .eq('stripe_payment_intent', intent)
          .maybeSingle<{ id: string; user_id: string | null; course_id: string | null }>();

        if (order) {
          await admin.from('orders').update({ status: 'refunded' }).eq('id', order.id);
          if (order.user_id && order.course_id) {
            await admin
              .from('enrollments')
              .update({ status: 'withdrawn' })
              .eq('user_id', order.user_id)
              .eq('course_id', order.course_id);
          }
          await auditAsSystem('payment.refunded', {
            actorId: order.user_id,
            entity: 'order',
            entityId: order.id,
          });
        }
        break;
      }

      default:
        // Unhandled event types are still recorded in the ledger.
        break;
    }
  } catch (error) {
    console.error('[stripe] handler error', event.type, error);
    // Remove the ledger row so Stripe's retry can be processed.
    await admin.from('webhook_events').delete().eq('id', event.id);
    return NextResponse.json({ error: 'handler_failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
