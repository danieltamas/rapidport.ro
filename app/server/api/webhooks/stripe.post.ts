// POST /api/webhooks/stripe — Stripe webhook receiver.
// See jobs/phase2-nuxt/PLAN-api-webhooks-stripe.md for the approved plan.
//
// Authentication: Stripe HMAC signature (X-Webhook-Secret) — NOT our CSRF cookie.
// /api/webhooks/* is exempt from middleware/csrf.ts already.
//
// Ordering (load-bearing):
//   1. Read RAW body (signature is over the raw bytes — parsing breaks it).
//   2. stripe.webhooks.constructEvent — verifies signature + 5-min replay window.
//   3. Dedup against stripe_events (INSERT ... ON CONFLICT DO NOTHING by event id).
//   4. Dispatch by event type. Anything else → 200 OK no-op (don't make Stripe retry).
//   5. For payment_intent.succeeded:
//      a. Look up payments row by stripe_payment_intent_id; if already 'succeeded',
//         skip side effects (idempotent against double-processed events that bypassed
//         the dedup row, e.g. concurrent deliveries).
//      b. UPDATE payments → status='succeeded'.
//      c. Validate jobId from intent.metadata.
//      d. UPDATE jobs → status='paid', progressStage='queued', progressPct=0.
//      e. Read uploadDiskFilename — required for publishConvert.
//      f. publishConvert(...) — convert pipeline pickup. Failures here are logged
//         but DO NOT 4xx Stripe (we already collected money; a sweep cron will
//         re-enqueue stuck payments — flagged for observability task).
//
// SmartBill invoice issuance: deferred. The future smartbill-client task can sweep
// `payments WHERE status='succeeded' AND smartbill_invoice_id IS NULL`.
//
// Confirmation email: deferred until email-templates ships. TODO marker below.
//
// Logs: never log signature header, never log card data, never log billingEmail.
// Job IDs and Stripe event IDs are opaque and safe to log.
import { eq } from 'drizzle-orm';
import {
  createError,
  defineEventHandler,
  getHeader,
  readRawBody,
} from 'h3';
import type Stripe from 'stripe';
import { z } from 'zod';
import { db } from '../../db/client';
import { jobs, payments, stripeEvents, users } from '../../db/schema';
import { sendPaymentConfirmedEmail } from '../../emails/payment-confirmed';
import type { ConvertPayload } from '../../types/queue';
import { env } from '../../utils/env';
import { publishConvert } from '../../utils/queue';
import { stripe } from '../../utils/stripe';

const DATA_ROOT = '/data/jobs';
const REPLAY_TOLERANCE_S = 300; // 5 minutes — Stripe's default

const UuidSchema = z.string().uuid();

export default defineEventHandler(async (event) => {
  // 1. Raw body. `false` = return Buffer, not string.
  const raw = await readRawBody(event, false);
  if (!raw || !(raw instanceof Buffer)) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request' });
  }

  const sig = getHeader(event, 'stripe-signature');
  if (!sig) {
    throw createError({ statusCode: 400, statusMessage: 'Missing signature' });
  }

  // 2. Signature + replay window. Failure = malformed/forged → 400. Never log
  // the signature header.
  let stripeEvent: Stripe.Event;
  try {
    stripeEvent = stripe.webhooks.constructEvent(
      raw,
      sig,
      env.STRIPE_WEBHOOK_SECRET,
      REPLAY_TOLERANCE_S,
    );
  } catch (err) {
    console.warn('stripe_webhook_verification_failed', {
      reason: (err as Error).name,
    });
    throw createError({ statusCode: 400, statusMessage: 'Invalid signature' });
  }

  // 3. Dedup. If insert returns no rows, this event id was already processed.
  const inserted = await db
    .insert(stripeEvents)
    .values({ id: stripeEvent.id, type: stripeEvent.type })
    .onConflictDoNothing()
    .returning({ id: stripeEvents.id });
  if (inserted.length === 0) {
    return { ok: true, dedup: true };
  }

  // 4. Dispatch. Unknown types ack-and-ignore so Stripe stops retrying.
  if (stripeEvent.type !== 'payment_intent.succeeded') {
    return { ok: true, ignored: true, type: stripeEvent.type };
  }

  const intent = stripeEvent.data.object as Stripe.PaymentIntent;

  // 5a. Locate the payments row. Skip side effects if already succeeded.
  const [paymentRow] = await db
    .select()
    .from(payments)
    .where(eq(payments.stripePaymentIntentId, intent.id))
    .limit(1);

  if (!paymentRow) {
    // Intent we didn't create — log and ack so Stripe stops retrying. Could be
    // a wrong-account hit or a manual dashboard charge.
    console.warn('stripe_webhook_unknown_intent', {
      eventId: stripeEvent.id,
      intentId: intent.id,
    });
    return { ok: true, unknown_intent: true };
  }

  if (paymentRow.status === 'succeeded') {
    return { ok: true, already_processed: true };
  }

  // 5b. Mark payment succeeded.
  await db
    .update(payments)
    .set({ status: 'succeeded' })
    .where(eq(payments.id, paymentRow.id));

  // 5c. jobId from metadata — UUID-validated before any DB use.
  const rawJobId = intent.metadata?.jobId;
  const jobId = rawJobId ? UuidSchema.safeParse(rawJobId) : null;
  if (!jobId || !jobId.success) {
    // Payment is recorded as succeeded; the job linkage broke. This is an
    // operator-attention case — surfaces in admin via stripe_events + payments
    // tables. Don't 4xx Stripe.
    console.warn('stripe_webhook_missing_jobId', {
      eventId: stripeEvent.id,
      paymentId: paymentRow.id,
    });
    return { ok: true, missing_jobId: true };
  }

  // 5d. Mark job paid + queued.
  await db
    .update(jobs)
    .set({
      status: 'paid',
      progressStage: 'queued',
      progressPct: 0,
      updatedAt: new Date(),
    })
    .where(eq(jobs.id, jobId.data));

  // 5e. Lookup uploadDiskFilename for the convert payload + billing email for
  // the confirmation email. billingEmail is the canonical recipient (set at
  // pay time); fall back to the linked user's email for logged-in flows that
  // didn't explicitly fill in billingEmail.
  const [job] = await db
    .select({
      uploadDiskFilename: jobs.uploadDiskFilename,
      billingEmail: jobs.billingEmail,
      userEmail: users.email,
    })
    .from(jobs)
    .leftJoin(users, eq(jobs.userId, users.id))
    .where(eq(jobs.id, jobId.data))
    .limit(1);
  if (!job?.uploadDiskFilename) {
    console.warn('stripe_webhook_missing_uploadDiskFilename', {
      eventId: stripeEvent.id,
      jobId: jobId.data,
    });
    // Don't 4xx — payment is captured. A sweep cron should re-enqueue once the
    // upload metadata is reconciled.
    return { ok: true, missing_upload: true };
  }

  // 5f. Hand off to worker. Wrap so a transient queue failure doesn't bubble
  // 5xx → Stripe retry (which would re-process this whole branch). Sweep cron
  // is the recovery path (TODO: observability task).
  const payload: ConvertPayload = {
    job_id: jobId.data,
    input_path: `${DATA_ROOT}/${jobId.data}/upload/${job.uploadDiskFilename}`,
    output_dir: `${DATA_ROOT}/${jobId.data}/output`,
    mapping_profile: null,
    // Explicit `false` so the contract matches the resync handler. Pydantic
    // defaults to False but being explicit here documents intent.
    is_resync: false,
  };
  try {
    await publishConvert(payload);
  } catch (err) {
    console.error('stripe_webhook_publish_failed', {
      eventId: stripeEvent.id,
      jobId: jobId.data,
      reason: (err as Error).name,
    });
    // Intentional: still return 200. Sweep cron will re-enqueue.
  }

  // Confirmation email — fire-and-forget; failure is logged inside the helper
  // and does not affect the webhook response. Skip if no recipient is known
  // (anonymous flow with no billingEmail captured).
  const recipient = job.billingEmail ?? job.userEmail;
  if (recipient) {
    await sendPaymentConfirmedEmail(jobId.data, recipient);
  } else {
    console.warn('payment_confirmed_email_skipped_no_recipient', {
      eventId: stripeEvent.id,
      jobId: jobId.data,
    });
  }

  // TODO(smartbill-client): the future smartbill-client task should sweep
  // `payments WHERE status='succeeded' AND smartbill_invoice_id IS NULL` and
  // issue the invoice under series RAPIDPORT (Gamerina SRL).

  return { ok: true };
});
