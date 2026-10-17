import { useId, useState, type FormEvent } from 'react';
import { Link, useRouter } from '../../lib/router';
import { useAuth } from '../auth';
import { Button } from '../ui';
import { AuthLayout } from './AuthLayout';

export default function Login() {
  const { login, session, logout } = useAuth();
  const { navigate } = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [touched, setTouched] = useState(false);
  const uid = useId(), pid = useId();
  const missing = { u: !username.trim(), p: !password };

  async function onSubmit(e: FormEvent) {
    e.preventDefault(); setTouched(true); setError('');
    if (missing.u || missing.p) { document.getElementById(missing.u ? uid : pid)?.focus(); return; }
    setBusy(true);
    try { await login(username.trim(), password); navigate('/console'); }
    catch (err) {
      const m = err instanceof Error ? err.message : 'Sign-in failed';
      setError(/Invalid credentials/i.test(m) ? 'That username and password do not match. Check them and try again.'
        : /not configured/i.test(m) ? 'Sign-in is not set up on this server yet. Ask an administrator to run the seed script.'
        : /Failed to fetch|NetworkError/i.test(m) ? 'The API is not reachable. Start the backend, then try again.' : m);
      setPassword('');
    } finally { setBusy(false); }
  }

  return (
    <AuthLayout kicker="Account" title="Sign in to AeroOpt" lede="Use your AeroOpt username and password." alt={<Link to="/signup" className="btn btn-ghost btn-md">Sign up</Link>}>
      {session ? (
        <div className="auth-result auth-ok" role="status">
          <p className="auth-result-title">You're signed in as {session.username} ({session.role}).</p>
          <div className="button-row"><Link to="/console" className="btn btn-primary btn-md">Open console</Link><Button variant="ghost" onClick={logout}>Sign out</Button></div>
        </div>
      ) : (
        <form className="auth-form" onSubmit={onSubmit} noValidate>
          <div className="field">
            <label className="field-label" htmlFor={uid}>Username</label>
            <input id={uid} name="username" autoComplete="username" spellCheck={false} value={username} onChange={e => setUsername(e.target.value)} aria-invalid={touched && missing.u} aria-describedby={`${uid}-m`} />
            <span id={`${uid}-m`} className={touched && missing.u ? 'field-error' : 'sr-only'}>{touched && missing.u ? 'Enter your username.' : ''}</span>
          </div>
          <div className="field">
            <label className="field-label" htmlFor={pid}>Password</label>
            <input id={pid} name="password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} aria-invalid={touched && missing.p} aria-describedby={`${pid}-m`} />
            <span id={`${pid}-m`} className={touched && missing.p ? 'field-error' : 'sr-only'}>{touched && missing.p ? 'Enter your password.' : ''}</span>
          </div>
          {error && <div className="alert alert-error" role="alert">{error}</div>}
          <Button type="submit" variant="primary" className="auth-submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</Button>
          <p className="field-hint">New here? <Link to="/signup">Create an account</Link></p>
        </form>
      )}
    </AuthLayout>
  );
}
