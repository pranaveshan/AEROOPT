import { useState } from 'react'

import {
  Alert,
  Badge,
  Bar,
  Button,
  Details,
  ErrorState,
  Field,
  Loading,
  Metric,
  Modal,
  PageHeader,
  Section,
  Select,
  StateBadge,
  TableWrap,
  Tabs,
  Textarea,
  useToast,
} from '../../components/ui'
import type { AnalyticsResponse, ApprovalRow, RunSummary } from '../../lib/dto'
import { ApiError, post } from '../../lib/api'
import { useAuth, useQuery } from '../../lib/session'
import { formatDateTime, formatDuration, formatPercent, relativeTime } from '../../shared/format'

type Tab = 'performance' | 'proposals' | 'history'

export default function Evaluation() {
  const { can } = useAuth()
  const toast = useToast()
  const [days, setDays] = useState('7')
  const [tab, setTab] = useState<Tab>('performance')
  const analytics = useQuery<AnalyticsResponse>(`/analytics?days=${days}`, [days])
  const approvals = useQuery<{ items: ApprovalRow[] }>('/approvals')
  const runs = useQuery<{ items: RunSummary[] }>('/optimize/runs')
  const versions = useQuery<{ items: { id: string; version: number; status: string; source: string; assignmentCount: number; createdAt: string; createdByName: string }[] }>('/schedule/versions')
  const [decision, setDecision] = useState<{ approval: ApprovalRow; action: 'approve' | 'reject' } | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  const canApprove = can('schedule:approve')
  const pending = approvals.data?.items.filter((item) => item.status === 'pending') ?? []

  const submitDecision = async () => {
    if (!decision) return
    setBusy(true)
    try {
      if (decision.action === 'approve') await post(`/approvals/${decision.approval.id}/approve`, { reason: reason || 'Approved' })
      else await post(`/approvals/${decision.approval.id}/reject`, { reason })
      toast.push(decision.action === 'approve' ? 'Proposal approved and committed' : 'Proposal rejected')
      setDecision(null)
      setReason('')
      approvals.reload()
      analytics.reload()
      versions.reload()
    } catch (caught) {
      toast.push(caught instanceof ApiError ? caught.message : 'Decision failed', 'danger')
    } finally {
      setBusy(false)
    }
  }

  const data = analytics.data

  return (
    <div className="space-y-4">
      <PageHeader
        title="Evaluation"
        meta={
          <>
            <span>Operational data · UTC</span>
            <span className="text-ink-3/50">·</span>
            <span className="tnum">Range {days} days</span>
            {pending.length ? <Badge tone="warn">{pending.length} pending approval</Badge> : null}
          </>
        }
        actions={
          <Select value={days} onChange={(e) => setDays(e.target.value)} aria-label="Range" className="w-auto min-w-[140px]">
            <option value="1">Last 24 hours</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </Select>
        }
      />

      <Section>
        <div className="border-b border-line px-3 py-2">
          <Tabs
            value={tab}
            onChange={setTab}
            options={[
              { value: 'performance', label: 'Performance' },
              { value: 'proposals', label: 'Proposals', count: pending.length },
              { value: 'history', label: 'Schedule history' },
            ]}
          />
        </div>

        {tab === 'performance' ? (
          analytics.loading ? (
            <Loading rows={6} label="Loading analytics" />
          ) : analytics.error ? (
            <ErrorState message="Could not load analytics." onRetry={analytics.reload} />
          ) : data ? (
            <div className="space-y-4 p-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Metric label="Assignment rate" value={formatPercent(data.tasks.assignmentRate)} detail={`${data.tasks.assigned} of ${data.tasks.open} open tasks`} />
                <Metric label="Aircraft utilization" value={formatPercent(data.utilization.aircraft)} detail={`${data.utilization.aircraftCount} airframes`} />
                <Metric label="Crew utilization" value={formatPercent(data.utilization.crew)} detail={`${data.utilization.crewCount} available crew`} />
                <Metric
                  label="Unassigned workload"
                  value={formatDuration(data.tasks.unassignedMinutes)}
                  tone={data.tasks.unassignedMinutes ? 'warn' : 'ok'}
                  detail={`${data.tasks.unassigned} tasks without assignment`}
                />
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-lg border border-line p-3">
                  <h3 className="mb-2 text-[12px] font-semibold tracking-wide text-ink-2">Tasks by state</h3>
                  <div className="space-y-2">
                    {data.byState.map((row) => (
                      <div key={row.state} className="flex items-center gap-2">
                        <span className="w-[86px] text-[11.5px] text-ink-3">{row.state.replace(/_/g, ' ')}</span>
                        <div className="flex-1">
                          <Bar value={row.count / Math.max(1, data.tasks.total)} tone={row.state === 'blocked' ? 'danger' : row.state === 'cancelled' ? 'warn' : 'accent'} />
                        </div>
                        <span className="tnum w-7 text-right text-[11.5px]">{row.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-lg border border-line p-3">
                  <h3 className="mb-2 text-[12px] font-semibold tracking-wide text-ink-2">Priority coverage</h3>
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Priority</th>
                        <th className="text-right">Open</th>
                        <th className="text-right">Assigned</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.byPriority.map((row) => (
                        <tr key={row.priority}>
                          <td>
                            <StateBadge value={row.priority} />
                          </td>
                          <td className="tnum text-right">{row.total}</td>
                          <td className="tnum text-right">{row.assigned}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-3">
                <div className="rounded-lg border border-line p-3">
                  <div className="text-[11px] tracking-wide text-ink-3 uppercase">Completion rate</div>
                  <div className="tnum mt-1 text-[20px] font-semibold">{formatPercent(data.tasks.completionRate)}</div>
                  <div className="mt-1 text-[11.5px] text-ink-3">
                    {data.tasks.completed} completed · {data.tasks.cancelled} cancelled
                  </div>
                </div>
                <div className="rounded-lg border border-line p-3">
                  <div className="text-[11px] tracking-wide text-ink-3 uppercase">Schedule conflicts</div>
                  <div className={`tnum mt-1 text-[20px] font-semibold ${data.conflicts.count ? 'text-danger' : 'text-ok'}`}>{data.conflicts.count}</div>
                  <div className="mt-1 text-[11.5px] text-ink-3">Independent re-check of the committed assignments</div>
                </div>
                <div className="rounded-lg border border-line p-3">
                  <div className="text-[11px] tracking-wide text-ink-3 uppercase">Maintenance impact</div>
                  <div className="tnum mt-1 text-[20px] font-semibold">{formatDuration(data.maintenance.aircraftMinutes)}</div>
                  <div className="mt-1 text-[11.5px] text-ink-3">{data.maintenance.records} records</div>
                </div>
              </div>

              {data.conflicts.count ? (
                <Alert tone="danger" title="Committed assignments violate constraints">
                  <ul className="mt-1 space-y-0.5">
                    {data.conflicts.items.slice(0, 8).map((item, index) => (
                      <li key={`${item.assignmentId}-${index}`} className="text-[12px]">
                        {item.message}
                      </li>
                    ))}
                  </ul>
                </Alert>
              ) : null}

              <Details summary="Metric definitions">
                <ul className="space-y-1">
                  {Object.entries(data.definitions).map(([key, value]) => (
                    <li key={key}>
                      <span className="font-medium text-ink">{key}</span> — {value}
                    </li>
                  ))}
                </ul>
              </Details>

              <div className="rounded-lg border border-line p-3">
                <h3 className="mb-2 text-[12px] font-semibold tracking-wide text-ink-2">Optimization performance</h3>
                <div className="mb-2 grid grid-cols-3 gap-2 text-[12px]">
                  <div>
                    <div className="text-ink-3">Runs</div>
                    <div className="tnum font-semibold">{data.optimization.runs.length}</div>
                  </div>
                  <div>
                    <div className="text-ink-3">Avg assigned</div>
                    <div className="tnum font-semibold">{data.optimization.averageAssigned.toFixed(1)}</div>
                  </div>
                  <div>
                    <div className="text-ink-3">Avg duration</div>
                    <div className="tnum font-semibold">{Math.round(data.optimization.averageDurationMs)} ms</div>
                  </div>
                </div>
                {data.optimization.runs.length ? (
                  <ul className="divide-y divide-line text-[12px]">
                    {data.optimization.runs.slice(0, 5).map((run) => (
                      <li key={run.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                        <span className="mono text-[11.5px]">{run.algorithm}</span>
                        <span className="tnum text-ink-3">
                          {run.assigned} assigned · {run.unassigned} unassigned · {run.durationMs} ms · {relativeTime(run.createdAt)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[12px] text-ink-3">No runs recorded.</p>
                )}
              </div>
            </div>
          ) : null
        ) : null}

        {tab === 'proposals' ? (
          approvals.loading ? (
            <Loading rows={4} label="Loading proposals" />
          ) : approvals.error ? (
            <ErrorState message="Could not load proposals." onRetry={approvals.reload} />
          ) : approvals.data?.items.length ? (
            <TableWrap label="Schedule proposals">
              <table className="data">
                <thead>
                  <tr>
                    <th className="w-[90px]">Version</th>
                    <th className="w-[110px]">Status</th>
                    <th className="w-[140px]">Source</th>
                    <th className="w-[150px]">Requested by</th>
                    <th className="w-[140px]">Requested</th>
                    <th className="w-[150px]">Decision by</th>
                    <th className="min-w-[200px]">Reason</th>
                    <th className="w-[150px] text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {approvals.data.items.map((approval) => (
                    <tr key={approval.id}>
                      <td className="tnum">{approval.scheduleVersion ? `v${approval.scheduleVersion}` : '—'}</td>
                      <td>
                        <StateBadge value={approval.status} />
                      </td>
                      <td className="text-[12px]">{approval.scheduleSource === 'optimization' ? 'Optimization' : 'Manual'}</td>
                      <td className="truncate text-[12px]">{approval.requestedByName}</td>
                      <td className="tnum text-[11.5px]">{formatDateTime(approval.createdAt)}</td>
                      <td className="text-[12px]">
                        {approval.decidedByName ?? <span className="text-ink-3">—</span>}
                        {approval.decidedAt ? <div className="text-[11px] text-ink-3">{relativeTime(approval.decidedAt)}</div> : null}
                      </td>
                      <td className="max-w-[260px] text-[11.5px] text-ink-2">{approval.reason || '—'}</td>
                      <td>
                        {approval.status === 'pending' ? (
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="primary" disabled={!canApprove} onClick={() => setDecision({ approval, action: 'approve' })}>
                              Approve
                            </Button>
                            <Button size="sm" variant="danger" disabled={!canApprove} onClick={() => setDecision({ approval, action: 'reject' })}>
                              Reject
                            </Button>
                          </div>
                        ) : (
                          <div className="text-right text-[11.5px] text-ink-3">Decided</div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          ) : (
            <p className="px-4 py-6 text-center text-[12.5px] text-ink-3">No proposals have been raised.</p>
          )
        ) : null}

        {tab === 'history' ? (
          versions.loading ? (
            <Loading rows={4} label="Loading schedule history" />
          ) : (
            <TableWrap label="Schedule versions">
              <table className="data">
                <thead>
                  <tr>
                    <th className="w-[90px]">Version</th>
                    <th className="w-[110px]">Status</th>
                    <th className="w-[130px]">Source</th>
                    <th className="w-[110px]">Assignments</th>
                    <th className="w-[160px]">Created (UTC)</th>
                    <th className="w-[150px]">Created by</th>
                    <th className="min-w-[200px]">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {(versions.data?.items ?? []).map((version) => (
                    <tr key={version.id}>
                      <td className="tnum font-medium">v{version.version}</td>
                      <td>
                        <StateBadge value={version.status} />
                      </td>
                      <td className="text-[12px]">{version.source === 'optimization' ? 'Optimization' : 'Manual'}</td>
                      <td className="tnum">{version.assignmentCount}</td>
                      <td className="tnum text-[12px]">{formatDateTime(version.createdAt)}</td>
                      <td className="truncate text-[12px]">{version.createdByName}</td>
                      <td className="text-[11.5px] text-ink-3">{version.status === 'committed' ? 'Operational schedule' : version.status === 'superseded' ? 'Retained for comparison' : version.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )
        ) : null}
      </Section>

      {runs.data?.items.length ? (
        <p className="text-[11.5px] text-ink-3">
          {runs.data.items.length} optimization runs retained for reference. Run details are stored with their objective, feasibility and execution time.
        </p>
      ) : null}

      <Modal
        open={Boolean(decision)}
        title={decision?.action === 'approve' ? `Approve proposal v${decision?.approval.scheduleVersion ?? ''}` : `Reject proposal v${decision?.approval.scheduleVersion ?? ''}`}
        onClose={() => setDecision(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDecision(null)}>
              Cancel
            </Button>
            <Button variant={decision?.action === 'approve' ? 'primary' : 'danger'} onClick={submitDecision} loading={busy} disabled={decision?.action === 'reject' && reason.trim().length < 5}>
              {decision?.action === 'approve' ? 'Approve and commit' : 'Reject proposal'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {decision?.action === 'approve' ? (
            <Alert tone="warn" title="This replaces the operational schedule">
              Approval commits this schedule version and supersedes the current one. The previous version stays available for comparison.
            </Alert>
          ) : (
            <Alert tone="danger" title="Rejection requires a reason">
              The reason is stored with the approval decision and shown in the audit trail.
            </Alert>
          )}
          <Field label={decision?.action === 'approve' ? 'Approval note (optional)' : 'Rejection reason'} htmlFor="reason">
            <Textarea id="reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        </div>
      </Modal>
    </div>
  )
}
