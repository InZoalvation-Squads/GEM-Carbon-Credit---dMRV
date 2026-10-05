import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BlockRow, ChainList } from './BlockRow';

describe('BlockRow identifiers and density', () => {
  it('middle-truncates long ids without break-all and exposes the full tooltip/screen-reader value', () => {
    const blockId = 'monitoring-record-000123';
    const { container } = render(<ChainList><BlockRow blockId={blockId} figure="Measured generation" source="CSV upload" state="active" /></ChainList>);
    const id = screen.getByTitle(blockId);
    expect(id).toHaveClass('whitespace-nowrap');
    expect(id.querySelector('[aria-hidden="true"]')).toHaveTextContent('monito…0123');
    expect(id.querySelector('.sr-only')).toHaveTextContent(blockId);
    expect(container.querySelector('[class*="break-all"]')).toBeNull();
    expect(screen.getByRole('listitem')).toHaveClass('grid-cols-[6rem_minmax(0,1fr)]');
    expect(container.querySelector('.ledger-node')).toHaveClass('left-[112px]');
    expect(container.querySelector('.pointer-events-none')).toHaveClass('left-[119px]', 'w-0.5');
  });

  it('keeps eleven-character ids intact and truncates at twelve characters', () => {
    const view = render(<ChainList><BlockRow blockId="12345678901" figure="Record" source="CSV" state="draft" /></ChainList>);
    expect(screen.getByTitle('12345678901').querySelector('[aria-hidden="true"]')).toHaveTextContent('12345678901');
    view.rerender(<ChainList><BlockRow blockId="123456789012" figure="Record" source="CSV" state="draft" /></ChainList>);
    expect(screen.getByTitle('123456789012').querySelector('[aria-hidden="true"]')).toHaveTextContent('123456…9012');
  });

  it('places figure/status on the first compact line and time/id/hash inline on the second', () => {
    const blockId = 'audit-block-000123';
    const hash = 'abcdef0123456789abcdef0123456789abcdef0123';
    const { container } = render(<MemoryRouter><ChainList density="compact"><BlockRow density="compact"
      blockId={blockId} figure="Nong Bua Lamphu Community College" to="/projects/prj-0001"
      source="5 Oct 2026, 10:15" state="anchored" hash={hash} /></ChainList></MemoryRouter>);
    const row = screen.getByRole('listitem');
    expect(row).toHaveClass('grid-cols-[minmax(0,1fr)]', 'pl-8');
    expect(row).not.toHaveClass('grid-cols-[6rem_minmax(0,1fr)]');
    const figure = screen.getByRole('link', { name: 'Nong Bua Lamphu Community College' });
    expect(figure).toHaveAttribute('href', '/projects/prj-0001');
    expect(figure).toHaveClass('whitespace-normal');
    expect(figure.parentElement).toHaveClass('text-sm', 'font-medium');
    expect(figure.parentElement?.parentElement).toHaveClass('justify-between');
    expect(figure.parentElement?.parentElement).toContainElement(screen.getByText('Anchored'));
    expect(screen.getByText('Anchored')).toHaveClass('shrink-0', 'whitespace-nowrap');
    const metadata = screen.getByTitle(blockId).parentElement!;
    expect(metadata).toHaveClass('font-mono', 'text-xs');
    expect(metadata).not.toHaveClass('flex-wrap');
    expect(metadata).toContainElement(screen.getByText('5 Oct 2026, 10:15'));
    expect(metadata).toContainElement(screen.getByRole('button', { name: /abcdef/ }));
    expect(screen.getByTitle(blockId).querySelector('.sr-only')).toHaveTextContent(blockId);
    expect(container.querySelector('.ledger-node')).toHaveClass('left-2');
    expect(container.querySelector('.pointer-events-none')).toHaveClass('left-[15px]', 'w-0.5');
    expect(container.querySelector('[class*="break-all"]')).toBeNull();
  });
});
