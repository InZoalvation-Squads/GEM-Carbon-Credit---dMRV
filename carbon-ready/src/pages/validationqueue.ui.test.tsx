import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ValidationQueue } from './ValidationQueue';
import { seedDemo } from '../test/demoFixtures';

beforeEach(() => seedDemo());

describe('ValidationQueue — project name is the clickable lead', () => {
  it('the row link names the project, with the PDD id as secondary text', () => {
    render(<MemoryRouter><ValidationQueue /></MemoryRouter>);
    // PDD-2002 (submitted) belongs to prj-0003 "Surin Rice-Husk Power".
    expect(screen.getByRole('button', { name: /Surin Rice-Husk Power/ })).toBeInTheDocument();
  });

  it('methodology column shows the readable code, not a raw snapshot string only', () => {
    render(<MemoryRouter><ValidationQueue /></MemoryRouter>);
    expect(screen.getAllByText(/T-VER|VM\d{4}|AR-ACM/).length).toBeGreaterThan(0);
  });
});
