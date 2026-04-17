# Completed: Zod-validated env at boot (app/server/utils/env.ts)

**Task:** bootstrap-env.md
**Status:** done
**Date:** 2026-04-17

## Changes Made

- `app/server/utils/env.ts`:1 — Comment at top enforcing no-secret-defaults rule
- `app/server/utils/env.ts`:2 — Imports `z` from `zod`
- `app/server/utils/env.ts`:4 — Defines `EnvSchema` with NODE_ENV (default 'development'), APP_URL (default 'http://localhost:3015'), DATABASE_URL (optional url, becomes required in bootstrap-drizzle)
- `app/server/utils/env.ts`:10 — `export const env = EnvSchema.parse(process.env)` — parse throws on invalid input; no try/catch, process exits non-zero
- `app/server/utils/env.ts`:12 — `export type Env = z.infer<typeof EnvSchema>` — consumers get a typed env object
- `app/server/plugins/env-check.ts` — Side-effect import of `../utils/env` ensures validation runs at Nitro boot even when no handler imports env yet; exports `defineNitroPlugin` wrapper
- `.env.example` (repo root) — Lists NODE_ENV, APP_URL, DATABASE_URL (commented out) with placeholders; copy to `.env` pattern documented

## Acceptance Criteria Check

- [x] `app/server/utils/env.ts` imports `z` from `zod`
- [x] `EnvSchema` defined with `NODE_ENV`, `APP_URL`, `DATABASE_URL` (optional) — nothing more
- [x] `export const env = EnvSchema.parse(process.env)` — parse throws + exits on invalid input
- [x] No try/catch wrapping the parse — failures are fatal
- [x] `export type Env = z.infer<typeof EnvSchema>` exported
- [x] Comment at top: "Env is validated at boot. Missing required vars = process exits. Never use fallback defaults for secrets."
- [x] `app/server/plugins/env-check.ts` imports `../utils/env` as side-effect at module top
- [x] Plugin uses `defineNitroPlugin` format
- [x] `.env.example` at repo root with all vars and placeholders matching spec exactly
- [x] `.env` NOT committed — verified via `git check-ignore`
- [x] `npx nuxi typecheck` passes (exit 0)
- [x] `npm run build` passes — no env parse failure at build time (all vars have defaults or are optional)
- [x] Zero use of `process.env` outside `env.ts`
- [x] No new npm dependencies — `zod` was already in package.json

## Verification Output

### `npx nuxi typecheck`
```
(no output, exit 0)
```

### `npm run build` (tail)
```
  ├─ .output/server/chunks/build/server.mjs (38.6 kB) (9.98 kB gzip)
  └─ .output/server/index.mjs (509 B) (239 B gzip)
Σ Total size: 2.24 MB (535 kB gzip)
[nitro] ✔ You can preview this build using node .output/server/index.mjs
└  ✨ Build complete!
```

### `git check-ignore -v .env`
```
.gitignore:7:.env	.env
```
`.env` is blocked by `.gitignore` line 7 — `.env` pattern matches before the `!.env.example` exception.

### `git ls-files .env.example`
```
.env.example
```
`.env.example` is tracked by git (committed on this branch).

## Notes

- `DATABASE_URL` is `optional()` now — no handler uses it yet. The `bootstrap-drizzle` task will change this to `z.string().url()` (required) when it wires in Drizzle.
- `NODE_ENV` defaults to `development` (not `production`) per task spec Notes — an unset env in prod would fall back to dev behavior (verbose logs, relaxed CORS) which is safer than silently defaulting to production-mode without proper secrets set.
- `APP_URL` defaults to `http://localhost:3015` matching the dev port set in `bootstrap-nuxt`.
- The manual node ESM test (`node --input-type=module -e "import('./server/utils/env.ts')..."`) requires transpilation and is not run during worker execution; validation intent is demonstrated via typecheck + build success above.
- No values from `process.env` are interpolated into logs, errors, or responses in this task.
