# Completed: Drizzle ORM setup with minimal worker-facing schema

**Task:** bootstrap-drizzle.md
**Status:** done
**Date:** 2026-04-17

## Changes Made

- `app/package.json:18-30` — added runtime deps: drizzle-orm@^0.33, pg@^8.12, pg-boss@^10.0; dev deps: drizzle-kit@^0.24, @types/pg@^8; db:generate/migrate/push/studio scripts
- `app/package-lock.json` — regenerated with 698 packages (up from ~100)
- `app/drizzle.config.ts` — new; schema glob `./server/db/schema/*.ts`, out `./drizzle`, dialect postgresql, strict+verbose; comment documents the process.env CLI exception
- `app/server/db/client.ts` — new; single Pool (max:20) + drizzle instance; imports env from ../utils/env (not process.env)
- `app/server/db/schema/jobs.ts` — new; jobs table with 10 columns per spec; comment notes future ALTER TABLE additions
- `app/server/db/schema/mapping_cache.ts` — new; mapping_cache table with UNIQUE(source_software, table_name, field_name)
- `app/server/db/schema/ai_usage.ts` — new; ai_usage table with FK → jobs.id; comment notes costUsd uses real per spec
- `app/server/db/schema.ts` — new; re-exports all three sub-files; extensible without modifying this file
- `app/drizzle/0000_steady_malcolm_colcord.sql` — generated migration SQL (CREATE TABLE for all 3 tables, FK, UNIQUE)
- `app/drizzle/meta/_journal.json` — drizzle-kit metadata
- `app/drizzle/meta/0000_snapshot.json` — drizzle-kit snapshot
- `app/server/utils/env.ts:7` — flipped DATABASE_URL from `.optional()` to required `.string().url()`
- `.env.example:5-6` — uncommented DATABASE_URL placeholder, added required-with-format comment

## Acceptance Criteria Check

- [x] Runtime: drizzle-orm@^0.33, pg@^8.12, pg-boss@^10.0 added to dependencies
- [x] Dev: drizzle-kit@^0.24, @types/pg@^8 added to devDependencies
- [x] package-lock.json updated and committed
- [x] drizzle.config.ts exports defineConfig with schema glob, out, dialect, dbCredentials, strict:true, verbose:true
- [x] drizzle.config.ts has comment explaining the process.env CLI exception
- [x] app/server/db/schema/jobs.ts — jobs table with all 10 required columns
- [x] app/server/db/schema/mapping_cache.ts — mappingCache table with UNIQUE constraint
- [x] app/server/db/schema/ai_usage.ts — aiUsage table with FK to jobs.id
- [x] app/server/db/schema.ts — re-exports all three sub-files
- [x] app/server/db/client.ts — Pool(max:20) + drizzle; imports env from utils/env; exports pool + db
- [x] DATABASE_URL changed from optional to required in EnvSchema
- [x] .env.example updated with uncommented placeholder + clarifying comment
- [x] db:generate, db:migrate, db:push, db:studio scripts added to package.json
- [x] drizzle-kit generate completed — drizzle/0000_steady_malcolm_colcord.sql generated
- [x] drizzle/meta/_journal.json and 0000_snapshot.json generated and committed
- [x] npm install completes cleanly
- [x] npx nuxi typecheck passes (exit code 0)
- [x] npm run build passes (✨ Build complete!)
- [x] Generated SQL has correct column types: uuid, text, integer, timestamp with time zone, real
- [x] process.env grep returns only env.ts + drizzle.config.ts

## Verification Output

### npm install (last 5 lines)
```
added 698 packages, and audited 700 packages in 1m
160 packages are looking for funding
  run `npm fund` for details
10 vulnerabilities (9 moderate, 1 high)
To address issues, run: npm audit fix --force
```

### npx drizzle-kit generate output
```
No config path provided, using default 'drizzle.config.ts'
Reading config file '...app/drizzle.config.ts'
3 tables
ai_usage 7 columns 0 indexes 1 fks
jobs 10 columns 0 indexes 0 fks
mapping_cache 9 columns 0 indexes 0 fks
[✓] Your SQL migration file ➜ drizzle/0000_steady_malcolm_colcord.sql 🚀
```

### npx nuxi typecheck output
```
(no output — exit code 0)
```

### npm run build output (tail)
```
Σ Total size: 2.3 MB (548 kB gzip)
[nitro] ✔ You can preview this build using node .output/server/index.mjs
│
└  ✨ Build complete!
```

### cat app/drizzle/0000_steady_malcolm_colcord.sql
```sql
CREATE TABLE IF NOT EXISTS "ai_usage" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "job_id" uuid,
    "model" text NOT NULL,
    "tokens_in" integer NOT NULL,
    "tokens_out" integer NOT NULL,
    "cost_usd" real NOT NULL,
    "created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "jobs" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "status" text NOT NULL,
    "progress_stage" text,
    "progress_pct" integer DEFAULT 0,
    "worker_version" text,
    "canonical_schema_version" text,
    "delta_syncs_used" integer DEFAULT 0,
    "delta_syncs_allowed" integer DEFAULT 3,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mapping_cache" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "source_software" text NOT NULL,
    "table_name" text NOT NULL,
    "field_name" text NOT NULL,
    "target_field" text NOT NULL,
    "confidence" real NOT NULL,
    "reasoning" text,
    "hit_count" integer DEFAULT 1,
    "created_at" timestamp with time zone DEFAULT now(),
    CONSTRAINT "mapping_cache_source_software_table_name_field_name_unique" UNIQUE("source_software","table_name","field_name")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
```

### grep -rn "process\.env" app/ --include='*.ts' (excluding node_modules/.nuxt)
```
app/server/utils/env.ts:10:export const env = EnvSchema.parse(process.env);
app/drizzle.config.ts:2:// ...documented exception comment...
app/drizzle.config.ts:11:    url: process.env.DATABASE_URL!,
```

## Notes

- **costUsd uses `real` (single-precision float)** per spec. This has ~7 decimal digits of precision, which is imprecise for large monetary values but acceptable for per-API-call micro-costs. A future migration to `numeric(12,6)` may be warranted if billing precision requirements increase — noted in schema comment.
- **npm audit** reports 10 vulnerabilities (9 moderate, 1 high) — these are in transitive deps (glob@10.5.0 is flagged but is a drizzle-kit transitive dep). Not introduced by this task's direct deps. No action taken per scope.
- **drizzle-kit generate** did not require a live DB connection — schema generation is purely static. The `process.env.DATABASE_URL!` in drizzle.config.ts is only needed for `migrate`/`push`/`studio`.
- **UNIQUE constraint** on mapping_cache uses Drizzle's `unique()` table-level constraint — generates a named constraint `mapping_cache_source_software_table_name_field_name_unique` in SQL, exactly as expected.
- **FK order**: drizzle-kit correctly deferred the FK from ai_usage → jobs using a DO block (not inline), which means table creation order doesn't matter.
- **schema.ts (file) vs schema/ (dir)**: coexist safely — Node resolves `./schema` to `schema.ts` first, so `import * as schema from './schema'` in client.ts gets all exports.
