import { pgTable, uuid, text, integer, bigint, jsonb, timestamp, index, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { users } from './users';
import { mappingProfiles } from './mapping_profiles';

// upload_disk_filename added in migration 0003 (Wave 4 → 4b prep) — separates the
// server-controlled on-disk name (UUID-based) from the user's display filename.
// Phase 1 columns (id, status, progress*, *Version, deltaSync*, createdAt, updatedAt)
// are preserved byte-for-byte. Phase 2 adds user linkage, anonymous access token,
// source/target software, upload metadata, discovery + mapping result blobs, mapping
// profile FK, billing email, and 30-day expiry.
export const jobs = pgTable(
  'jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    status: text('status').notNull(),
    progressStage: text('progress_stage'),
    progressPct: integer('progress_pct').default(0),
    workerVersion: text('worker_version'),
    canonicalSchemaVersion: text('canonical_schema_version'),
    deltaSyncsUsed: integer('delta_syncs_used').default(0),
    deltaSyncsAllowed: integer('delta_syncs_allowed').default(3),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    // Phase 2 additions
    userId: uuid('user_id').references(() => users.id),
    anonymousAccessToken: text('anonymous_access_token').notNull(),
    sourceSoftware: text('source_software').notNull(),
    targetSoftware: text('target_software').notNull(),
    uploadFilename: text('upload_filename'),
    // Server-controlled on-disk filename `{randomUUID}.{ext}` under
    // /data/jobs/{id}/upload/. Distinct from uploadFilename (the user's
    // original name, kept for display only). Consumers (discover,
    // download/resync, webhook → publishConvert) MUST use this for I/O.
    uploadDiskFilename: text('upload_disk_filename'),
    uploadSize: bigint('upload_size', { mode: 'number' }),
    discoveryResult: jsonb('discovery_result'),
    mappingResult: jsonb('mapping_result'),
    mappingProfileId: uuid('mapping_profile_id').references((): AnyPgColumn => mappingProfiles.id),
    billingEmail: text('billing_email'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    // Email notification sent-at markers (migration 0005). Each is null until
    // `schedule-tasks/email-notification-sweep` fires the corresponding email
    // and stamps it. Fire-once semantics — admin re-run / user resync won't
    // re-send, matches the /job/[id]/status live UI.
    emailMappingReadySentAt: timestamp('email_mapping_ready_sent_at', { withTimezone: true }),
    emailConversionReadySentAt: timestamp('email_conversion_ready_sent_at', { withTimezone: true }),
  },
  (t) => ({
    userIdIdx: index().on(t.userId),
    anonymousAccessTokenIdx: index().on(t.anonymousAccessToken),
    expiresAtIdx: index().on(t.expiresAt),
  }),
);
