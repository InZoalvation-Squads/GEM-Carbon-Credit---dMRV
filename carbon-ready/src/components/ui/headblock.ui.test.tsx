import { expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HeadBlock } from './HeadBlock';
import { HeadBlockSkeleton } from './Skeleton';

it('uses two ruled columns on phones and retains the original desktop value size', () => {
  const { container } = render(<HeadBlock figures={[
    { label: 'Generation', value: '12,300', source: 'Monitoring records' },
    { label: 'Reduction', value: '1,200', unit: 'tCO₂e' },
    { label: 'Active projects', value: 12 },
    { label: 'Latest upload', value: '5 Oct 2026, 10:15' },
  ]} />);
  const grid = container.querySelector('dl')!;
  expect(grid).toHaveClass('grid-cols-2', 'sm:grid-flow-col', 'sm:grid-cols-none');
  expect(grid).not.toHaveClass('divide-y');
  const cells = Array.from(grid.children);
  cells.forEach((cell) => expect(cell).toHaveClass('px-4', 'py-3', 'sm:px-5', 'sm:py-4'));
  expect(cells[0]).toHaveClass('border-r', 'border-b');
  expect(cells[1]).not.toHaveClass('border-r');
  expect(cells[1]).toHaveClass('border-b');
  expect(cells[2]).toHaveClass('border-r');
  expect(cells[2]).not.toHaveClass('border-b');
  expect(cells[3]).not.toHaveClass('border-b', 'border-r');
  expect(screen.getByText('12,300')).toHaveClass('text-[20px]', 'sm:text-[26px]');
  expect(screen.getByText('5 Oct 2026,')).toHaveClass('whitespace-nowrap');
  expect(screen.getByText('10:15')).toHaveClass('whitespace-nowrap');
  expect(screen.getByText('5 Oct 2026,').parentElement).toHaveTextContent('5 Oct 2026, 10:15');
});

it('keeps the loading head block on the same compact responsive grid', () => {
  const { container } = render(<HeadBlockSkeleton />);
  const grid = container.querySelector('[data-skeleton-figures]')!;
  expect(grid).toHaveClass('grid-cols-2', 'sm:grid-cols-none', 'sm:grid-flow-col');
  expect(grid.children).toHaveLength(4);
  expect(grid.children[0]).toHaveClass('px-4', 'py-3', 'border-r', 'border-b');
  expect(container.querySelector('.h-5')).toHaveClass('sm:h-[26px]');
});
