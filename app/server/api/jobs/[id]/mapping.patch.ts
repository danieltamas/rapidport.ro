// PATCH /api/jobs/[id]/mapping — persist the user's edited field mapping.
//
// Access: assertJobAccess (admin → user → anonymous token) runs FIRST.
// Body is Zod-validated and size-bounded (~2MB via Content-Length pre-check).
// State guard: mapping can only be edited while progressStage is 'mapped' or
// 'reviewing' — once conversion/payment has advanced the job, the mapping is
// locked. When editing from 'mapped', we advance the stage to 'reviewing'.
import { eq } from 'drizzle-orm';
import { createError, defineEventHandler, getRequestHeader, getValidatedRouterParams, readValidatedBody } from 'h3';
import { z } from 'zod';
import { db } from '../../../db/client';
import { jobs } from '../../../db/schema';
import { assertJobAccess } from '../../../utils/assert-job-access';

const MAX_BODY_BYTES = 2 * 1024 * 1024; // ~2MB

const ParamsSchema = z.object({ id: z.string().uuid() });

const MappingEntrySchema = z.object({
  sourceTable: z.string().min(1).max(100),
  sourceField: z.string().min(1).max(100),
  targetTable: z.string().min(1).max(100),
  targetField: z.string().min(1).max(100),
  confidence: z.number().min(0).max(1).optional(),
  userEdited: z.boolean().optional(),
});

const BodySchema = z.object({
  mappings: z.array(MappingEntrySchema).min(1).max(5000),
});

// States where editing the mapping is still allowed. Anything past 'reviewing'
// (e.g., 'converting', 'ready', 'failed') locks the mapping — the worker has
// taken over or the job is terminal.
const EDITABLE_STAGES = new Set(['mapped', 'reviewing']);

export default defineEventHandler(async (event) => {
  // 1. Validate route param.
  const { id } = await getValidatedRouterParams(event, ParamsSchema.parse);

  // 2. Access check FIRST — admin/user/anonymous. Returns the job row.
  const job = await assertJobAccess(id, event);

  // 3. Pre-read size guard (cheap 413 before we buffer the body).
  const contentLength = getRequestHeader(event, 'content-length');
  if (contentLength) {
    const n = Number.parseInt(contentLength, 10);
    if (Number.isFinite(n) && n > MAX_BODY_BYTES) {
      throw createError({ statusCode: 413, statusMessage: 'Payload Too Large' });
    }
  }

  // 4. Validate body with Zod (Nitro returns 400 on throw from the parser).
  const body = await readValidatedBody(event, BodySchema.parse);

  // 5. State guard — only editable while 'mapped' or 'reviewing'.
  const stage = job.progressStage;
  if (!stage || !EDITABLE_STAGES.has(stage)) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Mapping is not editable in the current job state',
    });
  }

  // 6. Update via Drizzle. Advance 'mapped' → 'reviewing'; keep 'reviewing'.
  const nextStage = stage === 'mapped' ? 'reviewing' : stage;
  await db
    .update(jobs)
    .set({
      mappingResult: body,
      progressStage: nextStage,
      updatedAt: new Date(),
    })
    .where(eq(jobs.id, id));

  return { ok: true, count: body.mappings.length };
});
