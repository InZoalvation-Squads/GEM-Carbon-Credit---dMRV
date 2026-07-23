// Route-level tests for the evidence module: multipart upload with streamed
// server-side SHA-256, content-addressed dedupe, version chains (replace /
// archive) and blob download. STORAGE_DIR is a per-run temp dir (set in
// vitest.config.ts) and removed in afterAll.
import { createHash, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readdir, rm } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { setupTestDatabase, resetDatabase } from '../../test/db.js';
import {
  auth,
  createOrg,
  registerUser,
  expectValidChainTail,
  latestAudit,
} from '../../test/fixtures.js';
import { buildApp } from '../../app.js';
import { config } from '../../config.js';
import { MAX_UPLOAD_BYTES } from './routes.js';

const sha256hex = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

type FilePart = { name: string; filename: string; contentType?: string; data: Buffer };
type FieldPart = { name: string; value: string };

/** Hand-rolled multipart/form-data encoder (keeps the test free of extra deps). */
function multipartBody(parts: Array<FilePart | FieldPart>): {
  payload: Buffer;
  contentType: string;
} {
  const boundary = `----evb${randomBytes(8).toString('hex')}`;
  const chunks: Buffer[] = [];
  for (const p of parts) {
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    if ('filename' in p) {
      chunks.push(
        Buffer.from(
          `Content-Disposition: form-data; name="${p.name}"; filename="${p.filename}"\r\n` +
            `Content-Type: ${p.contentType ?? 'application/octet-stream'}\r\n\r\n`,
        ),
        p.data,
      );
    } else {
      chunks.push(Buffer.from(`Content-Disposition: form-data; name="${p.name}"\r\n\r\n${p.value}`));
    }
    chunks.push(Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { payload: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` };
}

interface UploadOpts {
  data: Buffer;
  filename: string;
  category?: string;
  description?: string;
  client_hash?: string;
}

describe('evidence module', () => {
  let prisma: PrismaClient;
  let app: FastifyInstance;
  let owner: { id: string; token: string };
  let verifier: { id: string; token: string };
  let projectId: string;

  /** Upload with fields BEFORE the file part (the common client ordering). */
  async function upload(token: string, project: string, opts: UploadOpts) {
    const parts: Array<FilePart | FieldPart> = [
      { name: 'category', value: opts.category ?? 'meter_reading' },
    ];
    if (opts.description !== undefined) parts.push({ name: 'description', value: opts.description });
    if (opts.client_hash !== undefined) parts.push({ name: 'client_hash', value: opts.client_hash });
    parts.push({ name: 'file', filename: opts.filename, data: opts.data });
    const { payload, contentType } = multipartBody(parts);
    return app.inject({
      method: 'POST',
      url: `/api/v1/projects/${project}/evidence`,
      headers: { ...auth(token), 'content-type': contentType },
      payload,
    });
  }

  /** Replace with the file part FIRST — proves field ordering doesn't matter. */
  async function replace(token: string, evidenceId: string, opts: UploadOpts) {
    const parts: Array<FilePart | FieldPart> = [
      { name: 'file', filename: opts.filename, data: opts.data },
    ];
    if (opts.category !== undefined) parts.push({ name: 'category', value: opts.category });
    if (opts.description !== undefined) parts.push({ name: 'description', value: opts.description });
    if (opts.client_hash !== undefined) parts.push({ name: 'client_hash', value: opts.client_hash });
    const { payload, contentType } = multipartBody(parts);
    return app.inject({
      method: 'POST',
      url: `/api/v1/evidence/${evidenceId}/replace`,
      headers: { ...auth(token), 'content-type': contentType },
      payload,
    });
  }

  async function storageFiles(): Promise<string[]> {
    return readdir(config.STORAGE_DIR);
  }

  beforeAll(async () => {
    const url = await setupTestDatabase();
    prisma = new PrismaClient({ datasourceUrl: url });
    await resetDatabase(prisma);
    await createOrg(prisma);
    app = await buildApp({ prisma });
    owner = await registerUser(app, 'project_owner');
    verifier = await registerUser(app, 'verifier');

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: auth(owner.token),
      payload: {
        name: 'Evidence fixture',
        location: 'Bangkok, Thailand',
        capacity_kwp: 100,
        commission_date: '2024-01-01',
      },
    });
    expect(res.statusCode).toBe(201);
    projectId = res.json().project.id;
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
    // The per-run temp storage dir (vitest.config.ts) — never a real one.
    if (basename(config.STORAGE_DIR).startsWith('carbon-ready-test-storage-')) {
      await rm(config.STORAGE_DIR, { recursive: true, force: true });
    }
  });

  describe('POST /api/v1/projects/:id/evidence', () => {
    it('requires auth', async () => {
      const { payload, contentType } = multipartBody([
        { name: 'file', filename: 'a.pdf', data: Buffer.from('x') },
      ]);
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/projects/${projectId}/evidence`,
        headers: { 'content-type': contentType },
        payload,
      });
      expect(res.statusCode).toBe(401);
    });

    it('rejects verifiers (403)', async () => {
      const res = await upload(verifier.token, projectId, {
        data: randomBytes(16),
        filename: 'meter.pdf',
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe('FORBIDDEN');
    });

    it('404s on a missing project', async () => {
      const res = await upload(owner.token, 'prj-nope', {
        data: randomBytes(16),
        filename: 'meter.pdf',
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().error).toEqual({ code: 'NOT_FOUND', message: 'Project not found' });
    });

    it('400s on an unsupported file extension without storing bytes', async () => {
      const data = randomBytes(24);
      const res = await upload(owner.token, projectId, { data, filename: 'notes.txt' });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('BAD_REQUEST');
      expect(existsSync(join(config.STORAGE_DIR, sha256hex(data)))).toBe(false);
    });

    it('400s on a malformed client_hash (format is sha256-<64hex>)', async () => {
      const data = randomBytes(24);
      const res = await upload(owner.token, projectId, {
        data,
        filename: 'meter.pdf',
        client_hash: 'sha256-nothex',
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
      // Nothing left behind for a rejected upload of fresh bytes.
      expect(existsSync(join(config.STORAGE_DIR, sha256hex(data)))).toBe(false);
    });

    it('uploads a PDF: server-side hash, v1 active row, blob on disk, audit', async () => {
      const data = Buffer.concat([Buffer.from('%PDF-1.4 evidence '), randomBytes(64)]);
      const hex = sha256hex(data);
      const res = await upload(owner.token, projectId, {
        data,
        filename: 'meter-reading.pdf',
        category: 'meter_reading',
        description: 'June meter photo set',
      });
      expect(res.statusCode).toBe(201);
      const ev = res.json().evidence;
      expect(ev).toMatchObject({
        project_id: projectId,
        parent_id: null,
        category: 'meter_reading',
        file_name: 'meter-reading.pdf',
        kind: 'pdf',
        file_size: data.length,
        version_number: 1,
        status: 'active',
        description: 'June meter photo set',
        content_hash: `sha256-${hex}`,
        uploaded_by: owner.id,
        uploaded_by_name: 'Test project_owner',
      });
      expect(ev.id).toMatch(/^ev-/);
      expect(ev).not.toHaveProperty('storage_path');

      // Blob is stored content-addressed under STORAGE_DIR.
      expect(existsSync(join(config.STORAGE_DIR, hex))).toBe(true);

      const audit = await latestAudit(prisma);
      expect(audit).toMatchObject({
        user_id: owner.id,
        action: 'EVIDENCE_UPLOADED',
        entity_type: 'evidence',
        entity_id: ev.id,
        payload: { file_name: 'meter-reading.pdf', category: 'meter_reading' },
        new_value: { version_number: 1, file_size: data.length },
      });
      await expectValidChainTail(prisma);
    });

    it('accepts a matching client_hash', async () => {
      const data = randomBytes(48);
      const res = await upload(owner.token, projectId, {
        data,
        filename: 'panel.jpg',
        category: 'site_photo',
        client_hash: `sha256-${sha256hex(data)}`,
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().evidence.kind).toBe('image');
    });

    it('422s on a tampered client_hash and leaves no orphan blob for fresh bytes', async () => {
      const data = randomBytes(48);
      const res = await upload(owner.token, projectId, {
        data,
        filename: 'meter.pdf',
        client_hash: `sha256-${'0'.repeat(64)}`,
      });
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('UNPROCESSABLE');
      expect(existsSync(join(config.STORAGE_DIR, sha256hex(data)))).toBe(false);
      expect((await storageFiles()).filter((f) => f.startsWith('tmp-'))).toEqual([]);
    });

    it('does NOT delete a pre-existing deduped blob on client_hash mismatch', async () => {
      const data = randomBytes(48);
      const ok = await upload(owner.token, projectId, { data, filename: 'bill.pdf' });
      expect(ok.statusCode).toBe(201);
      const blobPath = join(config.STORAGE_DIR, sha256hex(data));
      expect(existsSync(blobPath)).toBe(true);

      const tampered = await upload(owner.token, projectId, {
        data,
        filename: 'bill.pdf',
        client_hash: `sha256-${'f'.repeat(64)}`,
      });
      expect(tampered.statusCode).toBe(422);
      // The earlier upload's blob must survive.
      expect(existsSync(blobPath)).toBe(true);
    });

    it('dedupes identical bytes: two uploads → one blob on disk, two rows', async () => {
      const data = randomBytes(80);
      const before = (await storageFiles()).length;
      const first = await upload(owner.token, projectId, { data, filename: 'jan.xlsx' });
      const second = await upload(owner.token, projectId, { data, filename: 'feb.xlsx' });
      expect(first.statusCode).toBe(201);
      expect(second.statusCode).toBe(201);
      const a = first.json().evidence;
      const b = second.json().evidence;
      expect(a.id).not.toBe(b.id);
      expect(a.content_hash).toBe(`sha256-${sha256hex(data)}`);
      expect(b.content_hash).toBe(a.content_hash);

      const files = await storageFiles();
      expect(files.filter((f) => f === sha256hex(data))).toHaveLength(1);
      expect(files.length).toBe(before + 1); // exactly one new blob for two uploads
      expect(files.filter((f) => f.startsWith('tmp-'))).toEqual([]);

      const rows = await prisma.evidenceFile.findMany({
        where: { content_hash: a.content_hash },
      });
      expect(rows).toHaveLength(2);
    });

    it('413s past the 25MB limit and stores nothing', async () => {
      const before = (await storageFiles()).length;
      const res = await upload(owner.token, projectId, {
        data: Buffer.alloc(MAX_UPLOAD_BYTES + 1, 7),
        filename: 'huge.png',
      });
      expect(res.statusCode).toBe(413);
      expect(res.json().error.code).toBe('PAYLOAD_TOO_LARGE');
      const files = await storageFiles();
      expect(files.length).toBe(before);
      expect(files.filter((f) => f.startsWith('tmp-'))).toEqual([]);
    });
  });

  describe('POST /api/v1/evidence/:id/replace', () => {
    it('creates v2, supersedes v1, audits, and 409s on a superseded row', async () => {
      const v1Bytes = randomBytes(40);
      const v1Res = await upload(owner.token, projectId, {
        data: v1Bytes,
        filename: 'commissioning-v1.pdf',
        category: 'commissioning_report',
        description: 'Original commissioning report',
      });
      expect(v1Res.statusCode).toBe(201);
      const v1 = v1Res.json().evidence;

      const v2Bytes = randomBytes(40);
      const v2Res = await replace(owner.token, v1.id, {
        data: v2Bytes,
        filename: 'commissioning-v2.pdf',
      });
      expect(v2Res.statusCode).toBe(201);
      const v2 = v2Res.json().evidence;
      expect(v2).toMatchObject({
        project_id: projectId,
        parent_id: v1.id,
        version_number: 2,
        status: 'active',
        file_name: 'commissioning-v2.pdf',
        // category + description carry over from v1 when not re-sent (SPA spread semantics)
        category: 'commissioning_report',
        description: 'Original commissioning report',
        content_hash: `sha256-${sha256hex(v2Bytes)}`,
      });
      expect(v2).not.toHaveProperty('storage_path');

      const oldRow = await prisma.evidenceFile.findUnique({ where: { id: v1.id } });
      expect(oldRow!.status).toBe('superseded');

      const audit = await latestAudit(prisma);
      expect(audit).toMatchObject({
        user_id: owner.id,
        action: 'EVIDENCE_REPLACED',
        entity_type: 'evidence',
        entity_id: v2.id,
        payload: { file_name: 'commissioning-v2.pdf' },
        previous_value: { version_number: 1, content_hash: `sha256-${sha256hex(v1Bytes)}` },
        new_value: { version_number: 2, content_hash: `sha256-${sha256hex(v2Bytes)}` },
      });
      await expectValidChainTail(prisma);

      // Replacing the superseded v1 again must conflict — and must not leak
      // the freshly uploaded blob.
      const dupBytes = randomBytes(40);
      const conflict = await replace(owner.token, v1.id, { data: dupBytes, filename: 'x.pdf' });
      expect(conflict.statusCode).toBe(409);
      expect(conflict.json().error.code).toBe('CONFLICT');
      expect(existsSync(join(config.STORAGE_DIR, sha256hex(dupBytes)))).toBe(false);
    });

    it('404s on unknown evidence and 403s for verifiers', async () => {
      const missing = await replace(owner.token, 'ev-nope', {
        data: randomBytes(8),
        filename: 'a.pdf',
      });
      expect(missing.statusCode).toBe(404);

      const seeded = await upload(owner.token, projectId, {
        data: randomBytes(8),
        filename: 'b.pdf',
      });
      const forbidden = await replace(verifier.token, seeded.json().evidence.id, {
        data: randomBytes(8),
        filename: 'c.pdf',
      });
      expect(forbidden.statusCode).toBe(403);
    });
  });

  describe('POST /api/v1/evidence/:id/archive', () => {
    it('archives a row and audits EVIDENCE_ARCHIVED', async () => {
      const up = await upload(owner.token, projectId, {
        data: randomBytes(20),
        filename: 'old-bill.pdf',
        category: 'utility_bill',
      });
      const id = up.json().evidence.id;

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/evidence/${id}/archive`,
        headers: auth(owner.token),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().evidence.status).toBe('archived');
      expect(res.json().evidence).not.toHaveProperty('storage_path');

      const audit = await latestAudit(prisma);
      expect(audit).toMatchObject({
        action: 'EVIDENCE_ARCHIVED',
        entity_type: 'evidence',
        entity_id: id,
        payload: {},
        new_value: { status: 'archived' },
      });
      await expectValidChainTail(prisma);
    });

    it('403s for verifiers and 404s on unknown ids', async () => {
      const forbidden = await app.inject({
        method: 'POST',
        url: '/api/v1/evidence/ev-whatever/archive',
        headers: auth(verifier.token),
      });
      expect(forbidden.statusCode).toBe(403);

      const missing = await app.inject({
        method: 'POST',
        url: '/api/v1/evidence/ev-nope/archive',
        headers: auth(owner.token),
      });
      expect(missing.statusCode).toBe(404);
    });
  });

  describe('GET /api/v1/projects/:id/evidence', () => {
    it('requires auth; verifiers may read; storage_path never appears', async () => {
      const noAuth = await app.inject({
        method: 'GET',
        url: `/api/v1/projects/${projectId}/evidence`,
      });
      expect(noAuth.statusCode).toBe(401);

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/projects/${projectId}/evidence`,
        headers: auth(verifier.token),
      });
      expect(res.statusCode).toBe(200);
      const list = res.json().evidence;
      expect(list.length).toBeGreaterThan(0);
      for (const row of list) {
        expect(row).not.toHaveProperty('storage_path');
        expect(row.project_id).toBe(projectId);
      }
    });

    it('404s on a missing project', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/projects/prj-nope/evidence',
        headers: auth(owner.token),
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('GET /api/v1/evidence/:id/file', () => {
    async function roundtrip(filename: string, data: Buffer) {
      const up = await upload(owner.token, projectId, { data, filename });
      expect(up.statusCode).toBe(201);
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/evidence/${up.json().evidence.id}/file`,
        headers: auth(verifier.token), // any authenticated role may download
      });
      expect(res.statusCode).toBe(200);
      expect(Buffer.compare(res.rawPayload, data)).toBe(0);
      return res.headers['content-type'];
    }

    it('streams bytes back byte-identical with the kind-derived content type', async () => {
      expect(await roundtrip('doc.pdf', Buffer.concat([Buffer.from('%PDF'), randomBytes(32)]))).toBe(
        'application/pdf',
      );
      expect(await roundtrip('photo.jpeg', randomBytes(32))).toBe('image/jpeg');
      expect(await roundtrip('site.png', randomBytes(32))).toBe('image/png');
      expect(await roundtrip('log.xlsx', randomBytes(32))).toBe(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
    });

    it('requires auth and 404s on unknown rows', async () => {
      const noAuth = await app.inject({ method: 'GET', url: '/api/v1/evidence/ev-x/file' });
      expect(noAuth.statusCode).toBe(401);

      const missing = await app.inject({
        method: 'GET',
        url: '/api/v1/evidence/ev-nope/file',
        headers: auth(owner.token),
      });
      expect(missing.statusCode).toBe(404);
    });

    it('404s when the row exists but the blob is gone from disk', async () => {
      const data = randomBytes(64);
      const up = await upload(owner.token, projectId, { data, filename: 'ghost.pdf' });
      expect(up.statusCode).toBe(201);
      await rm(join(config.STORAGE_DIR, sha256hex(data)), { force: true });

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/evidence/${up.json().evidence.id}/file`,
        headers: auth(owner.token),
      });
      expect(res.statusCode).toBe(404);
    });
  });
});
