---
title: Zod-validated env at boot (app/server/utils/env.ts)
priority: critical
status: todo
group: bootstrap
phase: 2
branch: job/phase2-nuxt/bootstrap-env
spec-ref: CODING.md §13.1 "Environment Variables — Fail Hard", SPEC §S.7
---

## Description

Create `app/server/utils/env.ts` that validates all required env vars at boot via Zod. Missing required var = process exits. No fallback defaults for secrets. Ever.

Start with the minimum viable schema — just what's needed right now. Later tasks (auth, payments, etc.) extend the schema as they wire in their integrations. This is the pattern, not the full set. Do NOT include Stripe/Anthropic/SmartBill/Google OAuth vars yet — those arrive with their tasks.

Also create `.env.example` at the repo root with placeholder values for every var the schema knows about (currently minimal).

## Why It Matters

Running the app with a silent `process.env.JWT_SECRET || 'dev-secret'` is how production data breaches happen. Env validation at boot is the #1 security pattern for a Node app: fail loud if misconfigured, don't serve requests with the wrong crypto.

## Acceptance Criteria

### File: `app/server/utils/env.ts`

- [ ] Imports `z` from `zod`
- [ ] Defines `EnvSchema = z.object({ ... })` with initial vars:
  - `NODE_ENV: z.enum(['development', 'production', 'test']).default('development')`
  - `APP_URL: z.string().url().default('http://localhost:3015')`
  - `DATABASE_URL: z.string().url().optional()` — becomes required in `bootstrap-drizzle`
- [ ] Parses `process.env` into a typed `env` object: `export const env = EnvSchema.parse(process.env);`
- [ ] If parse fails: Zod throws a detailed error listing every missing/invalid var. Node exits non-zero. Do NOT catch and continue.
- [ ] Exports the inferred type: `export type Env = z.infer<typeof EnvSchema>;`
- [ ] Comment at top: `// Env is validated at boot. Missing required vars = process exits. Never use fallback defaults for secrets.`
- [ ] Plugin that imports env for side-effect validation at Nitro boot: `app/server/plugins/env-check.ts` — `import '../utils/env'` — ensures env runs even if no handler imports it yet
- [ ] `app/server/plugins/env-check.ts` uses Nitro plugin format: `export default defineNitroPlugin(() => { /* env import above triggered validation */ });` or just a side-effect import at module top

### File: `.env.example` (repo root, committed)

- [ ] Lists every var the schema knows about with placeholder values:
  ```
  # Rapidport — environment variables
  # Copy to .env and fill in real values. .env is gitignored.
  NODE_ENV=development
  APP_URL=http://localhost:3015
  # DATABASE_URL=postgresql://user:pass@localhost:5432/rapidport?sslmode=require
  ```
- [ ] `.env` itself is NOT committed (root `.gitignore` already blocks it — verify via `git check-ignore -v .env`)

### Verification

- [ ] `cd app && npx nuxi typecheck` passes
- [ ] `cd app && npm run build` passes — the plugin-based validation should NOT trigger during build (no process.env expected at build time beyond NODE_ENV)
- [ ] Quick manual node test in the DONE report: `cd app && node --input-type=module -e "import('./server/utils/env.ts').then(m => console.log(m.env))"` — not required to pass during worker run (it'd need transpilation), but document the validation intent in the DONE Notes
- [ ] No values from `process.env` are ever interpolated into logs, errors, or responses during this task

### Out of scope

- Stripe, Anthropic, Resend, SmartBill, Google OAuth, Sentry env vars — each arrives with its own task when the integration is wired in. The pattern set here makes adding them one-line changes.

## Files to Create

- `app/server/utils/env.ts`
- `app/server/plugins/env-check.ts`
- `.env.example` (repo root)

## Files to Touch

None yet.

## Notes

- `env.ts` is imported synchronously at Nitro startup — via the plugin. When Phase 2 auth + api tasks add their env vars, they extend `EnvSchema` and users of those vars import `env` from this module.
- `NODE_ENV` default is `development` for safety — an untrimmed/unspecified env in prod would fall back to dev behavior (verbose logs, relaxed CORS) which is safer than crashing on startup OR silently defaulting to production-mode without the right secrets set.
- Do NOT use `process.env` directly anywhere outside this file in the codebase — always import `env` from here. This is the pattern. Later tasks enforce it via grep in review.
- `APP_URL` default `http://localhost:3015` matches `bootstrap-nuxt`'s dev port.
- English-only identifiers.
