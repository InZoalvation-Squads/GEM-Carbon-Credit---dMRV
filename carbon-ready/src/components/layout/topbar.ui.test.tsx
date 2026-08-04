import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TopBar } from './TopBar';
import { seedDemo } from '../../test/demoFixtures';

beforeEach(() => seedDemo());

// The role switcher must show the same Guardian terminology as the rest of the app.
function openRoleMenu() {
  render(<MemoryRouter><TopBar onOpenSidebar={() => {}} /></MemoryRouter>);
  const toggle = screen.getAllByRole('button').find((b) => b.getAttribute('aria-haspopup') === 'menu')!;
  fireEvent.click(toggle);
}

describe('TopBar role switcher — Guardian labels', () => {
  it('lists the Project Proponent role, not "Project Owner"', () => {
    openRoleMenu();
    expect(screen.getByText('Project Proponent')).toBeInTheDocument();
    expect(screen.queryByText('Project Owner')).toBeNull();
  });

  it('lists the VVB and Standard Registry roles', () => {
    openRoleMenu();
    expect(screen.getByText('VVB (Validation & Verification Body)')).toBeInTheDocument();
    expect(screen.getByText('Standard Registry')).toBeInTheDocument();
  });
});
