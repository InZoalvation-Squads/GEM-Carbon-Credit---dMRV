import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ReviewDetail } from './ReviewDetail';
import { seedDemo } from '../test/demoFixtures';
import { api } from '../lib/api';

beforeEach(() => seedDemo());
afterEach(() => { vi.restoreAllMocks(); });

// VR-1001 (under_review) belongs to prj-0001 "Pune Rooftop Phase 1".
function renderDetail(id = 'VR-1001') {
  return render(
    <MemoryRouter initialEntries={[`/verifications/${id}`]}>
      <Routes><Route path="/verifications/:id" element={<ReviewDetail />} /></Routes>
    </MemoryRouter>,
  );
}

describe('ReviewDetail — project name leads, raw id is secondary', () => {
  it('page heading shows the project name, not the raw VR id', () => {
    renderDetail();
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1.textContent).toContain('Pune Rooftop Phase 1');
    expect(h1.textContent).not.toContain('VR-1001');
  });

  it('the approve confirmation modal is titled with the project name', () => {
    renderDetail();
    fireEvent.click(screen.getByRole('button', { name: /Approve & lock/i }));
    expect(screen.getByText(/Approve Pune Rooftop Phase 1/)).toBeInTheDocument();
    expect(screen.queryByText('Approve VR-1001')).toBeNull();
  });
});

describe('ReviewDetail — approve action shows progress and blocks double-submit', () => {
  it('disables the confirm button while the approval request is in flight', async () => {
    vi.spyOn(api, 'approveVerification').mockImplementation(() => new Promise(() => {}));
    renderDetail();
    fireEvent.click(screen.getByRole('button', { name: /Approve & lock/i }));
    fireEvent.click(screen.getByLabelText(/I confirm I have reviewed/i));
    const confirm = screen.getAllByRole('button', { name: /Approve/ }).slice(-1)[0]!;
    fireEvent.click(confirm);
    await waitFor(() => expect(confirm).toBeDisabled());
    expect(api.approveVerification).toHaveBeenCalledTimes(1);
  });
});
