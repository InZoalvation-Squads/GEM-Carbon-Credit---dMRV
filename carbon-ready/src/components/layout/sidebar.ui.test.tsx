import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { useStore } from '../../store';
import { seedDemo } from '../../test/demoFixtures';
import { once, routeLoaders } from '../../routeLoaders';

beforeEach(() => {
  localStorage.clear();
  seedDemo();
});

afterEach(() => { vi.restoreAllMocks(); });

function renderSidebar(path = '/') {
  return render(<MemoryRouter initialEntries={[path]}><Sidebar open onClose={() => {}} /></MemoryRouter>);
}

describe('Sidebar — role-based menu visibility', () => {
  it('marks the active parent link on detail routes and restores the light original anatomy', () => {
    renderSidebar('/projects/prj-0001');
    const active = screen.getByRole('link', { name: 'Projects' });
    expect(active).toHaveAttribute('aria-current', 'page');
    expect(active).toHaveClass('bg-white', 'ring-ink-200/80', 'shadow-xs', 'font-semibold');
    expect(active.querySelector('svg')).toHaveClass('text-brand-600');
    expect(active.querySelector('span[aria-hidden]')).toHaveClass('bg-brand-500', 'w-1', 'h-5');
    const inactive = screen.getByRole('link', { name: 'Dashboard' });
    expect(inactive).not.toHaveAttribute('aria-current');
    expect(inactive).toHaveClass('text-ink-600');
    expect(document.getElementById('main-navigation')).toHaveClass('bg-ink-50', 'border-ink-200');
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
  });

  it('prefetches on hover and focus once, using the same cached loader as the route', async () => {
    const load = vi.fn(async () => ({ default: () => <div /> }));
    const cached = once(load);
    vi.spyOn(routeLoaders, 'Projects').mockImplementation(cached);
    renderSidebar();
    const link = screen.getByRole('link', { name: 'Projects' });
    fireEvent.mouseEnter(link);
    fireEvent.focus(link);
    fireEvent.mouseEnter(link);
    await routeLoaders.Projects();
    expect(load).toHaveBeenCalledTimes(1);
  });

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
