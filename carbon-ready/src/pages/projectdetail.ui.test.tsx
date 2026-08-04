import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ProjectDetail } from './ProjectDetail';
import { seedDemo } from '../test/demoFixtures';

beforeEach(() => {
  localStorage.clear();
  seedDemo();
});

function renderProject(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/projects/${id}`]}>
      <Routes>
        <Route path="/projects/:id" element={<ProjectDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ProjectDetail — PDD Document tab for auditors', () => {
  it('shows a PDD Document tab that renders the registered PDD sections', () => {
    // prj-0006 (Nan Watershed Reforestation) has a registered forestry PDD (PDD-2005).
    renderProject('prj-0006');
    fireEvent.click(screen.getByRole('button', { name: /PDD Document/i }));

    // The document header and its A–E sections are visible for audit review.
    expect(screen.getByText('Project Design Document')).toBeInTheDocument();
    expect(screen.getByText(/A\. Project description/i)).toBeInTheDocument();
    expect(screen.getByText(/E\. Monitoring plan/i)).toBeInTheDocument();
  });

  it('offers a Print / Export action on the PDD Document tab', () => {
    renderProject('prj-0006');
    fireEvent.click(screen.getByRole('button', { name: /PDD Document/i }));
    expect(screen.getByRole('button', { name: /Print|Export/i })).toBeInTheDocument();
  });
});

describe('ProjectDetail — readable labels and record count', () => {
  it('shows the monitoring source as a label, not the raw enum', async () => {
    const { useStore } = await import('../store');
    useStore.setState((s) => ({
      records: [...s.records, {
        id: 'mon-iot-x', project_id: 'prj-0001', record_date: '2026-06-01',
        generation_kwh: 100, source: 'iot_sync', uploaded_at: '2026-06-02T00:00:00Z',
      }],
    }));
    renderProject('prj-0001');
    expect(screen.getAllByText('IoT Sync').length).toBeGreaterThan(0);
    expect(screen.queryByText('iot_sync')).toBeNull();
  });

  it('shows the project status as a label, not the lowercase enum', () => {
    renderProject('prj-0001'); // fixture status "active"
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.queryByText('active')).toBeNull();
  });

  it('tells the user when the table is truncated (showing 50 of N)', async () => {
    const { useStore } = await import('../store');
    const many = Array.from({ length: 60 }, (_, i) => ({
      id: `mon-many-${i}`, project_id: 'prj-0001',
      record_date: `2026-03-${String((i % 28) + 1).padStart(2, '0')}`,
      generation_kwh: 10, source: 'csv_upload', uploaded_at: '2026-06-02T00:00:00Z',
    }));
    useStore.setState((s) => ({ records: [...s.records.filter((r) => r.project_id !== 'prj-0001'), ...many] }));
    renderProject('prj-0001');
    expect(screen.getByText(/Showing 50 of 60/i)).toBeInTheDocument();
  });
});
