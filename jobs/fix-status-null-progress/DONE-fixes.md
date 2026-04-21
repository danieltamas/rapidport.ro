# Completed: status page NULL → NULL direction + misleading 0% spinner
**Task:** ad-hoc bugfix | **Status:** done | **Date:** 2026-04-21

## Problem
`/job/[id]/status` showed `NULL → NULL` as the direction line on jobs created with `sourceSoftware='auto'`, and the header pill showed a `0%` spinner that implied the server was processing when in reality the job was waiting for user action (mapping review, payment).

## Root cause
- `Job` type had `sourceSoftware: string` / `targetSoftware: string` — non-null — but the DB columns became nullable in migration 0008. Vue template literal `${null} → ${null}` + CSS `uppercase` = `NULL → NULL`.
- Status pill rendered `live.pct + '%'` for every non-terminal state. On a just-uploaded job awaiting discover, pct=0 + spinner looked like a frozen server.

## Changes Made
- `app/pages/job/[id]/status.vue` Job type: source/target typed as `string | null`.
- New `direction` computed: returns `null` when either side is null so the template can hide cleanly.
- Template: renders `{{ direction }}` when truthy, otherwise shows "Detectare automată a direcției" as a neutral fallback for auto-direction jobs.
- New `statusPill` computed with four shapes: `success` (pachet gata), `failed` (eșuat), `awaiting` (amber + clock icon — "Necesită acțiune" / "Așteaptă plată"), `processing` (muted + spinner + pct). Pre-payment stages (`mapping`, `reviewing`) and status `mapped` now map to `awaiting` instead of the misleading `processing`.
