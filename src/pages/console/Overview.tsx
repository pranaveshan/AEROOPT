import { Link } from 'react-router'

import { ReadinessDial } from '../../components/ReadinessDial'
import { AssignmentTimeline } from '../../components/Timeline'
import { Alert, Badge, Bar, Button, EmptyState, ErrorState, Loading, Metric, PageHeader, Section, StateBadge } from '../../components/ui'
import type { OverviewResponse, TimelineRow } from '../../lib/dto'
import { useQuery } from '../../lib/session'
import { formatDateTime, formatPercent, relativeTime } from '../../shared/format'

export default function Overview() {
  const { data, error, loading, reload } = useQuery<OverviewResponse>('/overview')

  if (loading) return <Loading rows={8} label="Loading operational overview" />
  if (error) return <ErrorState message={error instanceof Error ? error.message : 'Could not load the overview.'} onRetry={reload} />
  if (!data) return null

  const { metrics, readiness } = data
  const rows: TimelineRow[] = data.timeline.aircraft
    .filter((aircraft) => aircraft.assignments.length || aircraft.status !== 'unserviceable')
    .map((aircraft) => ({
      id: aircraft.id,
      label: aircraft.registration,
      status: aircraft.status,
      bars: aircraft.assignments.map((bar) => ({ id: bar.id, label: bar.label, start: bar.start, end: bar.end, state: bar.state })),
    }))

  const totalAircraft = Math.max(1, readiness.aircraft.ready + readiness.aircraft.restricted + readiness.aircraft.unavailable)
  const totalCrew = Math.max(1, readiness.crew.available + readiness.crew.onDuty + readiness.crew.unavailable)

  return (
    <div className="space-y-4">
      <PageHeader
        title="Operational overview"
        meta={
          <>
            <span>Operational data · UTC</span>
            <span className="text-ink-3/50">·</span>
            <span className="tnum">Generated {formatDateTime(data.generatedAt)}</span>
            {data.demoData ? (
              <>
                <span className="text-ink-3/50">·</span>
                <Badge tone="warn">Demonstration data</Badge>
              </>
            ) : null}
          </>
        }
        actions={
          <>
            <Link to="/console/tasks" className="btn btn-secondary btn-sm">
              Task register
            </Link>
            <Link to="/console/decision-engine" className="btn btn-primary btn-sm">
              Open decision engine
            </Link>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Serviceable aircraft"
          value={metrics.serviceableAircraft}
          unit={`/ ${metrics.totalAircraft}`}
          tone={metrics.serviceableAircraft === 0 ? 'danger' : 'default'}
          detail={`${metrics.restrictedAircraft} restricted`}
        />
        <Metric label="Available crew" value={metrics.availableCrew} unit={`/ ${metrics.totalCrew}`} detail="Available or on duty" />
        <Metric
          label="Unassigned tasks"
          value={metrics.unassignedTasks}
          tone={metrics.unassignedTasks > 0 ? 'warn' : 'ok'}
          detail={`${metrics.activeTasks} open tasks`}
        />
        <Metric
          label="Schedule"
          value={metrics.scheduleVersion ? `v${metrics.scheduleVersion}` : 'None'}
          detail={
            metrics.pendingApprovals
              ? `${metrics.pendingApprovals} proposal${metrics.pendingApprovals === 1 ? '' : 's'} awaiting approval`
              : 'No proposals pending'
          }
          tone={metrics.pendingApprovals ? 'warn' : 'default'}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.55fr_1fr]">
        <Section title="Operational readiness">
          <div className="grid gap-5 p-4 lg:grid-cols-[220px_1fr]">
            <div className="mx-auto w-full max-w-[240px]">
              <ReadinessDial
                axes={[
                  { label: 'Aircraft', value: readiness.aircraft.ready / totalAircraft, detail: `${readiness.aircraft.ready} serviceable` },
                  { label: 'Crew', value: (readiness.crew.available + readiness.crew.onDuty) / totalCrew, detail: `${readiness.crew.available + readiness.crew.onDuty} available` },
                  { label: 'Maintenance', value: 1 - metrics.maintenanceRestrictions / Math.max(1, metrics.totalAircraft), detail: `${metrics.maintenanceRestrictions} active` },
                  { label: 'Schedule', value: metrics.scheduleVersion ? Math.min(1, metrics.unassignedTasks === 0 ? 1 : 0.55) : 0, detail: metrics.scheduleVersion ? `v${metrics.scheduleVersion}` : 'none' },
                ]}
              />
              <p className="mt-1 text-center text-[11px] text-ink-3">Computed from current records</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <div className="flex items-baseline justify-between text-[12px]">
                <span className="text-ink-2">Aircraft</span>
                <span className="tnum text-ink-3">{formatPercent(readiness.aircraft.ready / totalAircraft)} ready</span>
              </div>
              <Bar value={readiness.aircraft.ready / totalAircraft} />
              <ul className="space-y-1 text-[11.5px] text-ink-3">
                <li className="flex justify-between">
                  <span>Serviceable</span>
                  <span className="tnum text-ok">{readiness.aircraft.ready}</span>
                </li>
                <li className="flex justify-between">
                  <span>Restricted</span>
                  <span className="tnum text-warn">{readiness.aircraft.restricted}</span>
                </li>
                <li className="flex justify-between">
                  <span>Unavailable</span>
                  <span className="tnum text-danger">{readiness.aircraft.unavailable}</span>
                </li>
              </ul>
            </div>
            <div className="space-y-2">
              <div className="flex items-baseline justify-between text-[12px]">
                <span className="text-ink-2">Crew</span>
                <span className="tnum text-ink-3">{formatPercent((readiness.crew.available + readiness.crew.onDuty) / totalCrew)} available</span>
              </div>
              <Bar value={(readiness.crew.available + readiness.crew.onDuty) / totalCrew} />
              <ul className="space-y-1 text-[11.5px] text-ink-3">
                <li className="flex justify-between">
                  <span>Available</span>
                  <span className="tnum text-ok">{readiness.crew.available}</span>
                </li>
                <li className="flex justify-between">
                  <span>On duty</span>
                  <span className="tnum text-info">{readiness.crew.onDuty}</span>
                </li>
                <li className="flex justify-between">
                  <span>Rest / leave</span>
                  <span className="tnum text-warn">{readiness.crew.unavailable}</span>
                </li>
              </ul>
            </div>
            <div className="space-y-2">
              <div className="flex items-baseline justify-between text-[12px]">
                <span className="text-ink-2">Maintenance</span>
                <span className="tnum text-ink-3">{ready(metrics.maintenanceRestrictions)}</span>
              </div>
              <Bar value={Math.min(1, metrics.maintenanceRestrictions / Math.max(1, metrics.totalAircraft))} tone="warn" />
              <p className="text-[11.5px] leading-relaxed text-ink-3">
                Active records block aircraft availability for their full window. Completed records release the airframe.
              </p>
              <Link to="/console/maintenance" className="text-[11.5px] text-accent hover:underline">
                Maintenance register
              </Link>
            </div>
            </div>
          </div>
        </Section>

        <Section
          title="Attention"
          action={<span className="tnum text-[11px] text-ink-3">{data.attention.length} item{data.attention.length === 1 ? '' : 's'}</span>}
        >
          {data.attention.length ? (
            <ul className="divide-y divide-line">
              {data.attention.slice(0, 6).map((item) => (
                <li key={item.id} className="px-4 py-2.5">
                  <div className="flex items-start gap-2">
                    <span
                      className="mt-1.5 size-1.5 shrink-0 rounded-full"
                      style={{ background: item.severity === 'critical' ? 'var(--danger)' : item.severity === 'warning' ? 'var(--warn)' : 'var(--info)' }}
                    />
                    <div className="min-w-0">
                      <div className="text-[12.5px] font-medium">{item.title}</div>
                      <p className="mt-0.5 text-[11.5px] text-ink-3">{item.detail}</p>
                      {item.action ? (
                        <Link to={item.action.to} className="mt-1 inline-block text-[11.5px] text-accent hover:underline">
                          {item.action.label}
                        </Link>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Nothing requires attention" detail="No unserviceable aircraft, active maintenance restrictions or unassigned work." />
          )}
        </Section>
      </div>

      <Section
        title="Assignment timeline · 24 hours"
        action={
          <Link to="/console/schedule" className="btn btn-ghost btn-sm">
            Full schedule
          </Link>
        }
      >
        <div className="p-4">
          <AssignmentTimeline from={data.timeline.from} to={data.timeline.to} rows={rows} emptyDetail="No assignments in the next 24 hours." />
        </div>
      </Section>

      <div className="grid gap-4 xl:grid-cols-2">
        <Section title="Unassigned work">
          {data.timeline.unassigned.length ? (
            <ul className="divide-y divide-line">
              {data.timeline.unassigned.map((task) => (
                <li key={task.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                  <div className="min-w-0">
                    <div className="mono text-[12px] text-ink-2">{task.code}</div>
                    <div className="truncate text-[12.5px]">{task.title}</div>
                    <div className="tnum mt-0.5 text-[11px] text-ink-3">
                      {formatDateTime(task.windowStart)} → {formatDateTime(task.windowEnd)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StateBadge value={task.priority} />
                    <Link to={`/console/tasks/${task.id}`} className="btn btn-ghost btn-sm">
                      Open
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="All open tasks assigned" detail="Every schedulable task has an aircraft and crew in the committed schedule." />
          )}
        </Section>

        <Section title="Latest optimization">
          {metrics.latestOptimization ? (
            <div className="space-y-3 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="mono text-[12px] text-ink-2">{metrics.latestOptimization.algorithm}</span>
                <StateBadge value={metrics.latestOptimization.feasibility} />
                <span className="tnum text-[11.5px] text-ink-3">{relativeTime(metrics.latestOptimization.createdAt)}</span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-[12.5px]">
                <div>
                  <div className="text-[11px] tracking-wide text-ink-3 uppercase">Assigned</div>
                  <div className="tnum text-[18px] font-semibold text-ok">{metrics.latestOptimization.assignedCount}</div>
                </div>
                <div>
                  <div className="text-[11px] tracking-wide text-ink-3 uppercase">Unassigned</div>
                  <div className="tnum text-[18px] font-semibold text-warn">{metrics.latestOptimization.unassignedCount}</div>
                </div>
              </div>
              <Alert tone="warn">Proposals remain non-operational until an authorised manager approves them.</Alert>
              <div className="flex gap-2">
                <Link to="/console/evaluation" className="btn btn-secondary btn-sm">
                  Review proposals
                </Link>
                <Link to="/console/decision-engine" className="btn btn-ghost btn-sm">
                  Run optimization
                </Link>
              </div>
            </div>
          ) : (
            <EmptyState
              title="No optimization run yet"
              detail="Run the decision engine to produce a proposal from the current task and resource set."
              action={
                <Button variant="primary" size="sm" onClick={() => (window.location.href = '/console/decision-engine')}>
                  Open decision engine
                </Button>
              }
            />
          )}
        </Section>
      </div>
    </div>
  )
}

const ready = (restrictions: number) => (restrictions ? `${restrictions} active` : 'clear')
