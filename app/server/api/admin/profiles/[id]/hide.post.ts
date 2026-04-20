// POST /api/admin/profiles/[id]/hide — set mapping_profiles.isPublic=false.
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import {
  createError,
  defineEventHandler,
  getHeader,
  getRequestIP,
  getValidatedRouterParams,
  readValidatedBody,
} from 'h3';
import { z } from 'zod';
import { db } from '../../../../db/client';
import { adminAuditLog, mappingProfiles } from '../../../../db/schema';
import { getAdminSession } from '../../../../utils/auth-admin';

const ParamsSchema = z.object({ id: z.string().uuid() });
const BodySchema = z.object({ reason: z.string().min(5).max(500) });

export default defineEventHandler(async (event) => {
  const admin = await getAdminSession(event);
  if (!admin) throw createError({ statusCode: 401 });

  const { id } = await getValidatedRouterParams(event, ParamsSchema.parse);
  const body = await readValidatedBody(event, BodySchema.parse);

  const [existing] = await db
    .select({ isPublic: mappingProfiles.isPublic })
    .from(mappingProfiles)
    .where(eq(mappingProfiles.id, id))
    .limit(1);
  if (!existing) throw createError({ statusCode: 404 });
  if (!existing.isPublic) {
    throw createError({ statusCode: 409, data: { error: 'already_hidden' } });
  }

  const ipHash = createHash('sha256')
    .update(getRequestIP(event, { xForwardedFor: true }) ?? '')
    .digest('hex');
  const ua = getHeader(event, 'user-agent')?.slice(0, 500);

  await db.transaction(async (tx) => {
    await tx
      .update(mappingProfiles)
      .set({ isPublic: false })
      .where(eq(mappingProfiles.id, id));
    await tx.insert(adminAuditLog).values({
      adminEmail: admin.email,
      action: 'profile_hidden',
      targetType: 'mapping_profile',
      targetId: id,
      details: { reason: body.reason },
      ipHash,
      userAgent: ua,
    });
  });

  return { ok: true };
});
