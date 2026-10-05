import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Login } from './Login';
import { useStore } from '../store';

beforeEach(() => {
  localStorage.clear();
  useStore.setState({ isAuthenticated: false });
});

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={<div>DASHBOARD</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('Login page — GEM Carbon Credit layout', () => {
  it('renders the Thai sign-in layout by default', () => {
    renderLogin();
    expect(document.documentElement.lang).toBe('th');
    expect(screen.getByRole('heading', { name: 'เข้าสู่ระบบ' })).toBeInTheDocument();
    expect(screen.getByText('The Chain of Trust for Digital Carbon')).toBeInTheDocument();
    expect(screen.getByLabelText('รหัสผ่าน')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'เข้าสู่ระบบ' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'สมัครบัญชี' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'ติดต่อทีมสนับสนุน' })).toBeInTheDocument();
  });

  it('switches to English and back via the language pill', () => {
    renderLogin();
    fireEvent.click(screen.getByRole('button', { name: 'EN' }));
    expect(document.documentElement.lang).toBe('en');
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'ไทย' }));
    expect(document.documentElement.lang).toBe('th');
    expect(screen.getByRole('heading', { name: 'เข้าสู่ระบบ' })).toBeInTheDocument();
  });

  it('locks the account chip after a demo quick-fill and unlocks via เปลี่ยน', () => {
    renderLogin();
    expect(screen.getByLabelText('อีเมล')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /proponent@gem\.demo/i }));
    expect(screen.getByText(/กำลังลงชื่อเข้าใช้เป็น:/)).toBeInTheDocument();
    expect(screen.queryByLabelText('อีเมล')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'เปลี่ยน' }));
    expect(screen.getByLabelText('อีเมล')).toBeInTheDocument();
  });

  it('logs in with a demo account and navigates to the dashboard', async () => {
    renderLogin();
    fireEvent.click(screen.getByRole('button', { name: /proponent@gem\.demo/i }));
    fireEvent.click(screen.getByRole('button', { name: 'เข้าสู่ระบบ' }));
    expect(await screen.findByText('DASHBOARD')).toBeInTheDocument();
    expect(useStore.getState().isAuthenticated).toBe(true);
  });

  it('remembers the account only when จดจำฉัน is checked', async () => {
    renderLogin();
    fireEvent.click(screen.getByRole('button', { name: /vvb@gem\.demo/i }));
    fireEvent.click(screen.getByLabelText('จดจำฉัน'));
    fireEvent.click(screen.getByRole('button', { name: 'เข้าสู่ระบบ' }));
    expect(await screen.findByText('DASHBOARD')).toBeInTheDocument();
    expect(localStorage.getItem('gem.login.email')).toBe('vvb@gem.demo');
  });

  it('shows a Thai error for a wrong password', async () => {
    renderLogin();
    fireEvent.change(screen.getByLabelText('อีเมล'), { target: { value: 'proponent@gem.demo' } });
    fireEvent.change(screen.getByLabelText('รหัสผ่าน'), { target: { value: 'wrong-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'เข้าสู่ระบบ' }));
    expect(await screen.findByText('รหัสผ่านไม่ถูกต้อง')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('รหัสผ่านไม่ถูกต้อง');
    expect(screen.getByLabelText('รหัสผ่าน')).toHaveAttribute('aria-describedby', 'login-error');
    expect(screen.getByLabelText('อีเมล')).toHaveAttribute('aria-invalid', 'true');
    expect(useStore.getState().isAuthenticated).toBe(false);
  });

  it('toggles password visibility', () => {
    renderLogin();
    const input = screen.getByLabelText('รหัสผ่าน');
    expect(input).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByRole('button', { name: 'แสดงรหัสผ่าน' }));
    expect(input).toHaveAttribute('type', 'text');
  });

  it('advances the showcase carousel with the next arrow', () => {
    renderLogin();
    expect(screen.getByText('โทเคไนซ์เครดิตคาร์บอน T-VER อย่างมั่นใจ')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'สไลด์ถัดไป' }));
    expect(screen.queryByText('โทเคไนซ์เครดิตคาร์บอน T-VER อย่างมั่นใจ')).not.toBeInTheDocument();
  });
});

describe('Login carousel accessibility', () => {
  it('reserves the WebP slide dimensions, prioritises the first image and preloads only the next slide', () => {
    const view = renderLogin();
    const first = document.querySelector<HTMLImageElement>('img[src="/illustrations/login-1.webp"]')!;
    expect(first).toHaveAttribute('alt', '');
    expect(first).toHaveAttribute('aria-hidden', 'true');
    expect(first).toHaveAttribute('width', '1200');
    expect(first).toHaveAttribute('height', '800');
    expect(first).toHaveAttribute('fetchpriority', 'high');
    expect(first).toHaveAttribute('loading', 'eager');
    expect(first).toHaveAttribute('decoding', 'async');
    expect(document.head.querySelector('link[rel="preload"][as="image"]')).toHaveAttribute('href', '/illustrations/login-2.webp');
    fireEvent.click(screen.getByRole('button', { name: 'สไลด์ถัดไป' }));
    const next = document.querySelector('img[src="/illustrations/login-2.webp"]')!;
    expect(next).toHaveAttribute('loading', 'lazy');
    expect(next).not.toHaveAttribute('fetchpriority');
    expect(document.head.querySelectorAll('link[rel="preload"][as="image"]')).toHaveLength(1);
    expect(document.head.querySelector('link[rel="preload"][as="image"]')).toHaveAttribute('href', '/illustrations/login-3.webp');
    view.unmount();
    expect(document.head.querySelector('link[rel="preload"][as="image"]')).toBeNull();
  });

  it('pauses automatic advance and resumes only when Play is pressed', () => {
    vi.useFakeTimers();
    const view = renderLogin();
    try {
      const first = 'โทเคไนซ์เครดิตคาร์บอน T-VER อย่างมั่นใจ';
      fireEvent.click(screen.getByRole('button', { name: 'Pause carousel' }));
      expect(screen.getByRole('button', { name: 'Play carousel' })).toHaveAttribute('aria-pressed', 'true');
      act(() => vi.advanceTimersByTime(12000));
      expect(screen.getByText(first)).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Play carousel' }));
      act(() => vi.advanceTimersByTime(6000));
      expect(screen.queryByText(first)).not.toBeInTheDocument();
    } finally { view.unmount(); vi.useRealTimers(); }
  });

  it('stops automatic advance immediately when reduced motion becomes active, retaining manual navigation', () => {
    vi.useFakeTimers();
    let listener: (() => void) | undefined;
    const media = {
      matches: false,
      addEventListener: vi.fn((_type: string, callback: () => void) => { listener = callback; }),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal('matchMedia', vi.fn(() => media));
    const view = renderLogin();
    try {
      act(() => { media.matches = true; listener?.(); });
      expect(screen.getByRole('button', { name: 'Carousel paused for reduced motion' })).toBeDisabled();
      act(() => vi.advanceTimersByTime(12000));
      expect(screen.getByText('โทเคไนซ์เครดิตคาร์บอน T-VER อย่างมั่นใจ')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'สไลด์ถัดไป' }));
      expect(screen.getByText('dMRV โปร่งใส ตรวจสอบได้ทุกขั้นตอน')).toBeInTheDocument();
    } finally { view.unmount(); vi.unstubAllGlobals(); vi.useRealTimers(); }
  });

  it('does not schedule automatic advance when reduced motion is active on entry', () => {
    vi.useFakeTimers();
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    const view = renderLogin();
    try {
      act(() => vi.advanceTimersByTime(12000));
      expect(screen.getByText('โทเคไนซ์เครดิตคาร์บอน T-VER อย่างมั่นใจ')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Carousel paused for reduced motion' })).toBeDisabled();
    } finally { view.unmount(); vi.unstubAllGlobals(); vi.useRealTimers(); }
  });
});
