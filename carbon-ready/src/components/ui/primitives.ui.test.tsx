import { useState } from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { Modal } from './Modal';
import { Drawer } from './Drawer';
import { Tabs } from './Tabs';
import { Segmented } from './Segmented';
import { Input } from './Input';
import { FileDrop } from './FileDrop';
import { Toaster, toast } from '../layout/Toast';

afterEach(() => { vi.useRealTimers(); document.body.style.overflow = ''; });

for (const [name, Dialog] of [['Modal', Modal], ['Drawer', Drawer]] as const) {
  describe(`${name} keyboard focus`, () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return <><button onClick={() => setOpen(true)}>Open</button>
        <Dialog open={open} onClose={() => setOpen(false)} title="Evidence"><input aria-label="File name" /><button>Save</button></Dialog>
      </>;
    }
    it('names the dialog, focuses inside, cycles Tab both ways and returns focus on Escape', () => {
      render(<Harness />);
      const trigger = screen.getByRole('button', { name: 'Open' });
      trigger.focus(); fireEvent.click(trigger);
      const dialog = screen.getByRole('dialog', { name: 'Evidence' });
      const close = within(dialog).getByRole('button', { name: 'Close' });
      const last = within(dialog).getByRole('button', { name: 'Save' });
      expect(close).toHaveFocus();
      fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
      expect(last).toHaveFocus();
      fireEvent.keyDown(last, { key: 'Tab' });
      expect(close).toHaveFocus();
      trigger.focus(); expect(close).toHaveFocus();
      fireEvent.keyDown(close, { key: 'Escape' });
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(trigger).toHaveFocus();
    });
    it('locks scrolling, preserves focus across rerenders and restores the previous overflow', () => {
      document.body.style.overflow = 'auto';
      const { rerender } = render(<Dialog open onClose={() => {}} title="Evidence"><input aria-label="File name" /></Dialog>);
      const input = screen.getByRole('textbox'); input.focus();
      expect(document.body.style.overflow).toBe('hidden');
      rerender(<Dialog open onClose={() => {}} title="Evidence"><input aria-label="File name" /></Dialog>);
      expect(input).toHaveFocus();
      rerender(<Dialog open={false} onClose={() => {}} title="Evidence">Closed</Dialog>);
      expect(document.body.style.overflow).toBe('auto');
    });
  });
}

it('keeps the outer dialog locked and restores its focus when a nested dialog closes', () => {
  function Harness() {
    const [inner, setInner] = useState(false);
    return <Modal open onClose={() => {}} title="Outer">
      <button onClick={() => setInner(true)}>Open inner</button>
      <Modal open={inner} onClose={() => setInner(false)} title="Inner">Details</Modal>
    </Modal>;
  }
  const { unmount } = render(<Harness />);
  const trigger = screen.getByRole('button', { name: 'Open inner' });
  trigger.focus(); fireEvent.click(trigger);
  fireEvent.keyDown(within(screen.getByRole('dialog', { name: 'Inner' })).getByRole('button'), { key: 'Escape' });
  expect(trigger).toHaveFocus();
  expect(document.body.style.overflow).toBe('hidden');
  expect(screen.getByRole('dialog', { name: 'Outer' })).toBeInTheDocument();
  unmount(); expect(document.body.style.overflow).toBe('');
});

it('links tabs to panels and wraps keyboard navigation while skipping disabled tabs', () => {
  function Harness() {
    const [value, setValue] = useState('overview');
    return <Tabs label="Project" value={value} onChange={setValue} items={[
      { value: 'overview', label: 'Overview', content: 'Project facts' },
      { value: 'disabled', label: 'Unavailable', content: 'Hidden', disabled: true },
      { value: 'activity', label: 'Activity', content: 'Audit trail' },
    ]} />;
  }
  render(<Harness />);
  const first = screen.getByRole('tab', { name: 'Overview' });
  const last = screen.getByRole('tab', { name: 'Activity' });
  first.focus(); fireEvent.keyDown(first, { key: 'ArrowRight' });
  expect(last).toHaveFocus(); expect(last).toHaveAttribute('aria-selected', 'true');
  const panel = screen.getByRole('tabpanel', { name: 'Activity' });
  expect(panel.id).toBe(last.getAttribute('aria-controls'));
  expect(panel).toHaveTextContent('Audit trail');
  fireEvent.keyDown(last, { key: 'ArrowRight' }); expect(first).toHaveFocus();
  fireEvent.keyDown(first, { key: 'ArrowLeft' }); expect(last).toHaveFocus();
  fireEvent.keyDown(last, { key: 'Home' }); expect(first).toHaveFocus();
  fireEvent.keyDown(first, { key: 'End' }); expect(last).toHaveFocus();
});

it('exposes the selected segmented filter through aria-pressed', () => {
  function Harness() {
    const [value, setValue] = useState('all');
    return <Segmented label="Status" value={value} onChange={setValue} options={[{ value: 'all', label: 'All' }, { value: 'draft', label: 'Draft' }]} />;
  }
  render(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: 'Draft' }));
  expect(screen.getByRole('button', { name: 'Draft' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false');
});

it('associates input errors and existing descriptions with the named control', () => {
  render(<><span id="hint">Use a project ID</span><Input label="Project" error="Required" aria-describedby="hint" /></>);
  const input = screen.getByRole('textbox', { name: 'Project' });
  expect(input).toHaveAttribute('aria-invalid', 'true');
  expect(input).toHaveAccessibleDescription('Use a project ID Required');
});

it('opens the file picker with Space without scrolling the page', () => {
  const { container } = render(<FileDrop onFile={() => {}} />);
  const click = vi.spyOn(container.querySelector('input')!, 'click').mockImplementation(() => {});
  const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
  act(() => screen.getByRole('button').dispatchEvent(event));
  expect(event.defaultPrevented).toBe(true); expect(click).toHaveBeenCalledTimes(1);
});

it('keeps separate live regions mounted and announces errors only in the alert region', () => {
  vi.useFakeTimers();
  const { container } = render(<Toaster />);
  const polite = container.querySelector('[aria-live="polite"]')!;
  const alert = screen.getByRole('alert');
  act(() => { toast.info('Saved'); toast.error('Upload failed'); });
  expect(polite).toHaveTextContent('Saved'); expect(polite).not.toHaveTextContent('Upload failed');
  expect(alert).toHaveTextContent('Upload failed');
  act(() => vi.advanceTimersByTime(4200));
  expect(polite).toBeEmptyDOMElement(); expect(alert).toBeEmptyDOMElement();
  expect(container.querySelector('[aria-live="polite"]')).toBe(polite);
  expect(screen.getByRole('alert')).toBe(alert);
});

it('restores background interaction when nested overlays unmount together', () => {
  const background = document.createElement('button'); background.textContent = 'Background';
  document.body.append(background);
  const { unmount } = render(<Modal open title="Outer" onClose={() => {}}>
    <Modal open title="Inner" onClose={() => {}}>Details</Modal>
  </Modal>);
  expect(background.inert).toBe(true);
  unmount();
  expect(background.inert).toBeFalsy();
  expect(document.body.style.overflow).toBe('');
  background.remove();
});
