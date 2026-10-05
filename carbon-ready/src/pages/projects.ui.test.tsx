import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Projects } from './Projects';
import { seedDemo } from '../test/demoFixtures';
import { useStore } from '../store';

beforeEach(() => seedDemo());

function renderProjects() {
  return render(
    <MemoryRouter>
      <Projects />
    </MemoryRouter>,
  );
}

function openCreateModal() {
  // Header button; the empty-state also has one, so take the first match.
  fireEvent.click(screen.getAllByRole('button', { name: /New Project/i })[0]);
}

describe('Projects — create an ARR / land-based project', () => {
  it('creates a project with zero capacity (forestry / ARR has no kWp)', () => {
    const before = useStore.getState().projects.length;
    renderProjects();
    openCreateModal();

    fireEvent.change(screen.getByLabelText('Project Name'), { target: { value: 'Doi Inthanon ARR' } });
    fireEvent.change(screen.getByLabelText('Location'), { target: { value: 'Chiang Mai, Thailand' } });
    fireEvent.change(screen.getByLabelText(/Capacity/i), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Project' }));

    const projects = useStore.getState().projects;
    expect(projects.length).toBe(before + 1);
    const created = projects.find((p) => p.name === 'Doi Inthanon ARR');
    expect(created).toBeDefined();
    expect(created!.capacity_kwp).toBe(0);
  });

  it('still rejects a negative capacity', () => {
    const before = useStore.getState().projects.length;
    renderProjects();
    openCreateModal();

    fireEvent.change(screen.getByLabelText('Project Name'), { target: { value: 'Bad Project' } });
    fireEvent.change(screen.getByLabelText('Location'), { target: { value: 'Nowhere' } });
    fireEvent.change(screen.getByLabelText(/Capacity/i), { target: { value: '-5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Project' }));

    expect(useStore.getState().projects.length).toBe(before); // not created
    expect(screen.getByText('Must be ≥ 0')).toBeInTheDocument();
  });
});

describe('Projects — readable status labels and safe create', () => {
  it('keeps search responsive and preserves matching real project rows with deferred search/status filters', () => {
    const projects = useStore.getState().projects;
    const records = useStore.getState().records;
    const project = projects[0];
    renderProjects();
    const start = performance.now();
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: project.name } });
    const elapsed = performance.now() - start;
    expect(screen.getByLabelText('Search')).toHaveValue(project.name);
    expect(screen.getByRole('link', { name: project.name })).toHaveAttribute('href', `/projects/${project.id}`);
    expect(screen.getAllByRole('link')).toHaveLength(projects.filter((p) => p.name.toLowerCase().includes(project.name.toLowerCase())).length);
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: project.status } });
    expect(screen.getByRole('link', { name: project.name })).toBeInTheDocument();
    console.info(`Projects seed search: ${projects.length} projects / ${records.length} records; update ${elapsed.toFixed(2)}ms (jsdom, including deferred commit).`);
  });

  it('status badges and the filter dropdown use labels, not raw enums', () => {
    renderProjects();
    // Fixture prj-0003 is status "draft" → badge must read "Draft".
    expect(screen.getAllByText('Draft').length).toBeGreaterThan(0);
    expect(screen.queryByText('draft')).toBeNull();
    expect(screen.getAllByRole('option', { name: 'Active' }).length).toBeGreaterThan(0);
  });

  it('locks the Create Project button while the request is in flight', async () => {
    const { api } = await import('../lib/api');
    const { vi } = await import('vitest');
    const { waitFor } = await import('@testing-library/react');
    vi.spyOn(api, 'createProject').mockImplementation(() => new Promise(() => {}));
    renderProjects();
    openCreateModal();
    fireEvent.change(screen.getByLabelText('Project Name'), { target: { value: 'X Solar' } });
    fireEvent.change(screen.getByLabelText('Location'), { target: { value: 'Trat, Thailand' } });
    fireEvent.change(screen.getByLabelText('Capacity (kWp)'), { target: { value: '10' } });
    const create = screen.getByRole('button', { name: /Create Project/i });
    fireEvent.click(create);
    await waitFor(() => expect(create).toBeDisabled());
    expect(api.createProject).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });
});
