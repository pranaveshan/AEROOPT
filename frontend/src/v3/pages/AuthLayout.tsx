import type { ReactNode } from 'react';
import { Link } from '../../lib/router';

/** Shared frame for /login and /signup (sky backdrop, lockup, one card). */
export function AuthLayout({ kicker, title, lede, alt, children }: { kicker: string; title: string; lede: string; alt: ReactNode; children: ReactNode }) {
  return (
    <div className="auth-page">
      <a className="skip-link" href="#auth-main">Skip to content</a>
      <header className="show-header auth-header">
        <Link to="/" className="lockup" aria-label="AeroOpt home"><span className="lockup-mark" aria-hidden><svg viewBox="0 0 24 24"><path d="M2 14 L22 6 L14 22 L12 14 Z" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg></span><span className="lockup-word">Aero<b>Opt</b></span></Link>
        <nav aria-label="Account">{alt}</nav>
      </header>
      <div className="hero-sky" aria-hidden><div className="runway" /></div>
      <main id="auth-main" className="auth-main">
        <div className="auth-card">
          <span className="micro">{kicker}</span>
          <h1>{title}</h1>
          <p className="lede">{lede}</p>
          {children}
        </div>
      </main>
    </div>
  );
}
