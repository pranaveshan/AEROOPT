/**
 * Sign-up page: validates inline, calls POST /auth/register, then signs in and opens the console.
 * Server-side checks (duplicates, password rules) are shown against the right field.
 */
import { useId, useMemo, useState, type FormEvent } from 'react';
import { Link, useRouter } from '../../lib/router';
import { useAuth } from '../auth';
import { Button } from '../ui';
import { AuthLayout } from './AuthLayout';

export type Strength = { score: 0 | 1 | 2 | 3 | 4; label: string; missing: string[] };

/** Password strength: length plus character variety. Score 3+ is required. */
export function passwordStrength(pw: string): Strength {
  const missing: string[] = [];
  if (pw.length < 10) missing.push('at least 10 characters');
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw)) missing.push('upper- and lower-case letters');
  if (!/\d/.test(pw)) missing.push('a number');
  if (!/[^A-Za-z0-9]/.test(pw)) missing.push('a symbol');
  const score = (pw ? 4 - missing.length : 0) as Strength['score'];
  const label = !pw ? 'Not set' : ['Very weak', 'Weak', 'Fair', 'Good', 'Strong'][score];
  return { score, label, missing };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const USERNAME = /^[a-zA-Z0-9._-]{3,32}$/;

export function validateSignup(v: { email: string; username: string; password: string; confirm: string }) {
  const e: Partial<Record<keyof typeof v, string>> = {};
  if (!v.email.trim()) e.email = 'Enter your email address.';
  else if (!EMAIL.test(v.email.trim())) e.email = 'Enter a valid email address, like name@example.org.';
  if (!v.username.trim()) e.username = 'Choose a username.';
  else if (!USERNAME.test(v.username.trim())) e.username = 'Use 3–32 letters, numbers, dots, dashes or underscores.';
  const s = passwordStrength(v.password);
  if (!v.password) e.password = 'Choose a password.';
  else if (s.score < 3) e.password = `Add ${s.missing.join(', ')}.`;
  if (!v.confirm) e.confirm = 'Type the password again.';
  else if (v.confirm !== v.password) e.confirm = 'The passwords do not match.';
  return e;
}

type Key = 'email' | 'username' | 'password' | 'confirm';

export default function Signup() {
  const [v, setV] = useState({ email: '', username: '', password: '', confirm: '' });
  const [touched, setTouched] = useState<Record<Key, boolean>>({ email: false, username: false, password: false, confirm: false });
  const [submitted, setSubmitted] = useState(false);
  const [server, setServer] = useState<{ field?: Key; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const { register } = useAuth();
  const { navigate } = useRouter();
  const local = useMemo(() => validateSignup(v), [v]);
  const errors: Partial<Record<Key, string>> = server?.field ? { ...local, [server.field]: local[server.field] ?? server.message } : local;
  const strength = passwordStrength(v.password);
  const ids = { email: useId(), username: useId(), password: useId(), confirm: useId(), meter: useId() };
  const show = (k: Key) => (touched[k] || submitted) && errors[k];

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true); setServer(null);
    setTouched({ email: true, username: true, password: true, confirm: true });
    const first = (Object.keys(local) as Key[])[0];
    if (first) { document.getElementById(ids[first])?.focus(); return; }
    setBusy(true);
    try {
      await register({ username: v.username.trim(), email: v.email.trim(), password: v.password });
      navigate('/console');
    } catch (err) {
      const m = err instanceof Error ? err.message : 'Sign-up failed';
      const field: Key | undefined = /username/i.test(m) ? 'username' : /email/i.test(m) ? 'email' : /password/i.test(m) ? 'password' : undefined;
      const message = /Failed to fetch|NetworkError/i.test(m) ? 'The API is not reachable. Start the backend, then try again.' : m.replace(/^\[.*"msg":"(?:Value error, )?([^"]+)".*\]$/, '$1');
      setServer({ field, message });
      if (field) document.getElementById(ids[field])?.focus();
    } finally { setBusy(false); }
  }

  const field = (k: Key, label: string, type: string, auto: string, extra?: React.ReactNode) => (
    <div className="field">
      <label className="field-label" htmlFor={ids[k]}>{label}</label>
      <input id={ids[k]} name={k} type={type} autoComplete={auto} spellCheck={k === 'email' || k === 'username' ? false : undefined} value={v[k]} aria-invalid={!!show(k)} aria-describedby={`${ids[k]}-msg${k === 'password' ? ` ${ids.meter}` : ''}`}
        onChange={e => { setV({ ...v, [k]: e.target.value }); if (server?.field === k) setServer(null); }} onBlur={() => setTouched({ ...touched, [k]: true })} />
      {extra}
      <span id={`${ids[k]}-msg`} className={show(k) ? 'field-error' : 'sr-only'} role={show(k) ? 'alert' : undefined}>{show(k) || ''}</span>
    </div>
  );

  return (
    <AuthLayout kicker="Account" title="Create an AeroOpt account" lede="New accounts start with the viewer role; an admin can raise it. Your password is checked here before anything is sent."
      alt={<Link to="/login" className="btn btn-ghost btn-md">Sign in</Link>}>
          {server && !server.field && <div className="alert alert-error" role="alert">{server.message}</div>}
          {(
            <form onSubmit={onSubmit} noValidate className="auth-form">
              {field('email', 'Email', 'email', 'email')}
              {field('username', 'Username', 'text', 'username')}
              {field('password', 'Password', 'password', 'new-password', (
                <div className="meter" id={ids.meter} aria-live="polite">
                  <div className="meter-bar" aria-hidden>{[1, 2, 3, 4].map(i => <i key={i} className={strength.score >= i ? `on s${strength.score}` : ''} />)}</div>
                  <span className="meter-label">Strength: {strength.label}{v.password && strength.missing.length ? ` · needs ${strength.missing.join(', ')}` : ''}</span>
                </div>
              ))}
              {field('confirm', 'Confirm password', 'password', 'new-password')}
              <Button type="submit" variant="primary" className="auth-submit" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</Button>
              <p className="field-hint">Already have an account? <Link to="/login">Sign in</Link></p>
            </form>
          )}
    </AuthLayout>
  );
}
