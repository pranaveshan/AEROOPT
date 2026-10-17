/** Surface 1: cinematic, sparse showcase. Every number is read from the API (or a stored real comparison). */
import { useEffect, useRef } from 'react';
import { count, delta, percent, ratio, seconds, utcTimestamp, DASH } from '../../lib/format';
import { Link } from '../../lib/router';
import { useReducedMotion } from '../../lib/motion';
import { useData } from '../data';
import { viewerStatus } from '../status';
import { AircraftViewer } from '../three/AircraftViewer';
import { Gantt } from '../components';
import { AccountMenu } from '../AccountMenu';
import { LinkButton, Tag, Telemetry, toneFor } from '../ui';

/** Adds .is-in to [data-reveal] elements as they scroll in. Without JS/motion they are simply visible. */
function useReveal(root: React.RefObject<HTMLElement | null>, reduced: boolean) {
  useEffect(() => {
    const el = root.current;
    if (!el || reduced || typeof IntersectionObserver === 'undefined') return;
    el.classList.add('reveal-ready');
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } }), { threshold: 0.15 });
    el.querySelectorAll('[data-reveal]').forEach(n => io.observe(n));
    return () => { io.disconnect(); el.classList.remove('reveal-ready'); };
  }, [root, reduced]);
}

function ScrollProgress({ reduced }: { reduced: boolean }) {
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (reduced) return;
    const on = () => {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      if (bar.current) bar.current.style.transform = `scaleY(${h > 0 ? window.scrollY / h : 0})`;
    };
    on(); window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, [reduced]);
  return reduced ? null : <div className="scroll-progress" ref={bar} aria-hidden />;
}

export default function Showcase() {
  const d = useData();
  const reduced = useReducedMotion();
  const root = useRef<HTMLDivElement>(null);
  useReveal(root, reduced);
  const m = d.dashboard;
  const recent = m?.recent_run ?? null;
  const c = d.comparison?.result;
  const types = Object.entries(d.aircraft.reduce<Record<string, number>>((acc, a) => { acc[a.type] = (acc[a.type] ?? 0) + 1; return acc; }, {}));
  const offline = d.loaded && d.apiOnline === false;

  return (
    <div className="showcase" ref={root}>
      <ScrollProgress reduced={reduced} />
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="show-header">
        <Link to="/" className="lockup" aria-label="AeroOpt home"><span className="lockup-mark" aria-hidden><svg viewBox="0 0 24 24"><path d="M2 14 L22 6 L14 22 L12 14 Z" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg></span><span className="lockup-word">Aero<b>Opt</b></span></Link>
        <nav aria-label="Showcase">
          <a href="#plan">Plan</a><a href="#compare">Benchmarks</a><a href="#fleet">Fleet</a><a href="#method">Method</a>
          <AccountMenu />
          <LinkButton to="/console" variant="ghost">Console</LinkButton>
        </nav>
      </header>

      <main id="main">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-sky" aria-hidden><div className="runway" /></div>
          <div className="hero-3d"><AircraftViewer mode="hero" status={viewerStatus(d)} label="Procedural airliner; beacon colour reflects the latest solver state." /></div>
          <div className="hero-copy" data-reveal>
            <span className="micro">Aviation resource scheduling · synthetic data</span>
            <h1 id="hero-title">Every aircraft, crew and task in one 24‑hour plan.</h1>
            <p className="lede">AeroOpt builds the day's schedule with a CP-SAT optimizer, checks it against a greedy baseline and saves nothing until you approve it.</p>
            <div className="hero-actions">
              <LinkButton to="/console" variant="primary">Open console</LinkButton>
              <a className="btn btn-ghost btn-md" href="#method">How it works</a>
            </div>
          </div>
          <div className="hero-telemetry" aria-label="Live figures from the API">
            <Telemetry label="Aircraft serviceable" value={m ? ratio(m.aircraft.serviceable, m.aircraft.total) : DASH} />
            <Telemetry label="Personnel available" value={m ? ratio(m.personnel.available, m.personnel.total) : DASH} />
            <Telemetry label="Tasks pending" numeric={m?.tasks.pending ?? null} value={DASH} />
            <Telemetry label="Latest run" value={recent ? <Tag tone={toneFor(recent.status)}>{recent.status}</Tag> : DASH} note={recent ? `${recent.solver} · ${seconds(recent.duration_seconds)}` : <Link to="/console">No run yet: run the optimizer</Link>} />
          </div>
          {offline && <p className="hero-offline" role="status">The API is not reachable, so figures show “—”. Start the backend and reload.</p>}
        </section>

        <section id="plan" className="show-section" aria-labelledby="plan-title">
          <div className="show-head" data-reveal>
            <span className="micro">01 · Today's plan</span>
            <h2 id="plan-title">{m ? `${count(d.schedule.length)} assignments across ${count(m.aircraft.total)} aircraft.` : 'The saved schedule, as it stands.'}</h2>
            <p className="lede">Each bar is a task on an aircraft, placed inside its release window, crew duty limit and maintenance gaps. Completion stands at {m ? percent(m.completion_rate) : DASH}.</p>
          </div>
          <div className="show-gantt" data-reveal>
            {d.schedule.length ? <Gantt compact aircraft={d.aircraft} schedule={d.schedule} /> : <p className="empty-body">No saved assignments yet. <Link to="/console">Run the optimizer in the console</Link> and approve a proposal.</p>}
          </div>
        </section>

        <section id="compare" className="show-section" aria-labelledby="compare-title">
          <div className="show-head" data-reveal>
            <span className="micro">02 · Optimizer vs baseline</span>
            <h2 id="compare-title">{c ? `The optimizer assigned ${count(c.cp_sat.assigned)} tasks; the baseline assigned ${count(c.greedy.assigned)}.` : 'Two engines, one dataset, measured.'}</h2>
            <p className="lede">{c ? `Measured on saved data at ${utcTimestamp(d.comparison?.at)}.` : 'No comparison has been run in this browser yet.'}</p>
          </div>
          <div className="compare-strip" data-reveal>
            <Telemetry label="Baseline · greedy" value={c ? count(c.greedy.assigned) : DASH} unit="tasks" note={c ? c.greedy.status : 'Not run'} />
            <Telemetry label="Optimizer · CP-SAT" value={c ? count(c.cp_sat.assigned) : DASH} unit="tasks" note={c ? c.cp_sat.status : 'Not run'} />
            <Telemetry label="Difference" value={c ? delta(c.cp_sat.assigned - c.greedy.assigned) : DASH} unit="tasks" tone="accent" note={c ? 'Optimizer minus baseline' : <Link to="/console/benchmarks">Run a comparison in Benchmarks</Link>} />
          </div>
        </section>

        <section id="fleet" className="show-section show-fleet" aria-labelledby="fleet-title">
          <div className="show-head" data-reveal>
            <span className="micro">03 · Fleet</span>
            <h2 id="fleet-title">{m ? `${count(m.aircraft.serviceable)} of ${count(m.aircraft.total)} aircraft ready to fly.` : 'Fleet readiness.'}</h2>
            <p className="lede">Serviceability, capabilities, flight-hour limits and turnaround times come straight from the fleet records.</p>
          </div>
          <ul className="type-list" data-reveal>
            {types.length ? types.map(([t, n]) => <li key={t}><span>{t}</span><b className="mono">{n}</b></li>) : <li><span>No aircraft loaded</span><b className="mono">{DASH}</b></li>}
          </ul>
        </section>

        <section id="method" className="show-section" aria-labelledby="method-title">
          <div className="show-head" data-reveal>
            <span className="micro">04 · Method</span>
            <h2 id="method-title">Model. Solve. Validate. Approve.</h2>
          </div>
          <ol className="method" data-reveal>
            <li><b>Model</b><span>Aircraft, crew, tasks, maintenance and weather become constraints over integer minutes.</span></li>
            <li><b>Solve</b><span>CP-SAT searches for the best plan in 5 s; the greedy baseline is always ready as a fallback.</span></li>
            <li><b>Validate</b><span>An independent checker re-tests every assignment and lists the reasons for anything left out.</span></li>
            <li><b>Approve</b><span>You review the proposal; only an explicit approval writes it to saved data, with an audit entry.</span></li>
          </ol>
          <div className="final-cta" data-reveal><LinkButton to="/console/scenarios" variant="ghost">Try a what-if scenario</LinkButton></div>
        </section>
      </main>
      <footer className="show-footer">
        <span>AeroOpt prototype 0.1.0</span><span>Fictional data · not for operational use</span>
        <span>API <i className={`dot ${d.apiOnline ? 'dot-success' : 'dot-danger'}`} aria-hidden /> {d.apiOnline ? 'connected' : d.apiOnline === false ? 'not connected' : 'checking'}</span>
      </footer>
    </div>
  );
}
