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
