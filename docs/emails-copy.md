# Email copy — Rapidport

Source of truth for transactional email subjects and bodies. Romanian only. Voice: direct, sober, accountant-formal ("Vă"). No marketing-speak, no emoji, no superlatives. Signed off by Dani 2026-04-20.

Common conventions:
- `{{idShort}}` = first 8 chars of the job UUID (matches `pay.vue`'s display).
- All bodies open with `Bună,` (single comma, not "Bună ziua,").
- Footer line is identical across templates: `Rapidport — portare WinMentor ⇄ SAGA, în ambele direcții`.
- Sender: `Rapidport <no-reply@rapidport.ro>` (`env.EMAIL_FROM`).
- Invoices: always reference **Gamerina SRL** as the issuing entity in the payment-confirmed email.

Templates approved for v1: **5 total** (magic-link + 4 below).

Two flows were intentionally **dropped** by Dani:
- ❌ `job-submitted` — status page surfaces this in real time; no email needed.
- ❌ `job-failed` — same; failures are visible in the status UI. Reduces email noise.

---

## 0. magic-link  *(SHIPPED — `app/server/api/auth/magic-link.post.ts:renderEmail`)*

**Subject:** `Codul dvs. de autentificare Rapidport`

**Body (text):**
```
Codul de autentificare Rapidport: {{code}}

Valabil 15 minute, o singură folosință.

Dacă nu ați cerut acest cod, ignorați acest email.
```

HTML version: 6-digit code in monospace block, 36px, letter-spacing 8px, light-grey background. Already implemented.

---

## 1. mapping-ready  *(NOT YET WIRED)*

Sent when AI mapping completes and the user must review before paying.

**Trigger location:** worker pipeline, when `progressStage` transitions into `mapped` (or `reviewing`). Worker is Python; needs a notification glue to Nuxt — see "Deferred wiring" below.

**Subject:** `Migrarea #{{idShort}} — maparea câmpurilor e gata pentru verificare`

**Body:**
```
Bună,

Maparea automată pentru migrarea #{{idShort}} e gata. Vă rugăm să o verificați și să o confirmați înainte de plată.

Verificați maparea: {{mappingUrl}}

Pentru o experiență optimă, folosiți un laptop sau desktop.
```

`{{mappingUrl}}` = `${APP_URL}/job/${id}/mapping`.

---

## 2. payment-confirmed  *(WIRED via `stripe.post.ts`)*

Sent from the Stripe webhook handler after `payment_intent.succeeded` is processed.

**Subject:** `Plata pentru migrarea #{{idShort}} — confirmată`

**Body:**
```
Bună,

Am primit plata pentru migrarea #{{idShort}}. Începem conversia — durează 3–15 minute.

Vă trimitem fișierele de import SAGA imediat ce sunt gata.

Detalii: {{statusUrl}}

Factura va fi emisă de Gamerina SRL și va sosi separat prin SmartBill.
```

`{{statusUrl}}` = `${APP_URL}/job/${id}/status`.

---

## 3. conversion-ready  *(NOT YET WIRED)*

Sent when `bundle_output()` completes and the job is marked `succeeded`.

**Trigger location:** worker pipeline, in `consumer.run_convert` immediately after `bundle_output(output_dir)` succeeds. Same notification-glue problem as `mapping-ready`.

**Subject:** `Migrarea #{{idShort}} — fișierele SAGA sunt gata`

**Body:**
```
Bună,

Conversia migrării #{{idShort}} s-a încheiat. Pachetul cu fișierele de import SAGA e gata.

Descărcați: {{downloadUrl}}
Ghid de import în SAGA: {{guideUrl}}

Pachetul rămâne disponibil 30 de zile.

Aveți 3 sincronizări delta incluse pentru a aduce datele noi din WinMentor în SAGA pe parcursul tranziției.
```

URLs:
- `{{downloadUrl}}` = `${APP_URL}/api/jobs/${id}/download`.
- `{{guideUrl}}` = `${APP_URL}/guide/saga-import.pdf` (PDF still pending under `email-guide / saga-import-guide`).

---

## 4. sync-complete  *(NOT YET WIRED)*

Sent when a delta-sync (resync) finishes successfully.

**Trigger location:** worker pipeline, when a convert job that originated from `/api/jobs/[id]/resync` finishes. Worker doesn't currently distinguish initial-convert from resync — see "Open question" below.

**Subject:** `Sincronizare delta migrarea #{{idShort}} — gata`

**Body:**
```
Bună,

Sincronizarea delta pentru migrarea #{{idShort}} s-a încheiat. Pachetul actualizat e gata.

Descărcați: {{downloadUrl}}

Sincronizări delta folosite: {{used}} din {{allowed}}.
```

---

## Deferred wiring (mapping-ready / conversion-ready / sync-complete)

These three are triggered by Python worker state transitions, but the Resend client lives only in Nuxt (`app/server/utils/email.ts`). Three options for a future task:

1. **Polling cron in Nuxt** — pg-boss scheduled job sweeps `jobs WHERE status=... AND email_<type>_sent_at IS NULL`. Adds 3 nullable timestamp columns to `jobs`. Simple.
2. **Postgres LISTEN/NOTIFY** — worker `NOTIFY` channel; Nuxt LISTEN; on event send email. Fewer moving parts but `node-postgres` listener needs to live as a Nitro plugin and survive reconnects.
3. **`pending_emails` queue table** — worker INSERTs rows, Nuxt cron sweeps. Cleanest separation, but a new table.

Recommendation when this is picked up: option 1 (lightweight, additive nullable columns, reuses existing pg-boss scheduling once the cleanup-cron task ships).

## Open question for `sync-complete`

The worker reuses the `convert` queue for delta-syncs (see `resync.post.ts` — sends a fresh `ConvertPayload` with `mapping_profile=null`). The worker can't currently tell whether a given convert run is the initial conversion or a resync. To send the right template:

- Either the resync handler publishes to a distinct `convert-resync` queue (worker subscribes to both, same pipeline), OR
- The `ConvertPayload` gets an `is_resync: bool` flag (Pydantic + TS mirror) and the worker bumps a counter the email sweep can read.

Decide when implementing the deferred wiring; flag for next agent.
