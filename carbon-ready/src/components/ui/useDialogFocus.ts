import { RefObject, useEffect, useRef } from 'react';

const dialogs: HTMLElement[] = [];
let scrollLocks = 0;
let originalOverflow = '';
const background = new Map<HTMLElement, boolean>();
function syncBackground() {
  background.forEach((inert, element) => { element.inert = inert; });
  background.clear();
  const panel = dialogs[dialogs.length - 1];
  if (!panel) return;
  let branch: HTMLElement = panel;
  while (branch.parentElement) {
    for (const sibling of Array.from(branch.parentElement.children)) {
      if (sibling === branch || !(sibling instanceof HTMLElement) || sibling.matches('[aria-hidden="true"], script, style')) continue;
      background.set(sibling, sibling.inert);
      sibling.inert = true;
    }
    if (branch.parentElement === document.body) break;
    branch = branch.parentElement;
  }
}
const focusableSelector = 'a[href], button, input, select, textarea, [tabindex]';
function focusable(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(focusableSelector)).filter((el) =>
    !el.matches(':disabled, [hidden], [tabindex="-1"]') &&
    !el.closest('[hidden], [inert], [aria-hidden="true"]') &&
    getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden',
  );
}

/** Shared by portalled dialogs and the mobile rail; only the top overlay traps focus. */
export function useDialogFocus(ref: RefObject<HTMLElement>, open: boolean, onClose: () => void) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const panel = ref.current;
    if (!open || !panel) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogs.push(panel);
    if (scrollLocks++ === 0) {
      originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    // Recompute from the top overlay to support nested and simultaneous closes.
    syncBackground();
    const first = () => focusable(panel)[0] ?? panel;
    first().focus();
    const onKey = (event: KeyboardEvent) => {
      if (dialogs[dialogs.length - 1] !== panel) return;
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation(); close.current();
      }
      if (event.key !== 'Tab') return;
      const items = focusable(panel);
      const index = items.indexOf(document.activeElement as HTMLElement);
      if (!items.length) { event.preventDefault(); panel.focus(); }
      else if (event.shiftKey && index <= 0) { event.preventDefault(); items[items.length - 1].focus(); }
      else if (!event.shiftKey && (index === items.length - 1 || index === -1)) { event.preventDefault(); items[0].focus(); }
    };
    const onFocus = (event: FocusEvent) => {
      if (dialogs[dialogs.length - 1] === panel && !panel.contains(event.target as Node)) first().focus();
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('focusin', onFocus);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('focusin', onFocus);
      dialogs.splice(dialogs.indexOf(panel), 1);
      if (--scrollLocks === 0) document.body.style.overflow = originalOverflow;
      syncBackground();
      if (trigger?.isConnected) trigger.focus();
    };
  }, [open, ref]);
}
