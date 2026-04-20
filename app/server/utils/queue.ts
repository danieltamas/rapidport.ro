// pg-boss publisher wrapper. The ONLY place that instantiates a pg-boss client
// from the Nuxt side. Handlers call publishConvert() / publishDiscover().
//
// The Python worker (worker/src/migrator/consumer.py) polls the same pgboss.* schema
// directly via asyncpg — this file is the producer side only.
//
// A single instance is held for the lifetime of the Nitro process. The
// queue-shutdown plugin calls stopQueue() on Nitro shutdown.

import PgBoss from 'pg-boss';
import { env } from './env';
import type { ConvertPayload, DiscoverPayload } from '../types/queue';

const QUEUE_NAMES = ['convert', 'discover'] as const;
type QueueName = (typeof QUEUE_NAMES)[number];

let bossPromise: Promise<PgBoss> | null = null;

async function getBoss(): Promise<PgBoss> {
  if (bossPromise) return bossPromise;
  bossPromise = (async () => {
    const boss = new PgBoss({ connectionString: env.DATABASE_URL });
    boss.on('error', (e: Error) => {
      // Cause only — never the payload.
      console.warn('pgboss_error', { name: e.name });
    });
    await boss.start();
    // pg-boss v10 requires explicit queue creation before send().
    // Idempotent — safe to call on every boot.
    for (const name of QUEUE_NAMES) {
      await boss.createQueue(name);
    }
    return boss;
  })();
  return bossPromise;
}

async function publish<T extends object>(name: QueueName, payload: T): Promise<string | null> {
  const boss = await getBoss();
  return boss.send(name, payload);
}

export function publishConvert(payload: ConvertPayload): Promise<string | null> {
  return publish('convert', payload);
}

export function publishDiscover(payload: DiscoverPayload): Promise<string | null> {
  return publish('discover', payload);
}

export async function stopQueue(): Promise<void> {
  if (!bossPromise) return;
  const promise = bossPromise;
  bossPromise = null;
  try {
    const boss = await promise;
    await boss.stop({ graceful: true, wait: false });
  } catch (e) {
    console.warn('pgboss_stop_failed', { name: (e as Error).name });
  }
}
