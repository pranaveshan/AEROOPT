/** Header account control: "Sign in / Sign up" when signed out, otherwise the user name with a menu holding Sign out. */
import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, LogOut, User } from 'lucide-react';
import { Link, useRouter } from '../lib/router';
import { useAuth } from './auth';

export function AccountMenu({ compact = false }: { compact?: boolean }) {
  const { session, logout } = useAuth();
  const { navigate } = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close); document.addEventListener('keydown', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close); };
  }, [open]);
  if (!session) {
    return (
      <div className="account-links">
        <Link to="/login" className="account-link">Sign in</Link>
        {!compact && <span aria-hidden className="muted">/</span>}
        <Link to="/signup" className="account-link">Sign up</Link>
      </div>
    );
  }
  return (
    <div className="account" ref={ref}>
      <button className="btn btn-quiet btn-sm account-btn" aria-haspopup="menu" aria-expanded={open} aria-controls={id} onClick={() => setOpen(o => !o)}>
        <User size={14} aria-hidden /><span className="account-name">{session.username}</span><span className="tag account-role">{session.role}</span><ChevronDown size={13} aria-hidden />
      </button>
      {open && (
        <div className="account-menu" role="menu" id={id}>
          <p className="account-meta">Signed in as <b>{session.username}</b><br /><span className="muted">Role: {session.role}</span></p>
          <button role="menuitem" className="account-item" autoFocus onClick={() => { logout(); setOpen(false); navigate('/login'); }}><LogOut size={14} aria-hidden /> Sign out</button>
        </div>
      )}
    </div>
  );
}
