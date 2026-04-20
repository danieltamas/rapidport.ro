// PUT /api/jobs/[id]/upload — upload the WinMentor archive for a job.
// Spec: SPEC.md §2.2 "Upload" + §S.10 "Rate Limiting".
//
// Ordering (load-bearing):
//   1. Validate UUID path param (Zod).
//   2. assertJobAccess(jobId, event) — FIRST per CLAUDE.md critical rules.
//   3. Enforce 500 MB cap via Content-Length header BEFORE buffering. Caddy is
//      the first line of defence in prod; this is belt-and-suspenders.
//   4. Read a single multipart `file` part via H3's readMultipartFormData.
//   5. Magic-byte sniff — do NOT trust filename or Content-Type. Supported:
//        ZIP  (50 4B 03 04 / 50 4B 05 06 / 50 4B 07 08)
//        7z   (37 7A BC AF 27 1C)
//        gzip (1F 8B) — stored as .tgz (tar.gz assumed).
//   6. Persist to `/data/jobs/{id}/upload/{uuid}.{ext}` — never user-controlled
//      filename on disk. mkdir recursive. Original filename is only stored in
//      the DB metadata for display.
//   7. Update jobs row (uploadFilename, uploadSize, progressStage='uploaded').
//
// Protections:
//   - CSRF: auto-enforced by app/server/middleware/csrf.ts (PUT is in the
//     ENFORCED_METHODS set; this route is not under /api/webhooks/).
//   - Rate limit: auto-enforced by app/server/middleware/rate-limit.ts
//     (3 per hour per IP on PUT /api/jobs/*/upload, already wired at line 27).
//   - No file contents logged; original filename is user-controlled so also
//     not logged verbatim.
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import {
  createError,
  defineEventHandler,
  getHeader,
  getValidatedRouterParams,
  readMultipartFormData,
} from 'h3';
import { z } from 'zod';
import { db } from '../../../db/client';
import { jobs } from '../../../db/schema';
import { assertJobAccess } from '../../../utils/assert-job-access';

const ParamsSchema = z.object({ id: z.string().uuid() });

const MAX_UPLOAD_BYTES = 524_288_000; // 500 MB
const DATA_ROOT = '/data/jobs';

type ArchiveExt = 'zip' | 'tgz' | '7z';

// Magic-byte sniff on the first 8 bytes. Returns null when unsupported.
function detectArchiveExt(buf: Uint8Array): ArchiveExt | null {
  if (buf.length < 2) return null;

  // ZIP: PK\x03\x04 (standard), PK\x05\x06 (empty), PK\x07\x08 (spanned)
  if (
    buf.length >= 4 &&
    buf[0] === 0x50 &&
    buf[1] === 0x4b &&
    ((buf[2] === 0x03 && buf[3] === 0x04) ||
      (buf[2] === 0x05 && buf[3] === 0x06) ||
      (buf[2] === 0x07 && buf[3] === 0x08))
  ) {
    return 'zip';
  }

  // 7z: 37 7A BC AF 27 1C
  if (
    buf.length >= 6 &&
    buf[0] === 0x37 &&
    buf[1] === 0x7a &&
    buf[2] === 0xbc &&
    buf[3] === 0xaf &&
    buf[4] === 0x27 &&
    buf[5] === 0x1c
  ) {
    return '7z';
  }

  // gzip: 1F 8B — caller is expected to have supplied a .tar.gz.
  if (buf[0] === 0x1f && buf[1] === 0x8b) {
    return 'tgz';
  }

  return null;
}

export default defineEventHandler(async (event) => {
  // 1) Path param validation.
  const { id } = await getValidatedRouterParams(event, ParamsSchema.parse);

  // 2) Authorization — must be first per CLAUDE.md.
  await assertJobAccess(id, event);

  // 3) Content-Length pre-flight. Reject before reading body.
  const contentLengthRaw = getHeader(event, 'content-length');
  const contentLength = contentLengthRaw ? Number(contentLengthRaw) : NaN;
  if (!Number.isFinite(contentLength) || contentLength <= 0) {
    throw createError({
      statusCode: 411,
      statusMessage: 'Length Required',
      data: { error: 'length_required' },
    });
  }
  if (contentLength > MAX_UPLOAD_BYTES) {
    throw createError({
      statusCode: 413,
      statusMessage: 'Payload Too Large',
      data: { error: 'payload_too_large', maxBytes: MAX_UPLOAD_BYTES },
    });
  }

  // 4) Parse multipart; accept exactly one `file` part.
  const parts = await readMultipartFormData(event);
  if (!parts || parts.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      data: { error: 'missing_file' },
    });
  }

  const fileParts = parts.filter((p) => p.name === 'file');
  if (fileParts.length !== 1) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      data: { error: fileParts.length === 0 ? 'missing_file' : 'multiple_files' },
    });
  }

  const filePart = fileParts[0];
  if (!filePart) {
    // Unreachable — length checked above — but narrows the type for TS.
    throw createError({ statusCode: 400, data: { error: 'missing_file' } });
  }
  const data = filePart.data;
  if (!data || data.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      data: { error: 'empty_file' },
    });
  }
  if (data.length > MAX_UPLOAD_BYTES) {
    // Defence-in-depth in case Content-Length under-reported.
    throw createError({
      statusCode: 413,
      statusMessage: 'Payload Too Large',
      data: { error: 'payload_too_large', maxBytes: MAX_UPLOAD_BYTES },
    });
  }

  // 5) Magic-byte sniff. Never trust filename/Content-Type.
  const head = data.subarray(0, Math.min(8, data.length));
  const ext = detectArchiveExt(head);
  if (!ext) {
    throw createError({
      statusCode: 415,
      statusMessage: 'Unsupported Media Type',
      data: { error: 'unsupported_archive_type' },
    });
  }

  // Original filename (user-controlled). Used for display only; never used in
  // on-disk path. Fall back to 'upload' if missing.
  const originalFilename = typeof filePart.filename === 'string' && filePart.filename.length > 0
    ? filePart.filename.slice(0, 255)
    : 'upload';

  // 6) Persist. Path components are all server-controlled: jobId is validated
  // UUID, the on-disk filename is a fresh UUID, extension is a literal from
  // ArchiveExt. No traversal surface.
  const uploadDir = join(DATA_ROOT, id, 'upload');
  await mkdir(uploadDir, { recursive: true });
  const diskName = `${randomUUID()}.${ext}`;
  const diskPath = join(uploadDir, diskName);
  await writeFile(diskPath, data);

  // 7) Update DB — Drizzle only, parameterized. uploadFilename keeps the user's
  // original name (display only); uploadDiskFilename is the server-controlled
  // {randomUUID}.{ext} so consumers (discover, download/resync, webhook→convert)
  // can build the on-disk path without readdir.
  await db
    .update(jobs)
    .set({
      uploadFilename: originalFilename,
      uploadDiskFilename: diskName,
      uploadSize: data.length,
      progressStage: 'uploaded',
      updatedAt: new Date(),
    })
    .where(eq(jobs.id, id));

  return {
    ok: true,
    uploadFilename: originalFilename,
    uploadSize: data.length,
  };
});
