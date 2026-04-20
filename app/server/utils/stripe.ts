// Stripe SDK wrapper. The ONLY place that instantiates the Stripe client.
// Handlers and webhooks import { stripe } from this file; they never `new Stripe()`.
//
// Webhook handler additionally uses stripe.webhooks.constructEvent() for signature
// verification — see app/server/api/webhooks/stripe.post.ts.

import Stripe from 'stripe';
import { env } from './env';

export const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
  maxNetworkRetries: 2,
  timeout: 20_000,
  appInfo: { name: 'rapidport.ro' },
});

/**
 * Idempotency key convention for job-scoped one-time charges.
 * Stripe deduplicates retries within 24h on identical keys.
 */
export function jobPaymentIdempotencyKey(jobId: string): string {
  return `job_${jobId}_pay`;
}
