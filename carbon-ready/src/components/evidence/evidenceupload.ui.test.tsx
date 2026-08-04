import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EvidenceUploadModal } from './EvidenceUploadModal';
import { useStore } from '../../store';
import { seedDemo } from '../../test/demoFixtures';
import { evidenceApi } from '../../lib/server-api';
import type { EvidenceFile } from '../../types';

// Server mode: real files must reach the server's multipart endpoint and the
// returned row (with the server id) must land in the store, so the official
// document can fetch its bytes back via /evidence/:id/file.
vi.mock('../../lib/server-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/server-api')>();
  return {
    ...actual,
    serverMode: () => true,
    evidenceApi: {
      ...actual.evidenceApi,
      upload: vi.fn(
        async (_projectId: string, file: File, fields: { category: EvidenceFile['category']; description?: string }): Promise<EvidenceFile> => ({
          id: 'ev-server-1',
          project_id: 'prj-0001',
          parent_id: null,
          category: fields.category,
          file_name: file.name,
          kind: 'image',
          file_size: 5,
          version_number: 1,
          status: 'active',
          description: fields.description,
          content_hash: 'sha256-mock',
          uploaded_by: 'usr-1',
          uploaded_by_name: 'Asha Iyer',
          uploaded_at: '2026-08-03T00:00:00Z',
        }),
      ),
    },
  };
});

beforeEach(() => {
  localStorage.clear();
  seedDemo();
  vi.mocked(evidenceApi.upload).mockClear();
});

describe('EvidenceUploadModal in server mode', () => {
  it('uploads a real file to the server and ingests the returned row', async () => {
    render(<EvidenceUploadModal open onClose={() => {}} projectId="prj-0001" onUploaded={() => {}} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['aerial-bytes'], 'aerial.jpg', { type: 'image/jpeg' });
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: /upload 1 file/i }));

    await waitFor(() => expect(evidenceApi.upload).toHaveBeenCalledTimes(1));
    const [projectId, sent, fields] = vi.mocked(evidenceApi.upload).mock.calls[0];
    expect(projectId).toBe('prj-0001');
    expect((sent as File).name).toBe('aerial.jpg');
    expect(fields.client_hash).toMatch(/^sha256-[0-9a-f]{64}$/);
    await waitFor(() => expect(useStore.getState().evidence.some((e) => e.id === 'ev-server-1')).toBe(true));
  });

  it('demo samples (no real File) still fall back to the local store', async () => {
    render(<EvidenceUploadModal open onClose={() => {}} projectId="prj-0001" onUploaded={() => {}} />);
    fireEvent.click(screen.getByText(/add sample files \(demo\)/i));
    fireEvent.click(screen.getByRole('button', { name: /upload \d+ files?/i }));
    await waitFor(() => expect(screen.queryByRole('button', { name: /upload \d+ files?/i })).toBeNull());
    expect(evidenceApi.upload).not.toHaveBeenCalled();
  });
});
