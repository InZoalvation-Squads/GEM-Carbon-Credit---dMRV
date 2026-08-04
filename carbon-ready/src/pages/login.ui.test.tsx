import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'ไทย' }));
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
