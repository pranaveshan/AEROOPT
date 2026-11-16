import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router'

import { AircraftViewer } from '../components/AircraftViewer'
import { useAuth } from '../lib/session'
import { useTheme } from '../lib/theme'

const CAPABILITIES = [
  {
    title: 'Operational readiness',
    detail: 'Serviceability, crew availability, maintenance restrictions and unassigned work, derived from current records.',
    items: ['Aircraft and crew state', 'Maintenance windows', '24-hour assignment timeline'],
  },
  {
    title: 'Constraint-aware scheduling',
    detail: 'Every placement is checked against capability, payload, qualification, duty, rest, turnaround and dependencies.',
    items: ['Dependency ordering', 'Duty and rest limits', 'Conflict detection'],
  },
  {
    title: 'Explainable optimization',
    detail: 'The engine proposes a schedule and states what blocked each unassigned task. Nothing becomes operational without approval.',
    items: ['Weighted objectives', 'Per-task decisions', 'Version comparison'],
  },
  {
    title: 'Traceability',
    detail: 'Task, resource, schedule and permission changes create audit records. Sessions and sign-in events are retained.',
    items: ['Audit trail', 'Approval decisions', 'Session revocation'],
  },
]

export function Landing() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  useTheme()

  useEffect(() => {
    document.title = 'AeroOpt · Air operations and resource optimisation'
  }, [])

  return (
    <div className="min-h-svh bg-canvas">
      <header className="border-b border-line">
        <div className="mx-auto flex h-14 max-w-[1180px] items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="grid size-7 place-items-center rounded-[7px] bg-accent text-[13px] font-bold text-accent-ink">A</span>
            <span className="text-[15px] font-semibold tracking-tight">AeroOpt</span>
          </Link>
          <nav className="flex items-center gap-1.5">
            {loading ? null : user ? (
              <Link to="/console" className="btn btn-primary btn-sm">
                Open console
              </Link>
            ) : (
              <>
                <Link to="/signin" className="btn btn-ghost btn-sm">
                  Sign in
                </Link>
                <Link to="/signup" className="btn btn-primary btn-sm">
                  Request access
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-[1180px] px-4 pt-10 pb-10 sm:px-6 sm:pt-14">
          <div className="grid items-center gap-8 lg:grid-cols-[1.05fr_1fr] lg:gap-12">
            <div className="min-w-0">
              <h1 className="max-w-[560px] text-[30px] leading-[1.12] font-semibold tracking-[-0.02em] text-balance sm:text-[40px]">
                Schedule aircraft, crew and maintenance against the constraints that decide the flight.
              </h1>
              <p className="mt-4 max-w-[500px] text-[14px] leading-relaxed text-ink-2">
                AeroOpt holds the operational record and validates every assignment on the server: capability, payload, qualification, duty, rest, turnaround,
                maintenance windows and task dependencies. Optimization produces a proposal; a manager approves it before it takes effect.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-2.5">
                <button className="btn btn-primary" onClick={() => navigate(user ? '/console' : '/signin')}>
                  {user ? 'Open operations console' : 'Sign in to the console'}
                </button>
                <a className="btn btn-secondary" href="#capabilities">
                  Capabilities
                </a>
              </div>
              <p className="mt-4 text-[11.5px] text-ink-3">All times UTC · synthetic demonstration dataset · no external feeds connected</p>
            </div>

            <figure className="min-w-0">
              <AircraftViewer height={340} register="G-AOPT" label="Composite airframe" type="Composite twin-engine airliner" />
              <figcaption className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-ink-3">
                <span>Drag to rotate · scroll to zoom · double-click to reset</span>
                <span>Generic model · not a type-specific airframe</span>
              </figcaption>
            </figure>
          </div>
        </section>

        <section id="capabilities" className="border-t border-line bg-surface">
          <div className="mx-auto max-w-[1180px] px-4 py-10 sm:px-6">
            <h2 className="text-[19px] font-semibold tracking-tight">What the console does</h2>
            <dl className="mt-5 grid gap-x-10 gap-y-6 sm:grid-cols-2">
              {CAPABILITIES.map((capability) => (
                <div key={capability.title} className="border-t border-line pt-4">
                  <dt className="text-[13.5px] font-semibold">{capability.title}</dt>
                  <dd className="mt-1.5 text-[12.5px] leading-relaxed text-ink-2">{capability.detail}</dd>
                  <dd className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-ink-3">
                    {capability.items.map((item) => (
                      <span key={item} className="inline-flex items-center gap-1.5">
                        <span className="size-[3px] rounded-full bg-accent" />
                        {item}
                      </span>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="border-t border-line">
          <div className="mx-auto grid max-w-[1180px] gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1.1fr_1fr]">
            <div>
              <h2 className="text-[19px] font-semibold tracking-tight">Optimization proposes. People approve.</h2>
              <p className="mt-2 max-w-[520px] text-[13px] leading-relaxed text-ink-2">
                A run reads the current registers, evaluates candidate placements and returns a scored proposal with the objective, feasibility result, assigned and
                unassigned sets, and the execution duration. Approval commits a new schedule version; the previous version remains available for comparison.
              </p>
            </div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
              {[
                ['Approval gate', 'Authorised role required to commit'],
                ['Version history', 'Superseded schedules retained'],
                ['Server enforcement', 'Permissions checked on every write'],
                ['Audit records', 'Operational changes retained'],
              ].map(([term, detail]) => (
                <div key={term} className="border-t border-line pt-2.5">
                  <dt className="text-[12.5px] font-medium">{term}</dt>
                  <dd className="mt-0.5 text-[11.5px] text-ink-3">{detail}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-2 px-4 py-4 text-[11px] text-ink-3 sm:px-6">
          <span>AeroOpt · Air operations and resource optimisation</span>
          <span>Demonstration deployment · not for operational use</span>
        </div>
      </footer>
    </div>
  )
}
