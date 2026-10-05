import { it, expect, vi } from 'vitest';
import { once, prefetchRoute, routeLoaders } from './routeLoaders';

it('returns a shared promise for intent and lazy route consumers', async () => {
  const loader = vi.fn(async () => ({ default: () => null }));
  const cached = once(loader);
  const intent = cached();
  expect(cached()).toBe(intent);
  await intent;
  expect(cached()).toBe(intent);
  expect(loader).toHaveBeenCalledTimes(1);
});

it('does not import eager or unknown routes and contains failed intent prefetch', async () => {
  const cached = once(vi.fn(async () => { throw new Error('Offline'); }));
  const spy = vi.spyOn(routeLoaders, 'Projects').mockImplementation(cached);
  try {
    prefetchRoute('/dashboard');
    prefetchRoute('/unknown');
    expect(spy).not.toHaveBeenCalled();
    prefetchRoute('/projects');
    await expect(cached()).rejects.toThrow('Offline');
  } finally { spy.mockRestore(); }
});
