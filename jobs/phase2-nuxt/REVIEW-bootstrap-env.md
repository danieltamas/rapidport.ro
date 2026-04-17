# Review: Zod-validated env at boot (app/server/utils/env.ts)

**Task:** bootstrap-env.md
**Status:** PASS
**Date:** 2026-04-17
**Reviewer:** Code Reviewer (Security-focused)

---

## Verdict

**PASS — clear to merge.**

All security and discipline checks pass. The implementation matches the task spec exactly. The fail-hard pattern is correctly established for all future secret-bearing tasks.

---

## Checklist

### Schema correctness
- [x] `EnvSchema` contains exactly the three vars specified: `NODE_ENV`, `APP_URL`, `DATABASE_URL` — no extras
- [x] `NODE_ENV: z.enum(['development', 'production', 'test']).default('development')` — matches spec acceptance criteria
- [x] `APP_URL: z.string().url().default('http://localhost:3015')` — correct
- [x] `DATABASE_URL: z.string().url().optional()` — correct; becomes required in bootstrap-drizzle
- [x] `export const env = EnvSchema.parse(process.env)` at module top — side-effect on import, validated immediately

### Fail-hard pattern
- [x] No `try/catch` wrapping `EnvSchema.parse()` — parse throws, Node exits non-zero on failure
- [x] No fallback defaults for anything secret-shaped — none declared yet, but the PATTERN has no `|| 'fallback'` anti-patterns
- [x] Required comment on line 1: "Env is validated at boot. Missing required vars = process exits. Never use fallback defaults for secrets."
- [x] `export type Env = z.infer<typeof EnvSchema>` exported — consumers get type safety

### Plugin
- [x] `app/server/plugins/env-check.ts` exists
- [x] Side-effect import `import '../utils/env'` at module top — fires validation at Nitro boot even if no handler imports `env` yet
- [x] Uses `defineNitroPlugin` (Nitro auto-import — typecheck passes, standard pattern)
- [x] Comment explains intent: "env import above triggered validation at module load — if we reach here, all required vars are present"

### `.env` discipline
- [x] `.env.example` at repo root — committed (`git ls-tree` confirms blob `11f73c8` tracked)
- [x] `.env.example` content matches spec exactly (header comment + all three vars, DATABASE_URL commented out)
- [x] `.env` NOT committed — `git ls-files .env` returns empty
- [x] `.gitignore` blocks `.env` at line 7 (`.env` pattern) and `.env.*`, with `!.env.example` exception — verified via `git check-ignore -v .env`

### `process.env` containment
- [x] `git grep "process\.env" job/phase2-nuxt/bootstrap-env -- "app/**/*.ts" "app/**/*.vue"` returns exactly ONE match: `app/server/utils/env.ts:10` — the sole authorised location

### Scope discipline
- [x] Diff touches exactly four files: `.env.example`, `app/server/utils/env.ts`, `app/server/plugins/env-check.ts`, `jobs/phase2-nuxt/DONE-bootstrap-env.md`
- [x] `nuxt.config.ts` untouched
- [x] `package.json` untouched — `zod` was already a dependency
- [x] No theme, component, migration, or unrelated files touched

### Git hygiene
- [x] Two task commits: `feat(env): add Zod-validated env with Nitro boot plugin` and `docs(jobs): DONE report for bootstrap-env task`
- [x] Conventional Commits format with `(env)` and `(jobs)` scopes
- [x] `Task: bootstrap-env.md` body line present in both commits
- [x] Author `hello@danieltamas.ro` on all task commits
- [x] Zero `Co-Authored-By` trailers — the single "co-authored" grep hit is inside CLAUDE.md body text (the rule "no Co-Authored-By"), not a trailer

### DONE report
- [x] Complete: Changes Made, Acceptance Criteria Check, Verification Output, Notes
- [x] Verification outputs provided: typecheck (exit 0), build output, `git check-ignore`, `git ls-files`
- [x] Security check block present and all items confirmed

---

## Notes for Merger

**On NODE_ENV default:** CODING.md §13.1 example uses `.default('production')` but the task spec's acceptance criteria and Notes explicitly require `.default('development')` with rationale (verbose dev fallback safer than silent production misconfiguration). Implementation correctly follows the task spec — this is intentional and not a defect.

**Pattern established:** `app/server/utils/env.ts` is now the single authorised `process.env` gateway. All future tasks that add secrets (`SESSION_SECRET`, `STRIPE_SECRET_KEY`, `ANTHROPIC_API_KEY`, etc.) extend `EnvSchema` here and import `env` from this module. No `process.env` elsewhere. This review confirms the pattern is clean; reviewers of future tasks can rely on the grep check to enforce containment.
