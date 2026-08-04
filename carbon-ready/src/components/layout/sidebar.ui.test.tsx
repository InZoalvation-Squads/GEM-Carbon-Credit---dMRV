import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { useStore } from '../../store';
import { seedDemo } from '../../test/demoFixtures';

beforeEach(() => {
  localStorage.clear();
  seedDemo();
});

function renderSidebar() {
  return render(<MemoryRouter><Sidebar open onClose={() => {}} /></MemoryRouter>);
}

describe('Sidebar — role-based menu visibility', () => {
  it('shows the VVB their validation, verification and Guardian menus but not project data entry', () => {
    useStore.getState().setRole('verifier'); // VVB
    renderSidebar();
    expect(screen.getByRole('link', { name: /Validation Queue/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Verifications/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Guardian/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Upload/i })).toBeNull();
    expect(screen.queryByRole('link', { name: /Register Project/i })).toBeNull();
  });

  it('shows the Standard Registry Guardian and Validation but not Register Project', () => {
    useStore.getState().setRole('admin'); // Standard Registry
    renderSidebar();
    expect(screen.getByRole('link', { name: /Guardian/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Validation Queue/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Register Project/i })).toBeNull();
  });

  it('shows the Project Proponent registration and data entry but not the Validation Queue', () => {
    useStore.getState().setRole('project_owner'); // Project Proponent
    renderSidebar();
    expect(screen.getByRole('link', { name: /Register Project/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Upload/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Validation Queue/i })).toBeNull();
  });

  it('always shows Dashboard and Projects to every role', () => {
    useStore.getState().setRole('verifier');
    renderSidebar();
    expect(screen.getByRole('link', { name: /Dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Projects/i })).toBeInTheDocument();
  });
});
