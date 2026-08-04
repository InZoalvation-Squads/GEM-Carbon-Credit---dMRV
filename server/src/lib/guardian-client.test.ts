import { describe, it, expect, vi, afterEach } from 'vitest';
import { guardianEnabled, guardianLogin, submitPddToGuardian, approvePddInGuardian, PP_SUBMIT_TAG, SR_APPROVE_TAG } from './guardian-client.js';
import { config } from '../config.js';

const FULL = {
  GUARDIAN_API_URL: 'http://g', GUARDIAN_POLICY_ID: 'pid',
  GUARDIAN_PP_USERNAME: 'pp', GUARDIAN_PP_PASSWORD: 'x',
  GUARDIAN_SR_USERNAME: 'sr', GUARDIAN_SR_PASSWORD: 'y',
};

afterEach(() => vi.unstubAllGlobals());

describe('guardianEnabled', () => {
  it('requires the full credential set and is off under NODE_ENV=test by default', () => {
    expect(guardianEnabled()).toBe(false); // test env guard
    expect(guardianEnabled(FULL)).toBe(true);
    expect(guardianEnabled({ ...FULL, GUARDIAN_POLICY_ID: undefined })).toBe(false);
    expect(guardianEnabled({})).toBe(false);
  });
});

function stubFetch(routes: Record<string, unknown>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const key = Object.keys(routes).find((k) => url.includes(k));
    if (!key) return new Response('not found', { status: 404 });
    return new Response(JSON.stringify(routes[key]), { status: 200 });
  }));
  return calls;
}

describe('guardianLogin', () => {
  it('runs the two-step login and returns the access token', async () => {
    stubFetch({ '/accounts/login': { refreshToken: 'rt' }, '/accounts/access-token': { accessToken: 'at' } });
    expect(await guardianLogin('u', 'p')).toBe('at');
  });
});

describe('submitPddToGuardian', () => {
  it('posts the field-mapped document to the PP request block', async () => {
    Object.assign(config, FULL);
    const calls = stubFetch({
      '/accounts/login': { refreshToken: 'rt' },
      '/accounts/access-token': { accessToken: 'at' },
      [`/policies/pid/tag/${PP_SUBMIT_TAG}/blocks`]: { trackingId: 'trk-1' },
    });
    const res = await submitPddToGuardian({
      pdd_id: 'PDD-1', project_id: 'prj-1', content_hash: 'sha256-a', ipfs_cid: 'bafk', reduction_tco2e: 443,
    });
    expect(res.policy_id).toBe('pid');
    expect(res.tracking_id).toBe('trk-1');
    const submit = calls.find((c) => c.url.includes(PP_SUBMIT_TAG))!;
    const body = JSON.parse(String(submit.init?.body));
    expect(body.document).toEqual({ field0: 'PDD-1', field1: 'prj-1', field2: 'sha256-a', field3: 'bafk', field4: 443 });
  });
});

describe('approvePddInGuardian', () => {
  it('approves the grid row matching the pdd id via Button_0', async () => {
    Object.assign(config, FULL);
    const calls = stubFetch({
      '/accounts/login': { refreshToken: 'rt' },
      '/accounts/access-token': { accessToken: 'at' },
      [`/policies/pid/tag/${SR_APPROVE_TAG}/blocks`]: { trackingId: 'trk-2' },
      '/tag/OWNER_interfaceDocumentsSourceBlock_4/blocks': {
        data: [
          { id: 'd1', option: { status: 'Waiting for approval' }, document: { credentialSubject: [{ field0: 'PDD-other' }] } },
          { id: 'd2', option: { status: 'Waiting for approval' }, document: { credentialSubject: [{ field0: 'PDD-1' }] } },
        ],
      },
    });
    const res = await approvePddInGuardian('PDD-1');
    expect(res).toEqual({ approved: true, tracking_id: 'trk-2' });
    const approve = calls.find((c) => c.url.includes(SR_APPROVE_TAG))!;
    const body = JSON.parse(String(approve.init?.body));
    expect(body.tag).toBe('Button_0');
    expect(body.document.id).toBe('d2');
    expect(body.document.option.status).toBe('Approved');
  });

  it('returns approved:false when the document has not landed yet', async () => {
    Object.assign(config, FULL);
    stubFetch({
      '/accounts/login': { refreshToken: 'rt' },
      '/accounts/access-token': { accessToken: 'at' },
      '/tag/OWNER_interfaceDocumentsSourceBlock_4/blocks': { data: [] },
    });
    expect(await approvePddInGuardian('PDD-1')).toEqual({ approved: false });
  });
});
