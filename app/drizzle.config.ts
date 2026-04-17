// drizzle-kit runs as a CLI tool before the Nuxt module system (and the env.ts Zod validator)
// has booted. Reading process.env directly here is the ONE documented exception to the
// "always import from server/utils/env.ts" rule. All runtime code must still use env.ts.
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './server/db/schema/*.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  strict: true,
  verbose: true,
});
