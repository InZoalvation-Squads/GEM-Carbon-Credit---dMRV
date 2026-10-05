import { it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmptyState } from './EmptyState';

it('renders decorative illustration with reserved dimensions and keeps the action accessible', () => {
  const { container } = render(<EmptyState title="No projects yet" illustration="/illustrations/empty-projects.webp"
    icon={<span>Unused icon</span>} action={<button>New Project</button>} />);
  const img = container.querySelector('img')!;
  expect(img).toHaveAttribute('src', '/illustrations/empty-projects.webp');
  expect(img).toHaveAttribute('alt', '');
  expect(img).toHaveAttribute('aria-hidden', 'true');
  expect(img).toHaveAttribute('width', '120');
  expect(img).toHaveAttribute('height', '120');
  expect(img).toHaveAttribute('loading', 'lazy');
  expect(img).toHaveAttribute('decoding', 'async');
  expect(img).toHaveClass('object-contain');
  expect(screen.queryByRole('img')).toBeNull();
  expect(screen.queryByText('Unused icon')).toBeNull();
  expect(screen.getByRole('button', { name: 'New Project' })).toBeInTheDocument();
});

it('retains the existing icon-only empty state when no illustration is supplied', () => {
  const { container } = render(<EmptyState title="No records" icon={<span>Icon</span>} hint="Upload monitoring data" />);
  expect(container.querySelector('img')).toBeNull();
  expect(screen.getByText('Icon').parentElement).toHaveAttribute('aria-hidden');
  expect(screen.getByText('Upload monitoring data')).toBeInTheDocument();
});
