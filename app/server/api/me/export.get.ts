// GET /api/me/export — GDPR data-portability dump (SPEC §S.11).
// Streams a JSON file with every piece of data we hold about the caller:
//   - account (email, createdAt, lastLoginAt)
//   - sessions (active + revoked; tokenHash included so user can see what's recorded,
//     NOT the plaintext — plaintext was never stored)
//   - magicLinkTokens (issuance history, tokenHash only)
//   - jobs (everything except other users' data)
//   - payments (for user's jobs)
//   - auditLog (entries touching this user)
//   - mappingProfiles (this user's)
//
// Guarded by user-auth middleware. Never throws on missing sub-queries — returns
// empty arrays so the file is always well-formed.
import { eq } from 'drizzle-orm';
import { createError, defineEventHandler, setResponseHeader } from 'h3';
import { db } from '../../db/client';
import {
  auditLog,
  jobs,
  magicLinkTokens,
  mappingProfiles,
  payments,
  sessions,
  users,
} from '../../db/schema';
import { getUserSession } from '../../utils/auth-user';

export default defineEventHandler(async (event) => {
  const current = await getUserSession(event);
  if (!current) throw createError({ statusCode: 401 });

  const userId = current.userId;

  const [accountRows, sessionRows, jobRows, profileRows, auditRows] = await Promise.all([
    db.select().from(users).where(eq(users.id, userId)).limit(1),
    db.select().from(sessions).where(eq(sessions.userId, userId)),
    db.select().from(jobs).where(eq(jobs.userId, userId)),
    db.select().from(mappingProfiles).where(eq(mappingProfiles.userId, userId)),
    db.select().from(auditLog).where(eq(auditLog.userId, userId)),
  ]);

  const account = accountRows[0];
  if (!account) throw createError({ statusCode: 404 });

  // Magic link history is keyed by email (pre-user-creation tokens are in here too).
  const magicLinkRows = await db
    .select()
    .from(magicLinkTokens)
    .where(eq(magicLinkTokens.email, account.email));

  // Payments are per-job; collect by any of the user's jobs.
  let paymentRows: Array<typeof payments.$inferSelect> = [];
  if (jobRows.length > 0) {
    const jobIds = jobRows.map((j) => j.id);
    // drizzle doesn't have inArray inline — do a loop. Small N, fine.
    const chunks = await Promise.all(
      jobIds.map((id) => db.select().from(payments).where(eq(payments.jobId, id))),
    );
    paymentRows = chunks.flat();
  }

  const dump = {
    generatedAt: new Date().toISOString(),
    schema: { version: 1, note: 'GDPR data portability export per SPEC §S.11' },
    account: {
      id: account.id,
      email: account.email,
      emailHash: account.emailHash,
      createdAt: account.createdAt,
      lastLoginAt: account.lastLoginAt,
      deletedAt: account.deletedAt,
    },
    sessions: sessionRows.map((s) => ({
      id: s.id,
      tokenHash: s.tokenHash,
      ipAddress: s.ipAddress,
      userAgent: s.userAgent,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      revokedAt: s.revokedAt,
    })),
    magicLinkTokens: magicLinkRows.map((m) => ({
      id: m.id,
      email: m.email,
      tokenHash: m.tokenHash,
      createdAt: m.createdAt,
      expiresAt: m.expiresAt,
      consumedAt: m.consumedAt,
      ipAddress: m.ipAddress,
    })),
    jobs: jobRows,
    payments: paymentRows,
    mappingProfiles: profileRows,
    auditLog: auditRows,
  };

  const filename = `rapidport-export-${account.email.replace(/[^a-z0-9]+/gi, '-')}-${new Date().toISOString().slice(0, 10)}.json`;
  setResponseHeader(event, 'content-type', 'application/json; charset=utf-8');
  setResponseHeader(event, 'content-disposition', `attachment; filename="${filename}"`);
  return dump;
});
