// Env is validated at boot. Missing required vars = process exits. Never use fallback defaults for secrets.
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  APP_URL: z.string().url().default('http://localhost:3015'),
  DATABASE_URL: z.string().url(),
});

export const env = EnvSchema.parse(process.env);

export type Env = z.infer<typeof EnvSchema>;
