import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import AppV3 from '../v3/AppV3';
import { decodeSession } from '../v3/auth';
import { mockApi, token } from '../test/fixtures';

function at(path: string) { window.history.pushState({}, '', path); return render(<AppV3 />); }

describe('session decoding', () => {
  it('reads username/role and rejects expired or malformed tokens', () => {
    expect(decodeSession(token('admin', 'admin'))).toMatchObject({ username: 'admin', role: 'admin' });
    expect(decodeSession(token('admin', 'admin', -10))).toBeNull();
    expect(decodeSession('static-token')).toBeNull();
    expect(decodeSession(token('x', 'root'))).toBeNull();
  });
});

describe('/login', () => {
  it('shows a clear error for wrong credentials', async () => {
    mockApi([['POST', /\/auth\/login$/, { __status: 401, detail: 'Invalid credentials' }]]);
    at('/login');
    fireEvent.change(await screen.findByLabelText('Username'), { target: { value: 'admin' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'nope' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('do not match');
  });
  it('validates empty fields without a request', async () => {
    const f = mockApi();
    at('/login');
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Enter your username.')).toBeInTheDocument();
    expect(f.mock.calls.some(([u]) => String(u).endsWith('/auth/login'))).toBe(false);
  });
  it('signs in, shows the user name in the header, and signs out from the account menu', async () => {
    mockApi([['POST', /\/auth\/login$/, { access_token: token('admin', 'admin'), role: 'admin', username: 'admin' }]]);
    at('/login');
    fireEvent.change(await screen.findByLabelText('Username'), { target: { value: 'admin' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Secret-pass-1!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    // Route chunks are transformed lazily under load; the default 1 s findBy timeout is too tight to be reliable.
    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' }, { timeout: 8000 })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /admin/ }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Sign out' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in to AeroOpt' }, { timeout: 8000 })).toBeInTheDocument();
    expect(localStorage.getItem('aeroopt_token')).toBeNull();
    expect(screen.getByRole('link', { name: 'Sign up' })).toBeInTheDocument();
  });
  it('blocks write actions for a viewer before any request is sent', async () => {
    localStorage.setItem('aeroopt_token', token('val', 'viewer'));
    const f = mockApi();
    at('/console');
    fireEvent.click(await screen.findByRole('button', { name: 'Run optimizer' }));
    expect(await screen.findByText(/Your role \(viewer\) cannot do this/)).toBeInTheDocument();
    expect(f.mock.calls.some(([u]) => String(u).endsWith('/schedule/solve'))).toBe(false);
  });
});
