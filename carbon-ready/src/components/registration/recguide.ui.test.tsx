import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RecGuide, REC_GUIDE_STORAGE_KEY } from './RecGuide';

beforeEach(() => localStorage.clear());

describe('RecGuide — 3-phase checklist', () => {
  it('renders the three phase headers with counters', () => {
    render(<RecGuide />);
    expect(screen.getByText(/เปิดบัญชี Registrant/)).toBeInTheDocument();
    expect(screen.getByText(/ขึ้นทะเบียนโรงไฟฟ้า SF-02/)).toBeInTheDocument();
    expect(screen.getByText(/EGAT ตรวจ \+ ค่าธรรมเนียม/)).toBeInTheDocument();
    // phase 1 has 9 tickable items, none checked yet
    expect(screen.getByText('0/9')).toBeInTheDocument();
  });

  it('phase 1 is expanded by default; phase 2 expands on click', () => {
    render(<RecGuide />);
    // phase-1 item visible immediately
    expect(screen.getByLabelText(/STC Contract/)).toBeInTheDocument();
    // phase-2 item hidden until its header is clicked
    expect(screen.queryByLabelText(/Single Line Diagram/)).toBeNull();
    fireEvent.click(screen.getByText(/ขึ้นทะเบียนโรงไฟฟ้า SF-02/));
    expect(screen.getByLabelText(/Single Line Diagram/)).toBeInTheDocument();
  });

  it('ticking an item updates the counter and persists to localStorage', () => {
    render(<RecGuide />);
    fireEvent.click(screen.getByLabelText(/STC Contract/));
    expect(screen.getByText('1/9')).toBeInTheDocument();
    const stored = JSON.parse(localStorage.getItem(REC_GUIDE_STORAGE_KEY)!);
    expect(stored).toContain('stc-contract');
  });

  it('a fresh mount restores checked state from localStorage', () => {
    localStorage.setItem(REC_GUIDE_STORAGE_KEY, JSON.stringify(['stc-contract', 'sf01']));
    render(<RecGuide />);
    expect(screen.getByText('2/9')).toBeInTheDocument();
    expect(screen.getByLabelText(/STC Contract/)).toBeChecked();
  });

  it('ล้าง checklist clears ticks and storage', () => {
    localStorage.setItem(REC_GUIDE_STORAGE_KEY, JSON.stringify(['stc-contract']));
    render(<RecGuide />);
    fireEvent.click(screen.getByRole('button', { name: /ล้าง checklist/ }));
    expect(screen.getByText('0/9')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(REC_GUIDE_STORAGE_KEY) ?? '[]')).toEqual([]);
  });

  it('malformed stored value falls back to empty without crashing', () => {
    localStorage.setItem(REC_GUIDE_STORAGE_KEY, '{not json');
    render(<RecGuide />);
    expect(screen.getByText('0/9')).toBeInTheDocument();
  });

  it('phase 1 offers official EGAT form downloads in a new tab', () => {
    render(<RecGuide />);
    const stc = screen.getByRole('link', { name: /STC Contract \(PDF\)/ });
    expect(stc).toHaveAttribute('href', expect.stringContaining('Standard_Terms_and_Conditions'));
    expect(stc).toHaveAttribute('target', '_blank');
    expect(screen.getByRole('link', { name: /SF-01 \(PDF\)/ }))
      .toHaveAttribute('href', expect.stringContaining('SF-01'));
    expect(screen.getByRole('link', { name: /EGAT I-REC Issuer/ }))
      .toHaveAttribute('href', 'https://irecissuer.egat.co.th/');
  });
});
