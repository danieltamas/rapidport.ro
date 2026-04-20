// DELETE /api/me — GDPR account deletion (SPEC §S.11).
//
// Policy (post-deletion state):
//   users              → deletedAt set; email+emailHash anonymized so the slot
//                        can be reused by a new signup of the same address.
//                        We cannot DELETE the row because audit_log and jobs
//                        FK to userId and we must preserve the audit trail +
//                        let in-flight conversions finish cleanly.
//   sessions           → all revoked.
//   magic_link_tokens  → consumed (marks the window closed).
//   mapping_profiles   → deleted outright (user-owned, no company data per SPEC;
//                        nothing to retain).
//   jobs               → LEFT AS-IS. Active ones finish. billingEmail is a
//                        snapshot taken at payment time and stays (legal retention).
//   payments           → LEFT AS-IS (10-year legal retention).
//   audit_log          → userId nulled. The event row stays; identity is gone.
//
// Guarded by user-auth middleware + CSRF middleware (DELETE is a mutation).
import { createHash, randomBytes } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { createError, defineEventHandler, setCookie } from 'h3';
import { db } from '../../db/client';
import {
  auditLog,
  magicLinkTokens,
  mappingProfiles,
  sessions,
  users,
} from '../../db/schema';
import { getUserSession } from '../../utils/auth-user';

function sha256Hex(v: string): string {
  return createHash('sha256').update(v).digest('hex');
}

export default defineEventHandler(async (event) => {
  const current = await getUserSession(event);
  if (!current) throw createError({ statusCode: 401 });
  const userId = current.userId;
  const originalEmail = current.email;

  // Anonymize email — keep the row but strip PII. Rapidport.invalid is a
  // guaranteed-non-delivery TLD per RFC 2606, so the value is syntactically
  // an email (satisfies the UNIQUE + NOT NULL constraint) and guaranteed to
  // never match any real address if the user later re-registers.
  const anonEmail = `deleted+${randomBytes(8).toString('hex')}@rapidport.invalid`;
  const anonEmailHash = sha256Hex(anonEmail);

  await db.transaction(async (tx) => {
    // 1) Revoke all live sessions.
    await tx
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));

    // 2) Burn all unconsumed magic-link tokens for this email.
    await tx
      .update(magicLinkTokens)
      .set({ consumedAt: new Date() })
      .where(and(eq(magicLinkTokens.email, originalEmail), isNull(magicLinkTokens.consumedAt)));

    // 3) Drop mapping profiles (user-owned, no company data per SPEC).
    await tx.delete(mappingProfiles).where(eq(mappingProfiles.userId, userId));

    // 4) Anonymize audit-log references (keep event, lose identity).
    await tx.update(auditLog).set({ userId: null }).where(eq(auditLog.userId, userId));

    // 5) Soft-delete the user row with anonymized email so the address can be
    //    re-registered cleanly. deletedAt stamps the decision for audit.
    await tx
      .update(users)
      .set({ email: anonEmail, emailHash: anonEmailHash, deletedAt: new Date() })
      .where(eq(users.id, userId));
  });

  // Clear the session cookie client-side — caller is now unauthenticated.
  setCookie(event, 'session', '', { maxAge: 0, path: '/' });

  return { ok: true };
});
