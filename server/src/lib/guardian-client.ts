// Hedera Guardian policy client. The published policy "GEM Carbon Credit
// dMRV" (wizard-generated: PP submits a GEM PDD Registration document, SR
// approves, Guardian mints GEMVCU) runs beside our direct HCS anchoring:
//
//   register  → submitPddToGuardian   (as the Project Proponent user)
//   VC anchor → approvePddInGuardian  (as the Standard Registry user)
//
// Both are best-effort at the call sites — Guardian being down never blocks
// Gate 1. Block tags are stable wizard outputs for this policy version.
import type { PrismaClient } from '@prisma/client';
import { config } from '../config.js';

export const PP_SUBMIT_TAG = 'Project_Proponent_requestVcDocumentBlock_23';
export const SR_GRID_TAG = 'OWNER_interfaceDocumentsSourceBlock_4';
export const SR_APPROVE_TAG = 'OWNER_buttonBlock_11';

export interface GuardianEnv {
  GUARDIAN_API_URL?: string;
  GUARDIAN_POLICY_ID?: string;
  GUARDIAN_PP_USERNAME?: string;
  GUARDIAN_PP_PASSWORD?: string;
  GUARDIAN_SR_USERNAME?: string;
  GUARDIAN_SR_PASSWORD?: string;
}

export function guardianEnabled(env?: GuardianEnv): boolean {
  if (env === undefined) {
    if (process.env.NODE_ENV === 'test') return false; // tests mock this module
    env = config;
  }
  return Boolean(
    env.GUARDIAN_API_URL && env.GUARDIAN_POLICY_ID &&
    env.GUARDIAN_PP_USERNAME && env.GUARDIAN_PP_PASSWORD &&
    env.GUARDIAN_SR_USERNAME && env.GUARDIAN_SR_PASSWORD,
  );
}

function base(): string {
  return `${String(config.GUARDIAN_API_URL).replace(/\/+$/, '')}/api/v1`;
}

async function gFetch<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (init.token) headers.authorization = `Bearer ${init.token}`;
  const res = await fetch(`${base()}${path}`, { ...init, headers });
  if (!res.ok) throw new Error(`guardian ${init.method ?? 'GET'} ${path} → ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/** login → refreshToken → accessToken (Guardian's two-step auth). */
export async function guardianLogin(username: string, password: string): Promise<string> {
  const { refreshToken } = await gFetch<{ refreshToken: string }>('/accounts/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  const { accessToken } = await gFetch<{ accessToken: string }>('/accounts/access-token', {
    method: 'POST',
    body: JSON.stringify({ refreshToken }),
  });
  return accessToken;
}

export interface GuardianPddDocument {
  pdd_id: string;
  project_id: string;
  content_hash: string;
  ipfs_cid: string;
  reduction_tco2e: number;
}

export interface GuardianSubmission {
  policy_id: string;
  tracking_id: string | null;
  submitted_at: string;
}

/**
 * Submit the registered PDD into the Guardian policy as the Project
 * Proponent. Guardian signs a VC with the PP's Hedera DID, writes it to the
 * policy topic + IPFS, and queues it for SR approval.
 */
export async function submitPddToGuardian(doc: GuardianPddDocument): Promise<GuardianSubmission> {
  const token = await guardianLogin(config.GUARDIAN_PP_USERNAME!, config.GUARDIAN_PP_PASSWORD!);
  const res = await gFetch<{ trackingId?: string }>(
    `/policies/${config.GUARDIAN_POLICY_ID}/tag/${PP_SUBMIT_TAG}/blocks`,
    {
      method: 'POST',
      token,
      body: JSON.stringify({
        document: {
          field0: doc.pdd_id,
          field1: doc.project_id,
          field2: doc.content_hash,
          field3: doc.ipfs_cid,
          field4: doc.reduction_tco2e,
        },
        ref: null,
      }),
    },
  );
  return {
    policy_id: config.GUARDIAN_POLICY_ID!,
    tracking_id: res?.trackingId ?? null,
    submitted_at: new Date().toISOString(),
  };
}

/**
 * Approve the PDD's Guardian document as the Standard Registry (fires the
 * policy's mint). Finds the pending document by pdd_id in the SR grid; the
 * document may still be in flight on Hedera, so a not-found is returned as
 * approved:false rather than thrown — the caller may retry later.
 */
export async function approvePddInGuardian(pddId: string): Promise<{ approved: boolean; tracking_id?: string }> {
  const token = await guardianLogin(config.GUARDIAN_SR_USERNAME!, config.GUARDIAN_SR_PASSWORD!);
  const grid = await gFetch<{ data?: Array<Record<string, unknown>> }>(
    `/policies/${config.GUARDIAN_POLICY_ID}/tag/${SR_GRID_TAG}/blocks`,
    { token },
  );
  const rows = grid?.data ?? [];
  const target = rows.find((row) => {
    const subject = (row as { document?: { credentialSubject?: Array<{ field0?: string }> } }).document?.credentialSubject?.[0];
    return subject?.field0 === pddId;
  });
  if (!target) return { approved: false };
  (target as { option?: Record<string, unknown> }).option = {
    ...((target as { option?: Record<string, unknown> }).option ?? {}),
    status: 'Approved',
  };
  const res = await gFetch<{ trackingId?: string }>(
    `/policies/${config.GUARDIAN_POLICY_ID}/tag/${SR_APPROVE_TAG}/blocks`,
    { method: 'POST', token, body: JSON.stringify({ document: target, tag: 'Button_0' }) },
  );
  return { approved: true, tracking_id: res?.trackingId };
}

/**
 * Fire-and-forget approval: the PP document reaches the SR grid only after
 * its Hedera round-trip (~1–2 min), so the credential-anchor route must NOT
 * wait for it. Retries in the background and stamps guardian_ref.approved_at
 * when the approval lands.
 */
export function approvePddInBackground(
  prisma: PrismaClient,
  pddId: string,
  log: { warn: (obj: unknown, msg: string) => void },
  attempts = 20,
  delayMs = 30_000,
): void {
  void (async () => {
    for (let i = 0; i < attempts; i++) {
      await new Promise((r) => setTimeout(r, delayMs));
      try {
        const g = await approvePddInGuardian(pddId);
        if (g.approved) {
          const row = await prisma.pdd.findUnique({ where: { id: pddId }, select: { guardian_ref: true } });
          const prev = (row?.guardian_ref ?? {}) as Record<string, unknown>;
          await prisma.pdd.update({
            where: { id: pddId },
            data: { guardian_ref: { ...prev, approved_at: new Date().toISOString(), approve_tracking_id: g.tracking_id ?? null } as never },
          });
          return;
        }
      } catch (err) {
        log.warn({ err: String(err) }, 'guardian approve retry failed');
      }
    }
    log.warn({ pddId }, 'guardian approval never landed — approve manually in the Guardian UI');
  })();
}
