import { pgTable, uuid, text, jsonb, timestamp, index } from 'drizzle-orm/pg-core';

// Append-only. NEVER purged — kept for security forensics and regulator trail.
// Every admin mutation AND every passive read of customer data MUST write a row
// here (see CLAUDE.md "Critical Rules"). adminEmail is the Google-verified
// allowlisted address. targetType/targetId are free-form to allow non-UUID
// targets (e.g., Stripe payment intent IDs); validation is at the handler.
export const adminAuditLog = pgTable(
  'admin_audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    adminEmail: text('admin_email').notNull(),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    details: jsonb('details'),
    ipHash: text('ip_hash'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    adminEmailIdx: index().on(t.adminEmail),
    actionIdx: index().on(t.action),
    createdAtIdx: index().on(t.createdAt),
  }),
);
