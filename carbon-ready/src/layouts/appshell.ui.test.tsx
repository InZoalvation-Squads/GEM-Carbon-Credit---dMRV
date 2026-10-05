import { useState } from 'react';
import { it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Link } from 'react-router-dom';
import { AppShell } from './AppShell';
import { RouteMetadata } from '../components/layout/RouteMetadata';
import { seedDemo } from '../test/demoFixtures';

beforeEach(() => { seedDemo(); });
afterEach(() => { vi.unstubAllGlobals(); document.getElementById('root')?.remove(); });
function makeRoot() { const root = document.createElement('div'); root.id = 'root'; document.body.append(root); return root; }
function renderShell() {
  return render(<MemoryRouter initialEntries={['/projects']}><RouteMetadata /><Routes>
    <Route element={<AppShell />}><Route path="/projects" element={<><h1>Projects</h1><p>โครงการ</p></>} /></Route>
  </Routes></MemoryRouter>, { container: makeRoot() });
}

it('provides the first focusable skip link and removes all dead top bar controls', () => {
  renderShell();
  const skip = screen.getByRole('link', { name: 'Skip to content' });
  expect(document.querySelector('a,button,input,select,textarea')).toBe(skip);
  fireEvent.click(skip);
  expect(screen.getByRole('main')).toHaveFocus();
  expect(screen.getByRole('main')).toHaveAttribute('id', 'content');
  for (const name of ['Toggle theme', 'Language', 'Notifications']) expect(screen.queryByRole('button', { name })).toBeNull();
  expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
});

it('focuses and traps the mobile drawer, closes on Escape and returns to its trigger', () => {
  vi.stubGlobal('innerWidth', 375);
  renderShell();
  const trigger = screen.getByRole('button', { name: 'Toggle menu' });
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
  const rail = document.getElementById(trigger.getAttribute('aria-controls')!)!;
  expect(rail.inert).toBe(true);
  trigger.focus(); fireEvent.click(trigger);
  const dialog = screen.getByRole('dialog', { name: 'Main' });
  expect(trigger).toHaveAttribute('aria-expanded', 'true');
  const close = within(dialog).getByRole('button', { name: 'Close menu' });
  expect(close).toHaveFocus(); expect(rail.inert).toBe(false);
  const links = within(dialog).getAllByRole('link');
  links[links.length - 1].focus(); fireEvent.keyDown(links[links.length - 1], { key: 'Tab' });
  expect(close).toHaveFocus();
  fireEvent.keyDown(close, { key: 'Escape' });
  expect(trigger).toHaveFocus(); expect(trigger).toHaveAttribute('aria-expanded', 'false');
  expect(rail.inert).toBe(true); expect(rail).toBeInTheDocument();
  expect(document.body.style.overflow).toBe('');
});

it('sets route titles, marks Thai blocks and follows lazy content arrivals', async () => {
  function Page() {
    const [loaded, setLoaded] = useState(false);
    return <><button onClick={() => setLoaded(true)}>Load</button>{loaded && <p>ข้อมูลโครงการและการตรวจสอบ</p>}<Link to="/audit-log">Audit Log</Link></>;
  }
  render(<MemoryRouter initialEntries={['/projects']}><RouteMetadata /><main id="content"><Routes>
    <Route path="/projects" element={<Page />} /><Route path="/audit-log" element={<p>Audit records</p>} />
  </Routes></main></MemoryRouter>, { container: makeRoot() });
  expect(document.title).toBe('Projects · GEM Carbon Credit');
  fireEvent.click(screen.getByRole('button', { name: 'Load' }));
  await waitFor(() => expect(screen.getByText('ข้อมูลโครงการและการตรวจสอบ')).toHaveAttribute('lang', 'th'));
  expect(document.documentElement.lang).toBe('th');
  fireEvent.click(screen.getByRole('link', { name: 'Audit Log' }));
  expect(document.title).toBe('Audit Log · GEM Carbon Credit');
  expect(document.documentElement.lang).toBe('en');
});

it('updates metadata on parameter routes without remounting page state', async () => {
  function Detail() {
    const [count, setCount] = useState(0);
    return <><button onClick={() => setCount(count + 1)}>Count {count}</button><Link to="/projects/second">Next</Link><p>ข้อมูลโครงการ</p></>;
  }
  const root = makeRoot();
  const view = render(<MemoryRouter initialEntries={['/projects/first']}><RouteMetadata /><Routes>
    <Route element={<AppShell />}><Route path="/projects/:id" element={<Detail />} /></Route>
  </Routes></MemoryRouter>, { container: root });
  expect(document.title).toBe('Project Detail · GEM Carbon Credit');
  await waitFor(() => expect(screen.getByText('ข้อมูลโครงการ')).toHaveAttribute('lang', 'th'));
  fireEvent.click(screen.getByRole('button', { name: 'Count 0' }));
  fireEvent.click(screen.getByRole('link', { name: 'Next' }));
  expect(screen.getByRole('button', { name: 'Count 1' })).toBeInTheDocument();
  view.unmount(); root.remove();
});
