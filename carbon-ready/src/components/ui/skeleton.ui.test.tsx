import { lazy, Suspense } from 'react';
import { it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RouteSkeleton } from './RouteSkeleton';
import { ChartSkeleton, SkeletonRows } from './Skeleton';

it('renders a page-shaped Suspense fallback with six responsive project rows', () => {
  const Pending = lazy(() => new Promise<{ default: () => null }>(() => {}));
  const { container } = render(<Suspense fallback={<RouteSkeleton path="/projects" />}><Pending /></Suspense>);
  expect(screen.getByRole('status', { name: 'Loading' })).toHaveAttribute('data-skeleton-shape', 'table');
  expect(container.querySelector('[data-skeleton-rows]')).toHaveAttribute('data-skeleton-rows', '6');
  expect(container.querySelectorAll('tbody tr')).toHaveLength(6);
  expect(container.querySelectorAll('tbody tr:first-child td')).toHaveLength(7);
  expect(container.querySelector('.entity-table')).toBeInTheDocument();
  expect(screen.queryByRole('table')).toBeNull();
  expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(6);
});

it('reserves form field controls instead of displaying a generic ledger row', () => {
  const { container } = render(<RouteSkeleton path="/registration/pdd-1" />);
  expect(screen.getByRole('status', { name: 'Loading' })).toHaveAttribute('data-skeleton-shape', 'form');
  expect(container.querySelector('[data-skeleton-rows]')).toBeNull();
  expect(container.querySelectorAll('.col-span-12.sm\\:col-span-6')).toHaveLength(6);
});

it('only shows figures on routes that have a head block, keeping document and review chrome distinct', () => {
  const { container, rerender } = render(<RouteSkeleton path="/rec-issuance/rec-1/official" />);
  expect(screen.getByRole('status', { name: 'Loading' })).toHaveAttribute('data-skeleton-shape', 'document');
  expect(container.querySelector('[data-skeleton-figures]')).toBeNull();
  rerender(<RouteSkeleton path="/verifications/verification-1" />);
  expect(screen.getByRole('status', { name: 'Loading' })).toHaveAttribute('data-skeleton-shape', 'detail');
  expect(container.querySelector('[data-skeleton-figures]')).toBeNull();
  rerender(<RouteSkeleton path="/verifications" />);
  expect(container.querySelector('[data-skeleton-figures]')).toHaveAttribute('data-skeleton-figures', '2');
});

it('reserves the exact loaded chart height, including an explicit caller height', () => {
  const view = render(<ChartSkeleton />);
  expect(screen.getByRole('status', { name: 'Loading chart' })).toHaveStyle({ height: '280px' });
  view.rerender(<ChartSkeleton height={320} />);
  expect(screen.getByRole('status', { name: 'Loading chart' })).toHaveStyle({ height: '320px' });
});

it('allows a reusable row count without creating placeholder records', () => {
  const { container } = render(<SkeletonRows rows={3} block />);
  expect(container.querySelector('[data-skeleton-rows]')?.children).toHaveLength(3);
  expect(container.textContent).toBe('');
});
