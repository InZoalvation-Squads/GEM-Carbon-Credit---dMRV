import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RequestVerificationModal } from './RequestVerificationModal';
import { useStore } from '../../store';
import { seedDemo } from '../../test/demoFixtures';

beforeEach(() => seedDemo());

describe('RequestVerificationModal', () => {
  it('computes the claim from raw records × EF (not hand-typed) and submits', async () => {
    // prj-0001 (Pune, registered): packages claimed through 2026-04-30, records
    // run to late May — the default period auto-continues from 2026-05-01.
    render(<MemoryRouter><RequestVerificationModal onClose={() => {}} /></MemoryRouter>);
    expect(screen.getByLabelText('Period start')).toHaveValue('2026-05-01');
    const claim = screen.getByTestId('computed-claim');
    await waitFor(() => expect(claim).toHaveTextContent('tCO₂e'));
    expect(claim).toHaveTextContent('kWh × EF');

    const before = useStore.getState().verifications.length;
    fireEvent.click(screen.getByRole('button', { name: /Submit for verification/ }));
    await waitFor(() => expect(useStore.getState().verifications.length).toBe(before + 1));
    const v = useStore.getState().verifications[0];
    expect(v.state).toBe('submitted');
    expect(v.reduction_kgco2e).toBeGreaterThan(0);
    expect(v.factors_snapshot).toMatch(/grid EF/);
  });

  it('blocks an overlapping period with a Verra double-counting warning', () => {
    render(<MemoryRouter><RequestVerificationModal onClose={() => {}} /></MemoryRouter>);
    // drag the start back INTO the already-claimed Jan–Apr window
    fireEvent.change(screen.getByLabelText('Period start'), { target: { value: '2026-03-15' } });
    expect(screen.getByTestId('overlap-warning')).toHaveTextContent('ทับซ้อน');
    expect(screen.getByRole('button', { name: /Submit for verification/ })).toBeDisabled();
  });

  it('blocks submission when the period has no monitoring data', () => {
    render(<MemoryRouter><RequestVerificationModal onClose={() => {}} /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('Period start'), { target: { value: '1990-01-01' } });
    fireEvent.change(screen.getByLabelText('Period end'), { target: { value: '1990-12-31' } });
    expect(screen.getByText('ไม่มีข้อมูล monitoring ในช่วงที่เลือก')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Submit for verification/ })).toBeDisabled();
  });
});
