import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { UploadPage } from './Upload';
import { seedDemo } from '../test/demoFixtures';

beforeEach(() => seedDemo());

// prj-0001 (Pune Rooftop Phase 1) is registered, so the gate lets the CSV flow render.
async function uploadCsv(csv: string) {
  render(<MemoryRouter><UploadPage /></MemoryRouter>);
  const select = screen.getByLabelText('Project');
  fireEvent.change(select, { target: { value: 'prj-0001' } });
  const file = new File([csv], 'data.csv', { type: 'text/csv' });
  const input = document.querySelector('input[type="file"]')!;
  fireEvent.change(input, { target: { files: [file] } });
  await waitFor(() => expect(screen.getByText('Validation Report')).toBeInTheDocument());
}

describe('Upload — rejected rows explain themselves', () => {
  it('shows a human-readable reason next to each error code', async () => {
    await uploadCsv('Date,Generation\n2026-01-01,-5\nnot-a-date,10');
    expect(screen.getByText(/ค่าติดลบ|Negative value/i)).toBeInTheDocument();
    expect(screen.getByText(/รูปแบบวันที่ไม่ถูกต้อง|Invalid date/i)).toBeInTheDocument();
  });

  it('states how many rejected rows are hidden when the list is truncated', async () => {
    const bad = Array.from({ length: 60 }, (_, i) => `bad-date-${i},10`).join('\n');
    await uploadCsv(`Date,Generation\n${bad}`);
    expect(screen.getByText(/Showing 50 of 60/i)).toBeInTheDocument();
  });
});
