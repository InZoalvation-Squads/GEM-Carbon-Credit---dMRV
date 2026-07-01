import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RegistrationGate } from '../components/RegistrationGate';
import { useStore } from '../store';

beforeEach(() => useStore.getState().resetToSeed());

describe('RegistrationGate', () => {
  it('blocks dMRV content for an unregistered project', () => {
    render(
      <MemoryRouter>
        <RegistrationGate projectId="prj-0003">
          <div>SECRET DMRV</div>
        </RegistrationGate>
      </MemoryRouter>,
    );
    expect(screen.queryByText('SECRET DMRV')).toBeNull();
    expect(screen.getByText(/not registered/i)).toBeInTheDocument();
  });

  it('renders dMRV content for a registered project', () => {
    render(
      <MemoryRouter>
        <RegistrationGate projectId="prj-0001">
          <div>SECRET DMRV</div>
        </RegistrationGate>
      </MemoryRouter>,
    );
    expect(screen.getByText('SECRET DMRV')).toBeInTheDocument();
  });
});
