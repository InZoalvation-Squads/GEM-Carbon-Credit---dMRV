import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { IpfsJsonModal } from './IpfsJsonModal';
import { sha256HexBytes } from '../../lib/hash';

afterEach(() => { vi.unstubAllGlobals(); });

const DOC = '{"b":2,"a":"ข้อมูล"}';
const BYTES = new TextEncoder().encode(DOC);
const HASH = `sha256-${sha256HexBytes(BYTES)}`;

function stubGateway(bytes: Uint8Array) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array(bytes), { status: 200 })));
}

describe('IpfsJsonModal', () => {
  it('fetches, pretty-prints and verifies the hash against the frozen one', async () => {
    stubGateway(BYTES);
    render(<IpfsJsonModal cid="bafkreitest" expectedHash={HASH} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('ipfs-verdict')).toHaveTextContent('ไม่เคยถูกแก้'));
    expect(screen.getByText(/"a": "ข้อมูล"/)).toBeInTheDocument(); // pretty-printed
  });

  it('flags a tampered document', async () => {
    const tampered = new Uint8Array(BYTES); tampered[1] = tampered[1] ^ 1;
    stubGateway(tampered);
    render(<IpfsJsonModal cid="bafkreitest" expectedHash={HASH} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('ipfs-verdict')).toHaveTextContent('อาจถูกแก้ไข'));
  });

  it('shows a helpful error when the gateway is offline', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    render(<IpfsJsonModal cid="bafkreitest" expectedHash={null} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText(/ดึงไฟล์ไม่สำเร็จ/)).toBeInTheDocument());
  });
});
