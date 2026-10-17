import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import AppV3 from '../v3/AppV3';
import { passwordStrength, validateSignup } from '../v3/pages/Signup';
import { mockApi, token } from '../test/fixtures';

const ok = { email: 'pilot@example.org', username: 'ops.planner', password: 'Runway-27Left!', confirm: 'Runway-27Left!' };

describe('signup validation', () => {
  it('scores password strength', () => {
    expect(passwordStrength('').score).toBe(0);
    expect(passwordStrength('abc').score).toBeLessThan(3);
    expect(passwordStrength('Runway-27Left!').score).toBe(4);
  });
  it('flags each invalid field', () => {
    expect(validateSignup(ok)).toEqual({});
    const e = validateSignup({ email: 'nope', username: 'a', password: 'short', confirm: 'x' });
    expect(Object.keys(e).sort()).toEqual(['confirm', 'email', 'password', 'username']);
  });
});

describe('/signup page', () => {
  function fill(v: typeof ok) {
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: v.email } });
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: v.username } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: v.password } });
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: v.confirm } });
  }
  it('shows inline errors and sends nothing when invalid', async () => {
    const fetchMock = mockApi();
    window.history.pushState({}, '', '/signup');
    render(<AppV3 />);
    await screen.findByRole('heading', { level: 1, name: 'Create an AeroOpt account' });
    fill({ ...ok, email: 'bad', confirm: 'different' });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText(/valid email address/)).toBeInTheDocument();
    expect(screen.getByText('The passwords do not match.')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(fetchMock.mock.calls.some(([u]) => /register|signup|users/.test(String(u)))).toBe(false);
  });
  it('valid details: registers, signs in and opens the console', async () => {
    const fetchMock = mockApi([
      ['POST', /\/auth\/register$/, { id: 'USR-1', username: 'ops.planner', role: 'viewer' }],
      ['POST', /\/auth\/login$/, { access_token: token('ops.planner', 'viewer'), role: 'viewer', username: 'ops.planner' }],
    ]);
    window.history.pushState({}, '', '/signup');
    render(<AppV3 />);
    await screen.findByRole('heading', { level: 1 });
    fill(ok);
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' }, { timeout: 8000 })).toBeInTheDocument();
    const reg = fetchMock.mock.calls.find(([u]) => String(u).endsWith('/auth/register'))!;
    expect(JSON.parse(String((reg[1] as RequestInit).body))).toEqual({ username: 'ops.planner', email: 'pilot@example.org', password: ok.password });
    expect(window.location.pathname).toBe('/console');
    expect(localStorage.getItem('aeroopt_token')).toContain('.');
    expect(screen.getByRole('button', { name: /ops\.planner/ })).toBeInTheDocument();
  });
  it('shows a duplicate-username error from the server on the username field', async () => {
    mockApi([['POST', /\/auth\/register$/, { __status: 409, detail: 'That username is already taken' }]]);
    window.history.pushState({}, '', '/signup');
    render(<AppV3 />);
    await screen.findByRole('heading', { level: 1 });
    fill(ok);
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('That username is already taken')).toBeInTheDocument();
    expect(screen.getByLabelText('Username')).toHaveAttribute('aria-invalid', 'true');
  });
  it('is linked from the showcase and the sign-in panel', async () => {
    mockApi();
    window.history.pushState({}, '', '/');
    const { unmount } = render(<AppV3 />);
    expect(await screen.findByRole('link', { name: 'Sign up' })).toHaveAttribute('href', '/signup');
    unmount();
    window.history.pushState({}, '', '/console/settings');
    render(<AppV3 />);
    expect(await screen.findByRole('link', { name: 'Create one' }, { timeout: 8000 })).toHaveAttribute('href', '/signup');
  });
});
