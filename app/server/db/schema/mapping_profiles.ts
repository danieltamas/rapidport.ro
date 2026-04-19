import { pgTable, uuid, text, timestamp, jsonb, boolean, integer, index } from 'drizzle-orm/pg-core';
import { users } from './users';

// Named, reusable mapping rule sets saved by users (or promoted to public by admin).
// Consumed by the Phase 2 mapping-review UI for save/load. `userId` is nullable so
// system/public profiles can exist without an owner. `mappings` is opaque jsonb
// whose shape is owned by the pages-mapping task. `adoptionCount` feeds admin
// analytics for promoting popular profiles via `isPublic`.
export const mappingProfiles = pgTable(
  'mapping_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id),
    name: text('name').notNull(),
    sourceSoftwareVersion: text('source_software_version'),
    targetSoftwareVersion: text('target_software_version'),
    mappings: jsonb('mappings').notNull(),
    isPublic: boolean('is_public').default(false).notNull(),
    adoptionCount: integer('adoption_count').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userIdIdx: index().on(t.userId),
    isPublicIdx: index().on(t.isPublic),
  }),
);
