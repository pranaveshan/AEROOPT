/** Persistent console shell: sidebar nav, mission-clock strip, data-mode banner, alerts, footer. */
import { useEffect, useState, type ReactNode } from 'react';
import { Activity, BarChart3, Book, Command, Compass, FileClock, Gauge, LayoutDashboard, Menu, Plane, Settings as Cog, SlidersHorizontal, Users, X } from 'lucide-react';
import { seconds, utcClock, DASH } from '../lib/format';
import { Link, useRouter } from '../lib/router';
import { useData } from './data';
import { AccountMenu } from './AccountMenu';
import { DataModeBanner, Tag, toneFor } from './ui';

export const NAV = [
  ['Dashboard', '/console', LayoutDashboard],
  ['Schedule', '/console/schedule', SlidersHorizontal],
  ['Fleet', '/console/fleet', Plane],
  ['Personnel', '/console/personnel', Users],
  ['Tasks', '/console/tasks', Activity],
  ['Scenarios', '/console/scenarios', Compass],
  ['Analytics', '/console/analytics', BarChart3],
  ['Benchmarks', '/console/benchmarks', Gauge],
  ['Audit log', '/console/audit', FileClock],
  ['Settings', '/console/settings', Cog],
  ['About & Assumptions', '/console/about', Book],
] as const;

function UtcClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);
  return <span className="mono clock" aria-label="Current UTC time">{utcClock(now)}</span>;
}

function MissionStrip() {
  const d = useData();
  const r = d.dashboard?.recent_run;
  return (
    <div className="mission-strip" role="group" aria-label="Status strip">
      <div><span className="micro">UTC</span><UtcClock /></div>
      <div><span className="micro">Schedule</span><span className="mono">{d.dashboard?.schedule_version ?? DASH}</span></div>
      <div><span className="micro">Last run</span>{r ? <span className="strip-run"><Tag tone={toneFor(r.status)}>{r.status}</Tag><span className="mono">{seconds(r.duration_seconds)}</span></span> : <span className="mono">{DASH}</span>}</div>
      <div aria-live="polite"><span className="micro">Solver</span><span className="mono">{d.phase === 'solving' ? <span className="live">Solving…</span> : 'Idle'}</span></div>
      <div><span className="micro">API</span><span className="mono"><i className={`dot ${d.apiOnline ? 'dot-success' : d.apiOnline === false ? 'dot-danger' : ''}`} aria-hidden /> {d.apiOnline ? 'Connected' : d.apiOnline === false ? 'Offline' : 'Checking'}</span></div>
    </div>
  );
}

function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { navigate } = useRouter();
  const [q, setQ] = useState('');
  const [i, setI] = useState(0);
  const items = NAV.filter(([l]) => l.toLowerCase().includes(q.toLowerCase()));
  useEffect(() => { if (open) { setQ(''); setI(0); } }, [open]);
  if (!open) return null;
  return (
    <div className="overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Go to page">
        <div className="palette-input"><Command size={15} aria-hidden />
          <input autoFocus value={q} onChange={e => { setQ(e.target.value); setI(0); }} placeholder="Go to page…" aria-label="Search pages"
            onKeyDown={e => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setI(x => Math.min(items.length - 1, x + 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setI(x => Math.max(0, x - 1)); }
              if (e.key === 'Enter' && items[i]) { navigate(items[i][1]); onClose(); }
              if (e.key === 'Escape') onClose();
            }} />
          <button className="icon-btn" onClick={onClose} aria-label="Close command palette"><X size={15} /></button>
        </div>
        <ul role="listbox" aria-label="Pages">
          {items.map(([label, path, Icon], k) => (
            <li key={path} role="option" aria-selected={k === i}>
              <button className={`palette-item ${k === i ? 'active' : ''}`} onClick={() => { navigate(path); onClose(); }}><Icon size={15} aria-hidden /><span>{label}</span></button>
            </li>
          ))}
        </ul>
        <p className="palette-hint">↑ ↓ to move · Enter to open · Esc to close</p>
      </div>
    </div>
  );
}

export function ConsoleShell({ children }: { children: ReactNode }) {
  const { path } = useRouter();
  const d = useData();
  const [menu, setMenu] = useState(false);
  const [cmd, setCmd] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setCmd(x => !x); }
      if (e.key === 'Escape') setMenu(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => { setMenu(false); d.setError(''); d.setNotice(''); }, [path]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={`console ${d.activeScenario ? 'is-scenario' : ''}`}>
      <a className="skip-link" href="#console-main">Skip to content</a>
      <aside className={`sidebar ${menu ? 'open' : ''}`} aria-label="Console navigation">
        <Link to="/" className="lockup" aria-label="AeroOpt showcase"><span className="lockup-mark" aria-hidden><svg viewBox="0 0 24 24"><path d="M2 14 L22 6 L14 22 L12 14 Z" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg></span><span className="lockup-word">Aero<b>Opt</b></span></Link>
        <nav>
          <ul>
            {NAV.map(([label, to, Icon]) => (
              <li key={to}><Link to={to} className={`nav-link ${path === to ? 'active' : ''}`} aria-current={path === to ? 'page' : undefined}><Icon size={16} strokeWidth={1.6} aria-hidden /><span>{label}</span></Link></li>
            ))}
          </ul>
        </nav>
        <div className="sidebar-foot"><span className="micro">Synthetic dataset</span><span>Local instance · no external feeds</span></div>
      </aside>
      {menu && <div className="scrim" onClick={() => setMenu(false)} aria-hidden />}
      <div className="console-main">
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setMenu(m => !m)} aria-label={menu ? 'Close navigation' : 'Open navigation'} aria-expanded={menu}><Menu size={18} /></button>
          <MissionStrip />
          <button className="btn btn-quiet btn-sm cmd-btn" onClick={() => setCmd(true)} aria-label="Open command palette (Ctrl+K)"><Command size={13} aria-hidden /><span>Go to</span><kbd>Ctrl&nbsp;K</kbd></button>
          <AccountMenu compact />
        </header>
        <DataModeBanner />
        <main id="console-main" className="content">
          <div aria-live="polite">
            {d.error && <div className="alert alert-error" role="alert"><span>{d.error}</span><button className="icon-btn" onClick={() => d.setError('')} aria-label="Dismiss error"><X size={14} /></button></div>}
            {d.notice && <div className="alert alert-success" role="status"><span>{d.notice}</span><button className="icon-btn" onClick={() => d.setNotice('')} aria-label="Dismiss message"><X size={14} /></button></div>}
          </div>
          <div className="route-view">{children}</div>
        </main>
        <footer className="console-foot"><span>AeroOpt prototype 0.1.0</span><span>Fictional data · not for operational use</span></footer>
      </div>
      <CommandPalette open={cmd} onClose={() => setCmd(false)} />
    </div>
  );
}
