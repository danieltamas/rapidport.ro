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
});

export const env = EnvSchema.parse(process.env);

export type Env = z.infer<typeof EnvSchema>;
