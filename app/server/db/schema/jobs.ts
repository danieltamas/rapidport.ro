import { pgTable, uuid, text, integer, bigint, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './users';
// NOTE (orchestrator): re-enable the line below at group-merge once schema-profiles
// has landed `app/server/db/schema/mapping_profiles.ts`.
// import { mappingProfiles } from './mapping_profiles';
// import type { AnyPgColumn } from 'drizzle-orm/pg-core';

// Phase 1 columns (id, status, progress*, *Version, deltaSync*, createdAt, updatedAt)
// are preserved byte-for-byte. Phase 2 adds user linkage, anonymous access token,
// source/target software, upload metadata, discovery + mapping result blobs, mapping
// profile FK (deferred — see note above), billing email, and 30-day expiry.
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
    uploadSize: bigint('upload_size', { mode: 'number' }),
    discoveryResult: jsonb('discovery_result'),
    mappingResult: jsonb('mapping_result'),
    // mappingProfileId FK is deferred until schema-profiles lands mapping_profiles.ts.
    // Orchestrator must replace this declaration at group-merge with:
    //   mappingProfileId: uuid('mapping_profile_id').references((): AnyPgColumn => mappingProfiles.id),
    mappingProfileId: uuid('mapping_profile_id'),
    billingEmail: text('billing_email'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
  },
  (t) => ({
    userIdIdx: index().on(t.userId),
    anonymousAccessTokenIdx: index().on(t.anonymousAccessToken),
    expiresAtIdx: index().on(t.expiresAt),
  }),
);
