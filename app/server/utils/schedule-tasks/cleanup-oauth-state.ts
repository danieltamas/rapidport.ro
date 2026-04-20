// cleanup.oauth-state — delete expired admin_oauth_state rows (PKCE state that
// was never consumed). 10-min TTL is the usual window; this sweeps anything
// past expires_at.
import { lt, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { adminOauthState } from '../../db/schema';

// admin_oauth_state has no expiresAt column — PKCE windows are enforced by
// `createdAt < now() - 10 min`. Match the 10-min TTL that auth-google/callback.get.ts
// already validates on the read side.
export async function runCleanupOauthState(): Promise<{ deleted: number }> {
  const deleted = await db
    .delete(adminOauthState)
    .where(lt(adminOauthState.createdAt, sql`now() - interval '10 minutes'`))
    .returning({ state: adminOauthState.state });

  return { deleted: deleted.length };
}
