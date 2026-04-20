// POST /api/jobs/[id]/pay — create (or return) a Stripe PaymentIntent for a job.
// Spec: SPEC.md §2.2 (routes) + §S.10 (pricing: flat 499 RON + 21% VAT = 604 RON).
//
// Ordering (load-bearing):
//   1. Validate UUID path param (Zod).
//   2. assertJobAccess(jobId, event) — FIRST per CLAUDE.md.
//   3. State guard — job must have reached mapping/review before paying.
//   4. Body Zod-validate optional { billingEmail }; persist to jobs.billingEmail.
//   5. Idempotent re-click: if a payments row already exists with a non-failed
//      status, reuse its Stripe PaymentIntent and return the refreshed
//      client_secret. Otherwise create a new intent (Stripe idempotency key
//      `job_<id>_pay` dedups at their side within 24h).
//   6. Insert payments row on first success.
//   7. Return ONLY { clientSecret, amount, currency } — never the full intent.
//
// CSRF is enforced globally by middleware. No PII logged (no email, no card data).
import { and, eq, ne } from 'drizzle-orm';
import { createError, defineEventHandler, getValidatedRouterParams, readValidatedBody } from 'h3';
import { z } from 'zod';
import { db } from '../../../db/client';
import { jobs, payments } from '../../../db/schema';
import { assertJobAccess } from '../../../utils/assert-job-access';
import { jobPaymentIdempotencyKey, stripe } from '../../../utils/stripe';

const ParamsSchema = z.object({ id: z.string().uuid() });

const BodySchema = z
  .object({
    billingEmail: z.string().email().max(255).optional(),
  })
  .strict();

// Flat single-tier pricing (SPEC §S.10). VAT 21% (RO 2026).
const PRICE_NO_VAT_RON = 499;
const VAT_RATE = 0.21;
const VAT_RON = Math.round(PRICE_NO_VAT_RON * VAT_RATE); // 105
const TOTAL_RON = PRICE_NO_VAT_RON + VAT_RON; // 604
const AMOUNT_BANI = TOTAL_RON * 100; // 60400
const CURRENCY = 'ron' as const;

export default defineEventHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, ParamsSchema.parse);

  const job = await assertJobAccess(id, event);

  // State guard: only allow paying once the user has reached mapping/review.
  const isReady = job.status === 'mapped' || job.progressStage === 'reviewing';
  if (!isReady) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Conflict',
      data: { error: 'not_ready_for_payment' },
    });
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = await readValidatedBody(event, BodySchema.parse);
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid request body' });
  }

  if (body.billingEmail && body.billingEmail !== job.billingEmail) {
    await db
      .update(jobs)
      .set({ billingEmail: body.billingEmail, updatedAt: new Date() })
      .where(eq(jobs.id, id));
  }

  // Idempotent against re-clicks: reuse any non-failed payments row for this job.
  const [existing] = await db
    .select()
    .from(payments)
    .where(and(eq(payments.jobId, id), ne(payments.status, 'failed')))
    .limit(1);

  if (existing?.stripePaymentIntentId) {
    const intent = await stripe.paymentIntents.retrieve(existing.stripePaymentIntentId);
    if (intent.client_secret) {
      return {
        clientSecret: intent.client_secret,
        amount: existing.amount,
        currency: existing.currency,
      };
    }
    // Fall through to create a fresh intent if Stripe no longer exposes the
    // client_secret (e.g. the intent was canceled). New idempotency-key call
    // will still dedup at Stripe's side within 24h.
  }

  const intent = await stripe.paymentIntents.create(
    {
      amount: AMOUNT_BANI,
      currency: CURRENCY,
      metadata: { jobId: id },
      automatic_payment_methods: { enabled: true },
    },
    { idempotencyKey: jobPaymentIdempotencyKey(id) },
  );

  if (!intent.client_secret) {
    throw createError({ statusCode: 502, statusMessage: 'Payment provider error' });
  }

  if (!existing) {
    await db.insert(payments).values({
      jobId: id,
      stripePaymentIntentId: intent.id,
      amount: AMOUNT_BANI,
      currency: CURRENCY,
      status: intent.status,
    });
  }

  return {
    clientSecret: intent.client_secret,
    amount: AMOUNT_BANI,
    currency: CURRENCY,
  };
});
