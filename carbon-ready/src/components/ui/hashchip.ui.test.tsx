import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HashChip } from './HashChip';

const LONG = 'sha256-a3f9c15e60913fd038b91a7d44e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3';

afterEach(() => { vi.restoreAllMocks(); });

describe('HashChip', () => {
  it('truncates long values but keeps the full value on hover (title)', () => {
    render(<HashChip value={LONG} />);
    const chip = screen.getByRole('button');
    expect(chip).toHaveAttribute('title', LONG);
    expect(chip.textContent).not.toContain(LONG); // shown truncated
    expect(chip.textContent).toContain('…');
  });

  it('copies the FULL value to the clipboard on click', () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    render(<HashChip value={LONG} />);
    fireEvent.click(screen.getByRole('button'));
    expect(writeText).toHaveBeenCalledWith(LONG);
  });

  it('shows short values in full, no ellipsis', () => {
    render(<HashChip value="urn:vc:vr1000seed" />);
    expect(screen.getByRole('button').textContent).toContain('urn:vc:vr1000seed');
    expect(screen.getByRole('button').textContent).not.toContain('…');
  });
});
