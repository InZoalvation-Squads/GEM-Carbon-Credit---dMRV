import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppShell } from './AppShell';
import { useStore } from '../store';
import { seedDemo } from '../test/demoFixtures';

vi.mock('../lib/server-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/server-api')>();
  return { ...actual, serverMode: () => true };
});

beforeEach(() => {
  vi.useFakeTimers();
  seedDemo();
  useStore.setState({ isAuthenticated: true, refreshFromServer: vi.fn(async () => {}) });
});
afterEach(() => vi.useRealTimers());

describe('AppShell real-time refresh', () => {
  it('polls refreshFromServer on the interval while authenticated in server mode', async () => {
    const spy = useStore.getState().refreshFromServer;
    render(<MemoryRouter><AppShell /></MemoryRouter>);
    expect(spy).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(15_000); });
    expect(spy).toHaveBeenCalledTimes(1);
    await act(async () => { vi.advanceTimersByTime(15_000); });
    await act(async () => { vi.advanceTimersByTime(15_000); });
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it('refreshes immediately when the window regains focus', async () => {
    const spy = useStore.getState().refreshFromServer;
    render(<MemoryRouter><AppShell /></MemoryRouter>);
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
