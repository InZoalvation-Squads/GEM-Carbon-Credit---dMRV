import { expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Illustration } from './Illustration';

it('loads priority art eagerly with high fetch priority and reserved decorative dimensions', () => {
  const { container } = render(<Illustration src="/illustrations/hiw-hero.webp" priority />);
  const image = container.querySelector('img');
  expect(image).toHaveAttribute('loading', 'eager');
  expect(image).toHaveAttribute('fetchpriority', 'high');
  expect(image).toHaveAttribute('width', '1200');
  expect(image).toHaveAttribute('height', '356');
  expect(image).toHaveAttribute('decoding', 'async');
  expect(image).toHaveAttribute('alt', '');
  expect(image).toHaveAttribute('aria-hidden', 'true');
});

it('keeps below-fold art lazy without high fetch priority', () => {
  const { container } = render(<Illustration src="/illustrations/hiw-1.webp" />);
  expect(container.querySelector('img')).toHaveAttribute('loading', 'lazy');
  expect(container.querySelector('img')).not.toHaveAttribute('fetchpriority');
});
