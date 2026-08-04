import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HowItWorks } from './HowItWorks';

describe('HowItWorks page', () => {
  it('renders the pipeline, storage layers, timeline and verify chain', () => {
    render(<MemoryRouter><HowItWorks /></MemoryRouter>);
    expect(screen.getByText('ระบบทำงานอย่างไร')).toBeInTheDocument();
    expect(screen.getByText(/7 ชั้น/)).toBeInTheDocument();
    // one card per storage layer
    expect(screen.getAllByText('PostgreSQL').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Hedera HCS').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Guardian').length).toBeGreaterThan(0);
    // lifecycle + verify chain
    expect(screen.getByText('Submit — โครงการขึ้นทะเบียน pipeline')).toBeInTheDocument();
    expect(screen.getByText('คนนอกตรวจสอบเราได้อย่างไร')).toBeInTheDocument();
    // data inventory
    expect(screen.getByText('เจาะลึก: แต่ละชั้นเก็บอะไรบ้าง')).toBeInTheDocument();
    expect(screen.getByText('audit_log (hash-chain)')).toBeInTheDocument();
    expect(screen.getByText(/disclosure_salts/)).toBeInTheDocument();
    expect(screen.getByText(/ชื่อเหรียญ = ชื่อโปรเจกต์ · memo = project id/)).toBeInTheDocument();
    // accounts & roles
    expect(screen.getByText('บัญชีและบทบาท — ใครทำอะไร')).toBeInTheDocument();
    expect(screen.getByText('proponent@gem.demo')).toBeInTheDocument();
    expect(screen.getByText('gemregistry')).toBeInTheDocument();
    expect(screen.getByText('0.0.9651712 (operator)')).toBeInTheDocument();
    // live links
    expect(screen.getByRole('link', { name: /Guardian UI/ })).toHaveAttribute('href', 'http://localhost:3006');
  });
});
