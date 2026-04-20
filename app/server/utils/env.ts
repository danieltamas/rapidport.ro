// Env is validated at boot. Missing required vars = process exits. Never use fallback defaults for secrets.
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  APP_URL: z.string().url().default('http://localhost:3015'),
  DATABASE_URL: z.string().url(),
  // ADMIN_EMAILS — comma-separated allowlist of admin Google emails. Normalized to
  // lowercase, trimmed, validated as emails, min length 1.
  // Default is a non-working placeholder so local dev boot does not fail if the
  // developer has not set ADMIN_EMAILS yet; in production the operator MUST set
  // a real allowlist (the placeholder will never match a real Google login).
  ADMIN_EMAILS: z
    .string()
    .transform((s) => s.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean))
    .pipe(z.array(z.string().email()).min(1))
    .default('dev-noop@example.test'),

  // Resend (transactional email). Magic-link request handler owns the sends.
  RESEND_API_KEY: z.string().min(1),
  EMAIL_FROM: z.string().min(1), // format: 'Name <address@domain>'

  // Google OAuth (admin login only). No user OAuth in v1.
  GOOGLE_OAUTH_CLIENT_ID: z.string().min(1),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().min(1),
  GOOGLE_OAUTH_REDIRECT_URI: z.string().url(),

  // Stripe — payments + webhook verification. Secret + webhook secret are server-only;
  // publishable is exposed to the client via a public runtime config in nuxt.config.
  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_PUBLISHABLE_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),

  // SmartBill — invoicing. Basic Auth: Authorization: Basic base64(username:apikey).
  // Series RAPIDPORT, Gamerina SRL (CIF below). useEFactura set true on PJ invoices.
  //
  // Dev-safe placeholders so boot doesn't fail if you haven't wired SmartBill yet.
  // The invoice-sweep task checks `isSmartBillConfigured()` and no-ops when it
  // sees these placeholders — so the app runs, the sweep stays quiet, and you
  // wire in real values when you're ready. In prod the operator MUST set them.
  SMARTBILL_USERNAME: z.string().min(1).default('dev-noop@example.test'),
  SMARTBILL_API_KEY: z.string().min(1).default('dev-noop'),
  SMARTBILL_CIF: z.string().min(1).default('RO00000000'),
  SMARTBILL_SERIES: z.string().min(1).default('RAPIDPORT'),

  // Scheduled jobs (cleanup cron + smartbill sweep + email sweep). On in prod
  // by default, OFF in dev because pg-boss keeps a connection pool plus a
  // worker subscriber per queue — noticeable memory + socket overhead when
  // you're just iterating on UI. Opt in via SCHEDULER_ENABLED=true in dev.
  SCHEDULER_ENABLED: z
    .string()
    .optional()
    .transform((s) => {
      if (s === undefined) return process.env.NODE_ENV === 'production';
      return s.toLowerCase() === 'true' || s === '1';
    }),
});

export const env = EnvSchema.parse(process.env);

export type Env = z.infer<typeof EnvSchema>;
