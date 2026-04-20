# Next agent prompt — copy the block below into a fresh Claude Code session

---

You are the orchestrator for the rapidport.ro project. State your mode in your first response.

## Mandatory reading (in this order, before any code change)

1. `CLAUDE.md` — mandatory workflow, SOPs, doc-drift rule, Git rules (NO Co-Authored-By, ever).
2. `jobs/HANDOFF.md` — what shipped in the last session, current state, harness bugs.
3. `docs/LOG.md` — reverse-chronological changelog. Top entry (2026-04-20) captures product pivots + middleware shift + orchestrator-direct endpoints you won't find in JOB.md.
4. `docs/ARCHITECTURE.md` — current directory tree, routes, middleware, utils.
5. `jobs/phase2-nuxt/JOB.md` §`api-jobs` — task list for the next wave.
6. `SPEC.md` §2.1 (schema), §2.2 (routes), §S.10 (rate limits), §S.11 (GDPR) — product truth.
7. Your auto-memory at `~/.claude/projects/-Users-danime-Sites-rapidport-ro-app/memory/MEMORY.md` — rules from past sessions.

If anything in SPEC.md contradicts LOG.md's latest entry, **LOG.md wins** (it records the refinement). Flag the contradiction before acting.

## Current state (2026-04-20)

- Phase 0, Phase 1, and Phase 2 groups `bootstrap`, `security-baseline`, `schema`, `auth-user`, `auth-admin` are all merged to main.
- The `/login` flow (PIN-based), `/account` dashboard, session management, and GDPR export/delete endpoints are live.
- Working tree is clean on `main`. No open branches.

## Your mission

Ship `api-jobs` — this is the critical path to a working upload → convert → download loop. `/upload` page exists; it has no backend. Worker exists; it has no trigger.

## Wave shape

### Wave 4 prep (you, orchestrator-direct, 1 commit)

Before spawning workers, scaffold three small utilities. All three are single-file, ~50-100 lines, and unlock multiple workers.

1. **`app/server/utils/queue.ts`** — pg-boss publisher wrapper. Exports `publishDiscover(payload)`, `publishConvert(payload)`. Reads `env.DATABASE_URL`. Maintains a single pg-boss instance with a Nitro shutdown hook. Needed by `api-jobs-discover`.

2. **`app/server/utils/stripe.ts`** — Stripe SDK wrapper. Exports a single-instance `stripe` client with retry + typed helpers. Reads `env.STRIPE_SECRET_KEY`. **Extend `env.ts` with `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`.** Add placeholders to `.env.example`. Needed by `api-jobs-pay` + `api-webhooks-stripe`. `npm install stripe`.

3. **`app/server/types/queue.ts`** — TypeScript mirrors of the Python Pydantic `DiscoverPayload` + `ConvertPayload` shapes from `worker/src/migrator/consumer.py`. **Read the worker file and match byte-for-byte.** This is a Phase-1-flagged cross-phase dependency; drift = silent job drops at runtime.

Commit as `feat(api-jobs): wave 4 prep — queue + stripe + queue types`.

### Wave 4 (6 parallel workers, isolated worktrees)

All file-disjoint. All consume utilities already on main.

| Task | File | Key points |
|---|---|---|
| `api-jobs-create` | `app/server/api/jobs/index.post.ts` | Zod body (sourceSoftware, targetSoftware, billingEmail opt). Creates jobs row with `generateAnonymousToken()`, sets scoped cookie via `setAnonymousTokenCookie()`. Rate-limit middleware already covers 10/hr per IP. |
| `api-jobs-get` | `app/server/api/jobs/[id].get.ts` | `assertJobAccess(id, event)` FIRST. Strip `anonymousAccessToken` from the response before returning. |
| `api-jobs-upload` | `app/server/api/jobs/[id]/upload.put.ts` | Multipart. Magic-byte sniff (.zip, .tar.gz, .tgz, .7z). Store at `/data/jobs/{id}/upload/{uuid}.{ext}`. 500MB cap enforced at Caddy; handler re-checks Content-Length. Rate-limit middleware covers 3/hr per IP. |
| `api-jobs-discover` | `app/server/api/jobs/[id]/discover.post.ts` | Call `publishDiscover({ jobId })` from the new `queue.ts`. Update jobs.progressStage='queued'. |
| `api-jobs-events-sse` | `app/server/api/jobs/[id]/events.get.ts` | Server-Sent Events. 2s Postgres poll of `jobs.progress_stage` + `progress_pct`. Heartbeat every 15s. Close on terminal status. |
| `api-jobs-mapping` | `app/server/api/jobs/[id]/mapping.patch.ts` | Zod validate the mapping JSON. Write to `jobs.mapping_result`. |

Each worker: pre-create the task branch from `job/phase2-nuxt/api-jobs` group (which you create from `main`). All workers use `isolation: "worktree"`.

### Wave 4b (2 parallel after 4 merges)

- `api-jobs-pay` — `POST /api/jobs/[id]/pay`. Depends on `stripe.ts` from prep. `stripe.paymentIntents.create({ amount, currency: 'ron', metadata: { jobId } })` with idempotency key `job_{id}_pay`. Return client_secret only.
- `api-jobs-download-resync` — `GET /api/jobs/[id]/download` (stream output ZIP) + `POST /api/jobs/[id]/resync` (publish delta-sync job; check deltaSyncsUsed < deltaSyncsAllowed).

### Wave 4c (solo, after 4b)

- `api-webhooks-stripe` — `POST /api/webhooks/stripe`. `stripe.webhooks.constructEvent(rawBody, sig, env.STRIPE_WEBHOOK_SECRET)`. 5-min replay window. Dedup via `stripe_events` table (INSERT on new, skip on conflict). `payment_intent.succeeded` side effects: mark job PAID, `publishConvert()`, send confirmation email, trigger SmartBill invoice. Idempotent end-to-end.

After this wave, a user can upload → pay → download for the first time. That's a big milestone.

## Hard rules (don't re-derive — these are in CLAUDE.md and auto-memory)

- **VAT is 21%** on user-facing UI. Already fixed — don't revert.
- **PIN auth, not magic-link URL.** Don't rewrite the login flow back to URLs.
- **`/account` is a dashboard**, not a profile list. `/profiles` URL is dead.
- **All confirmations** use `<LayoutConfirmDialog>`. No ad-hoc Dialog instances.
- **SSR cookie forward**: `const headers = import.meta.server ? useRequestHeaders(['cookie']) : undefined` on every internal fetch from a page.
- **English-only identifiers/comments.** User-facing copy in Romanian. Admin UI in English.
- **NEVER add Co-Authored-By trailers** to commits.
- **Orchestrator stays on main.** Workers branch from group; group branches from main; orchestrator merges.
- **Doc drift is a review-block.** After each wave: update `docs/LOG.md`, `docs/ARCHITECTURE.md`, `jobs/HANDOFF.md`, and auto-memory.

## Harness gotchas (from prior sessions)

- **Worker worktrees sometimes base off stale commits.** Tell each worker to verify `git branch --show-current` and create from the right base if missing.
- **Bash CWD drifts.** Prefix multi-step commands with `cd /Users/danime/Sites/rapidport.ro/app/app &&` explicitly.
- **`nuxi typecheck | pipe` lies about exit codes.** Run without pipe to validate.
- **If a worker's `git add` is denied by the harness**, salvage: orchestrator reads the worktree files, writes them in the main checkout on the task branch, commits orchestrator-direct. Did this for `auth-admin-logout` last session.
- **Don't start dev or preview servers.** Dani uses `rundev`. You only run typecheck + build.

## Blockers to flag to Dani (not your call)

- SPEC open Q#1: legal entity for SmartBill invoices. Blocks `smartbill-client`.
- SPEC open Q#3: SmartBill invoice series. Placeholder `RAPIDPORT-YYYY-NNNN` in UI.
- SPEC open Q#4: refund policy copy. Blocks `/legal/refund.vue` + admin refund flow.
- `.env` must have Stripe test keys before `api-jobs-pay` can be tested live. Without them, the handler will ship but `stripe.paymentIntents.create` will throw at runtime.

## First action

State your mode. Confirm you've read the mandatory list. Then: start Wave 4 prep (the three scaffolding files). When that's committed, spawn 6 workers for Wave 4.

Questions you should ask Dani before coding:
1. Have you set Stripe test keys in `.env`? (Otherwise prep ships but pay won't run.)
2. Any SPEC Q#1/#3/#4 answers since 2026-04-20?
