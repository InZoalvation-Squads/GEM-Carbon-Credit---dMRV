import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EvidenceDetailModal } from './EvidenceDetailModal';
import { useStore } from '../../store';
import { seedDemo } from '../../test/demoFixtures';
import { evidenceApi, ApiError, SessionExpiredError } from '../../lib/server-api';
import { toast } from '../layout/Toast';
import type { EvidenceFile } from '../../types';

// Server mode: replacing and archiving must reach the server — a change made
// only in this tab's store would vanish at the next login hydration.
const active: EvidenceFile = {
  id: 'ev-active', project_id: 'prj-0001', parent_id: null,
  category: 'maintenance_report', file_name: 'log.xlsx', kind: 'xlsx',
  file_size: 20, version_number: 1, status: 'active',
  content_hash: 'sha256-old', uploaded_by: 'usr-1', uploaded_by_name: 'Asha Iyer',
  uploaded_at: '2026-07-01T00:00:00Z',
};

const mode = vi.hoisted(() => ({ server: true }));

vi.mock('../../lib/server-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/server-api')>();
  return {
    ...actual,
    serverMode: () => mode.server,
    evidenceApi: {
      ...actual.evidenceApi,
      file: vi.fn(async (): Promise<Blob> => new Blob(['inverter,2026-02-01,999'])),
      replace: vi.fn(async (id: string, file: File): Promise<EvidenceFile> => ({
        ...active, id: 'ev-server-2', parent_id: id, file_name: file.name,
        file_size: file.size, version_number: 2, content_hash: 'sha256-new',
      })),
      archive: vi.fn(async (id: string): Promise<EvidenceFile> => ({ ...active, id, status: 'archived' })),
    },
  };
});

beforeEach(() => {
  mode.server = true;
  localStorage.clear();
  seedDemo();
  useStore.setState({ evidence: [active] });
  vi.mocked(evidenceApi.replace).mockClear();
  vi.mocked(evidenceApi.archive).mockClear();
  vi.mocked(evidenceApi.file).mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('EvidenceDetailModal in server mode', () => {
  it('Replace version uploads the chosen file and shows the server version', async () => {
    const onClose = vi.fn();
    render(<EvidenceDetailModal evidence={active} onClose={onClose} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['inverter,2026-02-01,999'], 'log-v2.xlsx');
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(evidenceApi.replace).toHaveBeenCalledTimes(1));
    const [id, sent, fields] = vi.mocked(evidenceApi.replace).mock.calls[0];
    expect(id).toBe('ev-active');
    expect((sent as File).name).toBe('log-v2.xlsx');
    expect(fields?.client_hash).toMatch(/^sha256-[0-9a-f]{64}$/);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const evidence = useStore.getState().evidence;
    expect(evidence.find((e) => e.id === 'ev-server-2')?.status).toBe('active');
    expect(evidence.find((e) => e.id === 'ev-active')?.status).toBe('superseded');
  });

  it('Archive archives on the server', async () => {
    const onClose = vi.fn();
    render(<EvidenceDetailModal evidence={active} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /archive/i }));

    await waitFor(() => expect(evidenceApi.archive).toHaveBeenCalledWith('ev-active'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(useStore.getState().evidence[0].status).toBe('archived');
  });

  it('keeps the dialog open when the server refuses to archive', async () => {
    vi.mocked(evidenceApi.archive).mockRejectedValueOnce(new Error('Evidence not found'));
    const onClose = vi.fn();
    render(<EvidenceDetailModal evidence={active} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /archive/i }));

    await waitFor(() => expect(evidenceApi.archive).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 0));
    expect(onClose).not.toHaveBeenCalled();
    expect(useStore.getState().evidence).toEqual([active]);
  });

  it('keeps the dialog open when the server rejects the new version', async () => {
    vi.mocked(evidenceApi.replace).mockRejectedValueOnce(new Error('Only active evidence can be replaced'));
    const onClose = vi.fn();
    render(<EvidenceDetailModal evidence={active} onClose={onClose} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['x'], 'log-v2.xlsx')] } });

    await waitFor(() => expect(evidenceApi.replace).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole('button', { name: /replace version/i })).not.toBeDisabled());
    expect(onClose).not.toHaveBeenCalled();
    expect(useStore.getState().evidence).toEqual([active]);
  });

  it('Download saves the stored bytes under the file name', async () => {
    // jsdom has no object URLs; capture what would be saved instead.
    const createObjectURL = vi.fn(() => 'blob:evidence');
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const saved: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      saved.push(`${this.download}@${this.getAttribute('href')}`);
    });
    render(<EvidenceDetailModal evidence={active} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /download/i }));

    await waitFor(() => expect(saved).toEqual(['log.xlsx@blob:evidence']));
    expect(evidenceApi.file).toHaveBeenCalledWith('ev-active');
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:evidence');
  });

  it('Download says so when the server has no stored file', async () => {
    vi.mocked(evidenceApi.file).mockRejectedValueOnce(new ApiError('NOT_FOUND', 'Stored file not found', 404));
    const error = vi.spyOn(toast, 'error');
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click');
    render(<EvidenceDetailModal evidence={active} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /download/i }));

    await waitFor(() => expect(error).toHaveBeenCalledWith('Download failed', expect.stringMatching(/no stored file/)));
    expect(click).not.toHaveBeenCalled();
  });

  it('Download after the session expired shows no misleading toast — the app is already going to sign-in', async () => {
    // sessionExpired() flips the store to signed-out before the error reaches
    // the dialog; the toast area unmounts with the app shell, so a toast here
    // would only surface after the next sign-in.
    vi.mocked(evidenceApi.file).mockRejectedValueOnce(new SessionExpiredError());
    const error = vi.spyOn(toast, 'error');
    render(<EvidenceDetailModal evidence={active} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /download/i }));

    await waitFor(() => expect(evidenceApi.file).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole('button', { name: /download/i })).not.toBeDisabled());
    expect(error).not.toHaveBeenCalled();
  });

  it('Download names other failures as they are (e.g. the network)', async () => {
    vi.mocked(evidenceApi.file).mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const error = vi.spyOn(toast, 'error');
    render(<EvidenceDetailModal evidence={active} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /download/i }));

    await waitFor(() => expect(error).toHaveBeenCalledWith('Download failed', expect.stringMatching(/Failed to fetch/)));
  });
});

describe('EvidenceDetailModal in demo mode', () => {
  it('disables Download — demo mode keeps file details, not the bytes', () => {
    mode.server = false;
    render(<EvidenceDetailModal evidence={active} onClose={() => {}} />);
    expect(screen.getByRole('button', { name: /download/i })).toBeDisabled();
    expect(evidenceApi.file).not.toHaveBeenCalled();
  });
});
