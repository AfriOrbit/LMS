import 'server-only';

import Stripe from 'stripe';

import { serverEnv } from '@/lib/env';

let client: Stripe | null = null;

/**
 * Returns a Stripe client, or null when Stripe is not configured.
 *
 * Payments are optional: the platform runs perfectly well with only free
 * courses, and a missing key should degrade the checkout button rather than
 * break the build.
 */
export function getStripe(): Stripe | null {
  const key = serverEnv.stripeSecretKey;
  if (!key) return null;
  // Pin nothing here: the SDK's default API version is the one it was built
  // and typed against, so letting it choose avoids type/runtime drift.
  client ??= new Stripe(key);
  return client;
}

export function isStripeConfigured(): boolean {
  return Boolean(serverEnv.stripeSecretKey && serverEnv.stripeWebhookSecret);
}
