// cleanup.orphan-files — delete `/data/jobs/<name>/` dirs that don't match any
// live or expired jobs.id. Orphans come from partial uploads + manual fs edits.
// Runs daily to keep disk in sync with the DB without blocking the tighter
// cleanup-jobs-files sweep.
import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { inArray } from 'drizzle-orm';
import { db } from '../../db/client';
import { jobs } from '../../db/schema';
import { env } from '../env';

const DATA_ROOT = env.DATA_ROOT;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function runCleanupOrphanFiles(): Promise<{ deleted: number }> {
  let entries: string[];
  try {
    entries = await readdir(DATA_ROOT);
  } catch {
    // Data dir doesn't exist yet (fresh box). Nothing to do.
    return { deleted: 0 };
  }

  const candidates = entries.filter((n) => UUID_RE.test(n));
  if (candidates.length === 0) return { deleted: 0 };

  // Which candidates DO match a jobs row?
  const rows = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(inArray(jobs.id, candidates));
  const known = new Set(rows.map((r) => r.id));

  const orphans = candidates.filter((n) => !known.has(n));

  let deleted = 0;
  for (const name of orphans) {
    try {
      await rm(join(DATA_ROOT, name), { recursive: true, force: true });
      deleted += 1;
    } catch {
      // best-effort — the next sweep will pick it up if the delete failed.
    }
  }

  return { deleted };
}
