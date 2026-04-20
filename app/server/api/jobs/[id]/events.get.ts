// GET /api/jobs/[id]/events — Server-Sent Events stream of job progress.
//
// Behaviour:
//   • Validates `id` as UUID, then `assertJobAccess(id, event)` (FIRST).
//   • Polls the `jobs` row every 2s; emits a default `message` event with
//     `{ stage, pct, status }` only when any field has changed since the last push.
//   • Heartbeat named event `heartbeat` every 15s so reverse proxies don't close idle
//     streams. Named events don't fire default EventSource.onmessage handlers.
//   • Terminal statuses (`succeeded` | `failed` | `expired`) trigger a final event
//     then close the stream.
//   • Client disconnect (stream `onClosed`) breaks the loop — no zombie pollers.
//   • Hard 10-minute cap; emits a final `{ timeout: true }` event then closes.
//     Client auto-reconnects via EventSource.
//
// No PII emitted — only stage / pct / status. No raw SQL — Drizzle `eq` only.
import { createEventStream, defineEventHandler, getValidatedRouterParams } from 'h3';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '~/server/db/client';
import { jobs } from '~/server/db/schema';
import { assertJobAccess } from '~/server/utils/assert-job-access';

const ParamsSchema = z.object({ id: z.string().uuid() });

const POLL_INTERVAL_MS = 2_000;
const HEARTBEAT_INTERVAL_MS = 15_000;
const MAX_RUNTIME_MS = 10 * 60 * 1_000;

type TerminalStatus = 'succeeded' | 'failed' | 'expired';
const TERMINAL_STATUSES: ReadonlySet<TerminalStatus> = new Set(['succeeded', 'failed', 'expired']);

interface ProgressSnapshot {
  stage: string | null;
  pct: number;
  status: string;
}

export default defineEventHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, ParamsSchema.parse);

  // FIRST — ownership check. Throws 403/404 on failure; no data leaked on denial.
  await assertJobAccess(id, event);

  const stream = createEventStream(event);

  let lastSnapshot: ProgressSnapshot | null = null;
  let closed = false;

  const pollOnce = async (): Promise<ProgressSnapshot | null> => {
    const rows = await db
      .select({
        stage: jobs.progressStage,
        pct: jobs.progressPct,
        status: jobs.status,
      })
      .from(jobs)
      .where(eq(jobs.id, id))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      stage: row.stage,
      pct: row.pct ?? 0,
      status: row.status,
    };
  };

  const snapshotsEqual = (a: ProgressSnapshot | null, b: ProgressSnapshot): boolean =>
    a !== null && a.stage === b.stage && a.pct === b.pct && a.status === b.status;

  const pushSnapshot = async (snap: ProgressSnapshot) => {
    await stream.push({ data: JSON.stringify(snap) });
  };

  const close = async () => {
    if (closed) return;
    closed = true;
    clearInterval(pollTimer);
    clearInterval(heartbeatTimer);
    clearTimeout(maxRuntimeTimer);
    try {
      await stream.close();
    } catch {
      // Stream may already be torn down; ignore.
    }
  };

  const pollTimer = setInterval(() => {
    if (closed) return;
    void (async () => {
      try {
        const snap = await pollOnce();
        if (closed) return;
        if (!snap) {
          // Row vanished (e.g. deleted by admin); close defensively.
          await close();
          return;
        }
        if (!snapshotsEqual(lastSnapshot, snap)) {
          lastSnapshot = snap;
          await pushSnapshot(snap);
        }
        if (TERMINAL_STATUSES.has(snap.status as TerminalStatus)) {
          await close();
        }
      } catch {
        // Transient DB errors shouldn't kill the stream; next tick retries.
      }
    })();
  }, POLL_INTERVAL_MS);

  const heartbeatTimer = setInterval(() => {
    if (closed) return;
    // Named event — clients ignore it unless they listen for 'heartbeat'. Keeps
    // reverse proxies (Caddy, nginx) from closing the idle connection.
    void stream.push({ event: 'heartbeat', data: '' }).catch(() => {
      // Push failed — client likely gone; onClosed will clean up.
    });
  }, HEARTBEAT_INTERVAL_MS);

  const maxRuntimeTimer = setTimeout(() => {
    void (async () => {
      if (closed) return;
      try {
        await stream.push({ data: JSON.stringify({ timeout: true }) });
      } catch {
        /* ignore */
      }
      await close();
    })();
  }, MAX_RUNTIME_MS);

  // Client-side disconnect (request aborted) — h3 fires onClosed. Tears down all timers.
  stream.onClosed(() => {
    void close();
  });

  // Prime with the current snapshot so clients get immediate state on connect.
  try {
    const initial = await pollOnce();
    if (initial) {
      lastSnapshot = initial;
      await pushSnapshot(initial);
      if (TERMINAL_STATUSES.has(initial.status as TerminalStatus)) {
        // Already terminal — close on next tick so the initial event flushes first.
        setTimeout(() => void close(), 0);
      }
    }
  } catch {
    // Initial read failure is non-fatal; the poll loop will retry.
  }

  return stream.send();
});
