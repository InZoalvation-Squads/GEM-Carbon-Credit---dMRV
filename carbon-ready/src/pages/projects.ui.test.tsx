import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Projects } from './Projects';
import { seedDemo } from '../test/demoFixtures';
import { useStore } from '../store';
import { PROJECT_STATUS_LABEL } from '../lib/labels';
import { formatNumber } from '../lib/format';
import { fmtDate } from '../lib/date';

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
    // Both layouts exist in jsdom; scope the existing row count to the desktop table.
    const matches = projects.filter((p) => p.name.toLowerCase().includes(project.name.toLowerCase()));
    expect(within(screen.getByRole('table')).getAllByRole('link')).toHaveLength(matches.length);
    expect(within(screen.getByRole('list', { name: 'Projects on mobile' })).getAllByRole('link')).toHaveLength(matches.length);
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

describe('Projects — compact mobile list', () => {
  it('renders complete real project names, status, location, capacity and dates alongside the desktop table', () => {
    renderProjects();
    const list = screen.getByRole('list', { name: 'Projects on mobile' });
    expect(list).toHaveClass('sm:hidden', 'divide-y');
    expect(screen.getByRole('table').parentElement).toHaveClass('hidden', 'sm:block');
    const items = within(list).getAllByRole('listitem');
    const { projects, records } = useStore.getState();
    expect(items).toHaveLength(projects.length);
    projects.forEach((project, index) => {
      const row = within(items[index]);
      const link = row.getByRole('link', { name: `View ${project.name}` });
      expect(link).toHaveTextContent(project.name);
      expect(link).toHaveAttribute('href', `/projects/${project.id}`);
      expect(link).toHaveClass('font-medium', 'whitespace-normal');
      expect(link).not.toHaveClass('truncate', 'break-all');
      expect(link.parentElement).toContainElement(row.getByText(PROJECT_STATUS_LABEL[project.status]));
      expect(items[index]).toHaveTextContent(`${project.location} · ${formatNumber(project.capacity_kwp, 2)} kWp`);
      const uploads = records.filter((record) => record.project_id === project.id).map((record) => record.uploaded_at).sort();
      const latest = uploads[uploads.length - 1];
      expect(items[index]).toHaveTextContent(`Commissioned ${fmtDate(project.commission_date)} · Last upload ${latest ? fmtDate(latest.slice(0, 10)) : '—'}`);
      expect(row.getByRole('button', { name: `Edit ${project.name}` })).toHaveClass('min-h-11', 'min-w-11');
    });
  });

  it('opens the existing edit drawer from the named mobile pencil', () => {
    const project = useStore.getState().projects[0];
    renderProjects();
    fireEvent.click(screen.getByRole('button', { name: `Edit ${project.name}` }));
    expect(screen.getByRole('dialog', { name: `Edit ${project.name}` })).toBeInTheDocument();
    expect(screen.getByLabelText('Project Name')).toHaveValue(project.name);
    expect(screen.getByLabelText('Location')).toHaveValue(project.location);
  });
});
