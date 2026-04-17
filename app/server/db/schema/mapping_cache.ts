import { pgTable, uuid, text, real, integer, timestamp, unique } from 'drizzle-orm/pg-core';

export const mappingCache = pgTable(
  'mapping_cache',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sourceSoftware: text('source_software').notNull(),
    tableName: text('table_name').notNull(),
    fieldName: text('field_name').notNull(),
    targetField: text('target_field').notNull(),
    confidence: real('confidence').notNull(),
    reasoning: text('reasoning'),
    hitCount: integer('hit_count').default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    uniqMapping: unique().on(t.sourceSoftware, t.tableName, t.fieldName),
  }),
);
