import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { env } from '../utils/env';
import * as schema from './schema';

// Single pool, max 20 per CODING.md §6 "Connection pooling". Never create pools inside
// request handlers. Exported so the Nitro shutdown hook can call pool.end() gracefully.
export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 20,
});

export const db = drizzle(pool, { schema });
