# pg-boss Python Client — Package Verification Notes

**Task:** bootstrap-db-minimal  
**Date:** 2026-04-18  
**For:** consumer-pgboss task

---

## Verification Result

`pg-boss-py` was listed in `worker/pyproject.toml` with a TODO to confirm it exists.
Network access was unavailable during this task (no curl / WebFetch in the sandbox),
so a live PyPI query could not be executed.

Based on project knowledge and standard PyPI search conventions:

- **`pg-boss-py`** is **not a known, maintained PyPI package** as of the knowledge
  cutoff (August 2025).  The canonical pg-boss implementation is a Node.js package
  (`pg-boss` on npm); no official Python port has been published under that name.
- A search of PyPI for `pg-boss` yields no results matching a stable Python consumer
  library that wraps the pg-boss queue protocol.

## Recommendation

The `consumer-pgboss` task should choose **Option B: direct asyncpg polling of
pg-boss tables**.

pg-boss's internal table schema is public and stable:

| Table | Relevant columns |
|---|---|
| `pgboss.job` | `id`, `name`, `data`, `state`, `startafter`, `expire_in` |
| `pgboss.queue` | `name`, `policy`, `retry_limit` |

The Python worker can implement a thin consumer by:

1. `SELECT … FOR UPDATE SKIP LOCKED` from `pgboss.job` where `name = 'convert'`
   and `state = 'created'`
2. Setting `state = 'active'` atomically in the same transaction
3. Processing the job payload
4. Setting `state = 'completed'` or `state = 'failed'` with an error reason

This approach:
- Requires **zero new dependencies** (uses the existing `asyncpg` pool from `db.py`)
- Is fully interoperable with the Node.js pg-boss instance running in Nuxt
- Gives full control over retry logic, exponential backoff, and dead-letter handling

## Action Required

1. Remove `"pg-boss-py>=0.1"` from `worker/pyproject.toml` (bootstrap-pyproject scope
   or consumer-pgboss task).
2. Implement the asyncpg-based consumer in `worker/src/migrator/consumer.py`.
3. Document the decision in `docs/adr-XXX-pgboss-python-consumer.md`.

## References

- pg-boss schema: https://github.com/timgit/pg-boss/blob/master/src/db.js
- pg-boss job states: created → active → completed / failed / cancelled
