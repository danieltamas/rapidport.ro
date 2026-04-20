// Shared GDPR purge of a user's PII. Called by both:
//   - DELETE /api/me              (user-initiated)
//   - DELETE /api/admin/users/[id] (admin-initiated, Wave B)
//
// Policy (post-purge state):
//   users              → deletedAt set; email + emailHash anonymized so the
//                        slot can be reused by a new signup of the same address.
//   sessions           → all revoked.
//   magic_link_tokens  → consumed (window closed).
//   mapping_profiles   → deleted outright (user-owned, no company data per SPEC).
//   audit_log          → userId nulled (event preserved, identity gone).
//   jobs               → LEFT AS-IS (active conversions finish; billingEmail
//                        snapshot is legally retained).
//   payments           → LEFT AS-IS (10-year legal retention).
//
// All steps run in a single Drizzle transaction. Caller is responsible for
// any session-cookie clearing on the response.
import { createHash, randomBytes } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db/client';
import { auditLog, magicLinkTokens, mappingProfiles, sessions, users } from '../db/schema';

function sha256Hex(v: string): string {
  return createHash('sha256').update(v).digest('hex');
}

export type PurgeUserInput = {
  userId: string;
  /** Original email is needed to consume any unconsumed magic-link tokens. */
  email: string;
};

export async function purgeUserData(input: PurgeUserInput): Promise<void> {
  const { userId, email } = input;

  // rapidport.invalid is RFC 2606's guaranteed-non-delivery TLD — syntactically
  // valid email so it satisfies UNIQUE/NOT NULL, but never matches a real one.
  const anonEmail = `deleted+${randomBytes(8).toString('hex')}@rapidport.invalid`;
  const anonEmailHash = sha256Hex(anonEmail);

  await db.transaction(async (tx) => {
    await tx
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));

    await tx
      .update(magicLinkTokens)
      .set({ consumedAt: new Date() })
      .where(and(eq(magicLinkTokens.email, email), isNull(magicLinkTokens.consumedAt)));

    await tx.delete(mappingProfiles).where(eq(mappingProfiles.userId, userId));

    await tx.update(auditLog).set({ userId: null }).where(eq(auditLog.userId, userId));

    await tx
      .update(users)
      .set({ email: anonEmail, emailHash: anonEmailHash, deletedAt: new Date() })
      .where(eq(users.id, userId));
  });
}
