import { useState } from 'react';
import { ThemeSwitch } from '../../theme';
import { useData } from '../data';
import { useAuth } from '../auth';
import { Link } from '../../lib/router';
import { Button, Field, PageHeader, Panel } from '../ui';

function AuthPanel() {
  const { session, login, logout } = useAuth();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  async function submit() {
    setBusy(true); setMsg('');
    try { const s = await login(username, password); setMsg(`Signed in as ${s.username} (${s.role}).`); setPassword(''); }
    catch (e) { setMsg(e instanceof Error ? `Sign-in failed: ${e.message}` : 'Sign-in failed'); } finally { setBusy(false); }
  }
  return (
    <Panel kicker="Access control" title="Session token">
      {session ? <p>Signed in as <b>{session.username}</b> · role <span className="mono">{session.role}</span>.</p> : (
        <form className="form-row" onSubmit={e => { e.preventDefault(); void submit(); }}>
          <Field label="Username"><input value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" /></Field>
          <Field label="Password"><input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" /></Field>
          <Button type="submit" variant="primary" disabled={busy || !username || !password}>{busy ? 'Signing in…' : 'Sign in'}</Button>
        </form>
      )}
      <div className="button-row"><Button variant="ghost" onClick={() => { logout(); setMsg('Signed out and token cleared.'); }}>{session ? 'Sign out' : 'Clear token'}</Button></div>
      <p className="field-hint" aria-live="polite">{msg}</p>
      <p className="field-hint">No account yet? <Link to="/signup">Create one</Link>. Full-page sign-in: <Link to="/login">Sign in page</Link>.</p>
      <p className="field-hint">Local development allows unauthenticated access unless AEROOPT_AUTH_TOKENS or AEROOPT_USERS is set. Production fails closed.</p>
    </Panel>
  );
}

const SETTINGS: [string, string][] = [
  ['Data source', 'Synthetic local database'],
  ['Time model', 'Integer minutes · half-open intervals [start, finish)'],
  ['Timezone', 'Horizon-relative minutes; no local clock conversion'],
  ['Weather model', 'Synthetic restriction 780–810 minutes'],
  ['Support capacity', '2 concurrent units'],
  ['Human approval', 'Required before applying a schedule proposal'],
  ['CP-SAT availability', 'Pinned OR-Tools CP-SAT; greedy remains an explicit fallback'],
];

export default function Settings() {
  const d = useData();
  return (
    <>
      <PageHeader kicker="Console · System" title="Settings" lede="Theme, access and the fixed modelling assumptions." />
      <Panel kicker="Appearance" title="Theme">
        <ThemeSwitch />
        <p className="field-hint">Switching reloads the page. Both themes use the same API and data.</p>
      </Panel>
      <AuthPanel />
      <Panel kicker="Configuration" title="System boundaries">
        <dl className="settings-list">{SETTINGS.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
        <div className="button-row"><Button variant="ghost" size="sm" onClick={() => void d.refresh()}>Refresh data</Button></div>
      </Panel>
    </>
  );
}
