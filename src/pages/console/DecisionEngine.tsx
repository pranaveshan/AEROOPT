import { useState } from 'react'
import { Link } from 'react-router'

import { Alert, Badge, Button, Details, ErrorState, Loading, PageHeader, Section, StateBadge, TableWrap, useToast } from '../../components/ui'
import type { OptimizationProposal, RunSummary } from '../../lib/dto'
import { ApiError, post } from '../../lib/api'
import { useAuth, useQuery } from '../../lib/session'
import { formatDateTime, formatPercent, formatTime, relativeTime } from '../../shared/format'

const OBJECTIVES = [
  { key: 'assigned', label: 'Maximise assigned tasks', detail: 'Weight applied to the share of schedulable tasks that end up assigned.' },
  { key: 'preserve', label: 'Preserve existing assignments', detail: 'Rewards keeping the current aircraft, crew and start time for a task.' },
  { key: 'utilization', label: 'Improve aircraft utilization', detail: 'Rewards assigned airframe minutes across the planning horizon.' },
  { key: 'conflicts', label: 'Avoid constraint violations', detail: 'Penalises proposals that violate a constraint. The planner never emits a conflicting assignment.' },
] as const

type Weights = Record<(typeof OBJECTIVES)[number]['key'], number>

interface RunResponse {
  run: { id: string; scheduleId: string; version: number; algorithm: string; feasibility: string; assignedCount: number; unassignedCount: number; durationMs: number }
  proposal: OptimizationProposal
}

export default function DecisionEngine() {
  const { can } = useAuth()
  const toast = useToast()
  const [weights, setWeights] = useState<Weights>({ assigned: 60, preserve: 20, utilization: 15, conflicts: 5 })
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<RunResponse | null>(null)
  const runs = useQuery<{ items: RunSummary[] }>('/optimize/runs')

  const canRun = can('optimize:run')
  const total = Math.max(1, weights.assigned + weights.preserve + weights.utilization + weights.conflicts)

  const run = async () => {
    setRunning(true)
    try {
      const response = await post<RunResponse>('/optimize/run', { objective: weights })
      setResult(response)
      toast.push(`Proposal v${response.run.version} created`)
      runs.reload()
    } catch (caught) {
      toast.push(caught instanceof ApiError ? caught.message : 'Optimization failed', 'danger')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Decision engine"
        meta={
          <>
            <span>Operational data · UTC</span>
            <span className="text-ink-3/50">·</span>
            <span>Constraint-based greedy planner</span>
          </>
        }
      />

      {!canRun ? <Alert tone="warn" title="Read-only access">Your role can review optimization output but not run the engine.</Alert> : null}

      <div className="grid gap-4 xl:grid-cols-[340px_1fr]">
        <Section title="Objective weights">
          <div className="space-y-4 p-4">
            {OBJECTIVES.map((objective) => (
              <div key={objective.key}>
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <label htmlFor={objective.key} className="text-[12.5px] font-medium">
                    {objective.label}
                  </label>
                  <span className="tnum text-[12px] text-ink-3">{weights[objective.key]}</span>
                </div>
                <input
                  id={objective.key}
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={weights[objective.key]}
                  disabled={!canRun}
                  onChange={(event) => setWeights((current) => ({ ...current, [objective.key]: Number(event.target.value) }))}
                  className="w-full accent-[var(--accent)]"
                />
                <p className="mt-1 text-[11px] text-ink-3">{objective.detail}</p>
              </div>
            ))}
            <div className="border-t border-line pt-3">
              <p className="text-[11.5px] text-ink-3">
                Weights are normalised to {total}. Ties are broken by the best ordering of four candidate strategies (priority, tightest window, longest duration,
                earliest window), each evaluated with and without assignment preservation.
              </p>
              <Button variant="primary" className="mt-3 w-full" onClick={run} loading={running} disabled={!canRun}>
                Run optimization
              </Button>
            </div>
          </div>
        </Section>

        <div className="space-y-4">
          {running ? <Loading rows={6} label="Running optimization" /> : null}

          {!running && result ? (
            <>
              <Section
                title={`Proposal · schedule v${result.run.version}`}
                action={
                  <div className="flex items-center gap-2">
                    <StateBadge value={result.run.feasibility} />
                    <Badge tone="neutral">{result.run.durationMs} ms execution</Badge>
                  </div>
                }
              >
                <div className="space-y-3 p-4">
                  <Alert tone="warn" title="Awaiting approval">
                    This proposal is not operational. An operations manager must approve it in{' '}
                    <Link to="/console/evaluation" className="text-accent hover:underline">
                      Evaluation
                    </Link>
                    . The previous committed schedule remains in force.
                  </Alert>

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {[
                      { label: 'Assigned', value: result.proposal.assigned.length, tone: 'text-ok' },
                      { label: 'Unassigned', value: result.proposal.unassigned.length, tone: 'text-warn' },
                      { label: 'Utilization', value: formatPercent(result.proposal.utilization), tone: '' },
                      { label: 'Changed', value: result.proposal.changedFromCurrent, tone: '' },
                    ].map((metric) => (
                      <div key={metric.label} className="rounded-lg border border-line bg-surface-2/50 px-3 py-2">
                        <div className="text-[10.5px] tracking-wide text-ink-3 uppercase">{metric.label}</div>
                        <div className={`tnum text-[19px] font-semibold ${metric.tone}`}>{metric.value}</div>
                      </div>
                    ))}
                  </div>

                  <Details summary={`Algorithm · ${result.proposal.algorithm}`}>
                    <div className="space-y-1">
                      <p>{result.proposal.scoreFormula}</p>
                      <p className="tnum">
                        Weighted score {result.proposal.score.toFixed(4)} · ordering {result.proposal.ordering} · {result.proposal.consideredCandidates.toLocaleString('en-GB')}{' '}
                        candidate placements evaluated
                      </p>
                      <p>{result.proposal.feasibilityNote}</p>
                    </div>
                  </Details>

                  {result.proposal.assigned.length ? (
                    <TableWrap label="Proposed assignments">
                      <table className="data">
                        <thead>
                          <tr>
                            <th className="w-[110px]">Task</th>
                            <th className="w-[90px]">Aircraft</th>
                            <th className="w-[130px]">Crew</th>
                            <th className="w-[130px]">Start (UTC)</th>
                            <th className="w-[80px]">End</th>
                            <th className="min-w-[200px]">Decision</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.proposal.assigned.map((assignment) => (
                            <tr key={assignment.taskId}>
                              <td>
                                <Link to={`/console/tasks/${assignment.taskId}`} className="mono text-accent hover:underline">
                                  {assignment.code}
                                </Link>
                              </td>
                              <td className="mono text-[12px]">{assignment.aircraft}</td>
                              <td className="truncate text-[12px]">{assignment.crew}</td>
                              <td className="tnum text-[12px]">{formatDateTime(assignment.start)}</td>
                              <td className="tnum text-[12px]">{formatTime(assignment.end)}</td>
                              <td className="text-[11.5px] text-ink-3">{assignment.explanation}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </TableWrap>
                  ) : null}

                  {result.proposal.unassigned.length ? (
                    <div>
                      <h3 className="mb-2 text-[12px] font-semibold tracking-wide text-ink-2">Unassigned</h3>
                      <ul className="divide-y divide-line rounded-lg border border-line">
                        {result.proposal.unassigned.map((task) => (
                          <li key={task.taskId} className="px-3 py-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="mono text-[11.5px] text-accent">{task.code}</span>
                              <span className="text-[12.5px]">{task.title}</span>
                            </div>
                            <div className="text-[11.5px] text-warn">{task.reason}</div>
                            <div className="text-[11px] text-ink-3">{task.detail}</div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              </Section>
            </>
          ) : null}

          {!running && !result ? (
            <Section title="How a run is evaluated">
              <div className="space-y-3 p-4 text-[12.5px] text-ink-2">
                <p>
                  The engine reads the current aircraft, crew, maintenance and task records, filters candidates by capability, payload, qualification, availability,
                  duty, rest, turnaround, maintenance windows and dependencies, then places tasks in dependency order.
                </p>
                <p>
                  Every placement is re-validated before it is stored. Tasks that cannot be placed keep their unassigned state and carry the constraint that blocked
                  them.
                </p>
                <p className="text-ink-3">
                  Feasibility reflects the configured rules only. It is not an airworthiness, regulatory or safety clearance.
                </p>
              </div>
            </Section>
          ) : null}

          <Section title="Recent runs">
            {runs.loading ? (
              <Loading rows={3} label="Loading runs" />
            ) : runs.error ? (
              <ErrorState message="Could not load optimization history." onRetry={runs.reload} />
            ) : runs.data?.items.length ? (
              <TableWrap label="Optimization runs">
                <table className="data">
                  <thead>
                    <tr>
                      <th className="w-[240px]">Algorithm</th>
                      <th className="w-[110px]">Feasibility</th>
                      <th className="w-[90px]">Assigned</th>
                      <th className="w-[100px]">Unassigned</th>
                      <th className="w-[100px]">Duration</th>
                      <th className="w-[130px]">Run</th>
                      <th className="w-[130px]">By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.data.items.map((item) => (
                      <tr key={item.id}>
                        <td className="mono text-[11.5px]">{item.algorithm}</td>
                        <td>
                          <StateBadge value={item.feasibility} />
                        </td>
                        <td className="tnum text-[12.5px]">{item.assignedCount}</td>
                        <td className="tnum text-[12.5px]">{item.unassignedCount}</td>
                        <td className="tnum text-[12.5px]">{item.durationMs} ms</td>
                        <td className="tnum text-[11.5px] text-ink-3">{relativeTime(item.createdAt)}</td>
                        <td className="truncate text-[12px]">{item.createdByName}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            ) : (
              <p className="px-4 py-6 text-center text-[12.5px] text-ink-3">No optimization runs recorded.</p>
            )}
          </Section>
        </div>
      </div>
    </div>
  )
}
