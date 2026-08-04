import { describe, it, expect, vi, afterEach } from 'vitest';
import { ipfsEnabled, ipfsAddBytes } from './ipfs.js';

afterEach(() => vi.unstubAllGlobals());

describe('ipfsEnabled', () => {
  it('is false in tests (NODE_ENV=test) and false without a configured node', () => {
    expect(ipfsEnabled()).toBe(false);
    expect(ipfsEnabled({ IPFS_API_URL: 'http://x:5001' })).toBe(false); // still test env
  });
});

describe('ipfsAddBytes', () => {
  it('POSTs multipart to /api/v0/add and returns the CID', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ Hash: 'bafkreitest' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const cid = await ipfsAddBytes('payload');
    expect(cid).toBe('bafkreitest');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/api/v0/add?pin=true&cid-version=1');
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
  });

  it('throws on HTTP failure and on a missing Hash', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })));
    await expect(ipfsAddBytes('x')).rejects.toThrow('ipfs add failed: 500');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
    await expect(ipfsAddBytes('x')).rejects.toThrow('no Hash');
  });
});
