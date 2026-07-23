// Evidence spans two URL families (/projects/:id/evidence and /evidence/:id/…),
// so this plugin registers under the bare /api/v1 prefix and declares full
// sub-paths itself. @fastify/multipart is registered HERE (scoped), not in
// app.ts — no other module accepts file uploads.
import multipart from '@fastify/multipart';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { EvidenceCategory, type FileKind } from '@prisma/client';
import { actorFromRequest } from '../../lib/audit.js';
import { appError } from '../../lib/errors.js';
import { openFile, removeBlob, saveStream, type SavedBlob } from '../../lib/storage.js';
import { idParams } from '../../lib/validation.js';
import {
  archiveEvidence,
  createEvidence,
  getEvidence,
  kindFromFileName,
  listEvidence,
  replaceEvidence,
  requireProject,
  serializeEvidence,
  type UploadedBlob,
} from './service.js';

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25MB, same cap as the SPA upload dialog

// Fastify checks content-length against the route bodyLimit BEFORE the
// multipart parser runs — leave headroom over the file cap for the multipart
// framing + text fields, and let busboy's own fileSize limit enforce 25MB.
const MULTIPART_BODY_LIMIT = MAX_UPLOAD_BYTES + 1024 * 1024;

const FILE_TOO_LARGE = `File exceeds the ${MAX_UPLOAD_BYTES} byte limit`;

const clientHash = z
  .string()
  .regex(/^sha256-[0-9a-f]{64}$/, 'client_hash must be "sha256-" + 64 lowercase hex chars');

const UploadFields = z.object({
  category: z.enum(EvidenceCategory),
  description: z.string().optional(),
  client_hash: clientHash.optional(),
});

// Replace: same field names, but everything is optional — omitted category /
// description carry over from the replaced version (SPA spread semantics).
const ReplaceFields = UploadFields.extend({ category: z.enum(EvidenceCategory).optional() });

interface ConsumedUpload {
  blob: SavedBlob;
  file_name: string;
  kind: FileKind;
  fields: Record<string, string>;
  /** Undo a rejected upload — deletes the blob ONLY if this request created it. */
  discard: () => Promise<void>;
}

/**
 * Drain the multipart body: collect text fields (any order relative to the
 * file), stream the `file` part to content-addressed storage. Throws 400 on a
 * missing file / unsupported extension (before any bytes touch disk) and 413
 * past the size limit — cleaning up a freshly written blob on every throw.
 */
async function consumeUpload(req: FastifyRequest): Promise<ConsumedUpload> {
  let blob: SavedBlob | null = null;
  let file_name = '';
  let kind: FileKind | null = null;
  const fields: Record<string, string> = {};
  const discard = async (): Promise<void> => {
    if (blob && !blob.existed) await removeBlob(blob.sha256hex);
  };

  try {
    for await (const part of req.parts()) {
      if (part.type !== 'file') {
        fields[part.fieldname] = part.value as string;
        continue;
      }
      if (part.fieldname !== 'file' || blob) {
        part.file.resume(); // drain unexpected extra file parts
        continue;
      }
      file_name = part.filename ?? '';
      kind = kindFromFileName(file_name); // 400 before writing anything
      blob = await saveStream(part.file);
      if (part.file.truncated) {
        // busboy hit the fileSize limit and cut the stream short.
        throw appError(413, 'PAYLOAD_TOO_LARGE', FILE_TOO_LARGE);
      }
    }
  } catch (err) {
    await discard();
    // Belt and braces: @fastify/multipart's own limit error is also a 413.
    if ((err as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE') {
      throw appError(413, 'PAYLOAD_TOO_LARGE', FILE_TOO_LARGE);
    }
    throw err;
  }

  if (!blob || !kind) {
    throw appError(400, 'BAD_REQUEST', 'multipart file field "file" is required');
  }
  return { blob, file_name, kind, fields, discard };
}

/**
 * Validate the text fields and the optional client-declared hash against the
 * server-computed one; on ANY failure the fresh blob is discarded first.
 * Returns the storage-facing metadata + parsed fields.
 */
async function finishUpload<S extends z.ZodType>(
  upload: ConsumedUpload,
  schema: S,
): Promise<{ meta: UploadedBlob; fields: z.output<S> }> {
  let fields: z.output<S>;
  try {
    fields = schema.parse(upload.fields);
  } catch (err) {
    await upload.discard();
    throw err; // ZodError → 400 envelope via the app error handler
  }
  const content_hash = `sha256-${upload.blob.sha256hex}`;
  const declared = (fields as { client_hash?: string }).client_hash;
  if (declared && declared !== content_hash) {
    // Tampered/corrupted upload. Remove the blob only if WE created it — a
    // deduped pre-existing blob belongs to earlier, valid uploads.
    await upload.discard();
    throw appError(
      422,
      'UNPROCESSABLE',
      'client_hash does not match the server-computed hash of the uploaded bytes',
    );
  }
  return {
    meta: {
      file_name: upload.file_name,
      kind: upload.kind,
      file_size: upload.blob.size,
      content_hash,
      storage_path: upload.blob.sha256hex, // relative to STORAGE_DIR
    },
    fields,
  };
}

/**
 * Run the DB half of an upload; on ANY failure (404 race, 409 non-active
 * replace, …) discard the freshly written blob before rethrowing so a
 * rejected request can never leak bytes into the store.
 */
async function withDiscard<T>(upload: ConsumedUpload, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    await upload.discard();
    throw err;
  }
}

function contentTypeFor(kind: FileKind, fileName: string): string {
  switch (kind) {
    case 'pdf':
      return 'application/pdf';
    case 'xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case 'image':
      return /\.jpe?g$/i.test(fileName) ? 'image/jpeg' : 'image/png';
  }
}

export async function evidenceRoutes(app: FastifyInstance): Promise<void> {
  await app.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES } });

  // Same proponent-side circle as project writes; verifiers only read.
  const writeGuard = [
    app.authenticate,
    app.requireRole('project_owner', 'admin', 'esg_manager'),
  ];

  app.post(
    '/projects/:id/evidence',
    { preHandler: writeGuard, bodyLimit: MULTIPART_BODY_LIMIT },
    async (req, reply) => {
      const { id } = idParams.parse(req.params);
      // Fail fast (and blob-free) on an unknown project before draining the
      // body; createEvidence re-checks inside its transaction.
      await requireProject(app.prisma, req.user.org, id);
      const upload = await consumeUpload(req);
      const { meta, fields } = await finishUpload(upload, UploadFields);
      const row = await withDiscard(upload, () =>
        createEvidence(app.prisma, actorFromRequest(req), id, meta, fields),
      );
      return reply.code(201).send({ evidence: serializeEvidence(row) });
    },
  );

  app.post(
    '/evidence/:id/replace',
    { preHandler: writeGuard, bodyLimit: MULTIPART_BODY_LIMIT },
    async (req, reply) => {
      const { id } = idParams.parse(req.params);
      await getEvidence(app.prisma, req.user.org, id); // 404 before draining the body
      const upload = await consumeUpload(req);
      const { meta, fields } = await finishUpload(upload, ReplaceFields);
      const row = await withDiscard(upload, () =>
        replaceEvidence(app.prisma, actorFromRequest(req), id, meta, fields),
      );
      return reply.code(201).send({ evidence: serializeEvidence(row) });
    },
  );

  app.post('/evidence/:id/archive', { preHandler: writeGuard }, async (req) => {
    const { id } = idParams.parse(req.params);
    const row = await archiveEvidence(app.prisma, actorFromRequest(req), id);
    return { evidence: serializeEvidence(row) };
  });

  app.get('/projects/:id/evidence', { preHandler: [app.authenticate] }, async (req) => {
    const { id } = idParams.parse(req.params);
    const rows = await listEvidence(app.prisma, req.user.org, id);
    return { evidence: rows.map(serializeEvidence) };
  });

  app.get('/evidence/:id/file', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const row = await getEvidence(app.prisma, req.user.org, id);
    const blob = row.storage_path ? await openFile(row.storage_path) : null;
    if (!blob) throw appError(404, 'NOT_FOUND', 'Stored file not found');
    return reply
      .header('content-length', blob.size)
      .type(contentTypeFor(row.kind, row.file_name))
      .send(blob.stream);
  });
}
