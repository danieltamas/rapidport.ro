// POST /api/anaf/lookup — proxy to demoanaf.ro/api/company/:cui.
// Body Zod: { cui: string } (accepts 'RO...' or numeric). Returns the normalized
// AnafCompany shape. Client polls this endpoint when vatStatus === 'verifying'.
//
// Rate-limited (middleware/rate-limit.ts): 30/hr per IP — lenient since users
// may retype. No CSRF requirement would normally apply to POST, but this is a
// mutation-shaped call to an external service, and we keep middleware's
// enforce-all-POST-mutations stance rather than bypass.
import { createError, defineEventHandler, readValidatedBody } from 'h3';
import { z } from 'zod';
import { AnafError, fetchCompany, normalizeCui } from '../../utils/anaf';

const BodySchema = z.object({
  cui: z.string().min(2).max(16),
});

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, BodySchema.parse);

  const numeric = normalizeCui(body.cui);
  if (numeric === null) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      data: { error: 'invalid_cui' },
    });
  }

  try {
    const company = await fetchCompany(numeric);
    return { ok: true, company };
  } catch (err) {
    if (err instanceof AnafError) {
      if (err.kind === 'not-found') {
        throw createError({ statusCode: 404, data: { error: 'cui_not_found' } });
      }
      if (err.kind === 'rate-limited') {
        throw createError({ statusCode: 429, data: { error: 'upstream_rate_limited' } });
      }
      throw createError({
        statusCode: 502,
        data: { error: 'upstream_error', kind: err.kind },
      });
    }
    throw createError({ statusCode: 500, data: { error: 'internal' } });
  }
});
