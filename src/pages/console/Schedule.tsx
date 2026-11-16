import { useMemo, useState } from 'react'
import { Link } from 'react-router'

import { AssignmentTimeline } from '../../components/Timeline'
import {
  Alert,
  Badge,
  Button,
  ErrorState,
  Field,
  Loading,
  Modal,
  PageHeader,
  Section,
  Select,
  StateBadge,
  TableWrap,
  Tabs,
  useToast,
} from '../../components/ui'
import type { ScheduleResponse, TimelineRow, VersionRow } from '../../lib/dto'
import { ApiError, post } from '../../lib/api'
import { useAuth, useQuery } from '../../lib/session'
import { formatDateTime, formatDuration, formatTime, relativeTime } from '../../shared/format'

type Tab = 'register' | 'versions'

export default function SchedulePage() {
  const { can } = useAuth()
  const toast = useToast()
  const { data, error, loading, reload } = useQuery<ScheduleResponse>('/schedule')
  const versions = useQuery<{ items: VersionRow[] }>('/schedule/versions')
  const [tab, setTab] = useState<Tab>('register')
  const [draft, setDraft] = useState<{ id: string; version: number } | null>(null)
  const [assignOpen, setAssignOpen] = useState(false)
  const [form, setForm] = useState({ taskId: '', aircraftId: '', crewId: '', start: '' })
  const [formError, setFormError] = useState('')
  const [violations, setViolations] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [compareId, setCompareId] = useState('')
  const compare = useQuery<ScheduleResponse>(compareId ? `/schedule/${compareId}` : null, [compareId])

  const canWrite = can('schedule:write')
  const canApprove = can('schedule:approve')

  const timelineRows = useMemo<TimelineRow[]>(() => {
    if (!data) return []
    const byAircraft = new Map<string, TimelineRow>()
    for (const resource of data.resources?.aircraft ?? []) {
      byAircraft.set(resource.id, { id: resource.id, label: resource.label.split(' · ')[0], status: resource.status, bars: [] })
    }
    for (const assignment of data.assignments) {
      const key = assignment.aircraftId
      const row = byAircraft.get(key) ?? { id: key, label: assignment.aircraft.split(' · ')[0], status: 'serviceable', bars: [] }
      row.bars.push({ id: assignment.id, label: assignment.taskCode, start: assignment.start, end: assignment.end })
      byAircraft.set(key, row)
    }
    return [...byAircraft.values()].filter((row) => row.bars.length || row.status !== 'unserviceable')
  }, [data])

  const timelineWindow = useMemo(() => {
    const starts = data?.assignments.map((a) => Date.parse(a.start)) ?? []
    const ends = data?.assignments.map((a) => Date.parse(a.end)) ?? []
    const from = starts.length ? Math.min(...starts) : Date.now()
    const to = ends.length ? Math.max(...ends) : Date.now() + 24 * 3600_000
    return { from: new Date(from - 3600_000).toISOString(), to: new Date(to + 3600_000).toISOString() }
  }, [data])

  const startManual = async () => {
    setBusy(true)
    try {
      const created = await post<{ id: string; version: number }>('/schedule/draft', { notes: 'Manual assignment draft' })
      setDraft(created)
      setAssignOpen(true)
      versions.reload()
    } catch (caught) {
      toast.push(caught instanceof ApiError ? caught.message : 'Could not create a draft', 'danger')
    } finally {
      setBusy(false)
    }
  }

  const submitAssignment = async () => {
    if (!draft) return
    setBusy(true)
    setFormError('')
    setViolations([])
    try {
      await post(`/schedule/${draft.id}/assign`, {
        taskId: form.taskId,
        aircraftId: form.aircraftId,
        crewId: form.crewId,
        start: form.start ? new Date(`${form.start}Z`).toISOString() : '',
      })
      toast.push('Assignment added to draft')
      setAssignOpen(false)
      setForm({ taskId: '', aircraftId: '', crewId: '', start: '' })
      reload()
    } catch (caught) {
      if (caught instanceof ApiError) {
        setFormError(caught.message)
        setViolations((caught.violations ?? []).map((v) => v.message))
      } else {
        setFormError('Assignment failed.')
      }
    } finally {
      setBusy(false)
    }
  }

  const commitDraft = async () => {
    if (!draft) return
    setBusy(true)
    try {
      await post(`/schedule/${draft.id}/commit`, { reason: 'Manual assignment approved' })
      toast.push(`Schedule v${draft.version} committed`)
      setDraft(null)
      reload()
      versions.reload()
    } catch (caught) {
      toast.push(caught instanceof ApiError ? caught.message : 'Commit failed', 'danger')
    } finally {
      setBusy(false)
    }
  }

  const discardDraft = async () => {
    if (!draft) return
    setBusy(true)
    try {
      await post(`/schedule/${draft.id}/discard`)
      toast.push(`Draft v${draft.version} discarded`)
      setDraft(null)
      versions.reload()
    } catch (caught) {
      toast.push(caught instanceof ApiError ? caught.message : 'Discard failed', 'danger')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <Loading rows={8} label="Loading schedule" />
  if (error) return <ErrorState message={error instanceof Error ? error.message : 'Could not load the schedule.'} onRetry={reload} />
  if (!data) return null

  const schedule = data.schedule

  return (
    <div className="space-y-4">
      <PageHeader
        title="Schedule"
        meta={
          <>
            <span>Operational data · UTC</span>
            {schedule ? (
              <>
                <span className="text-ink-3/50">·</span>
                <span className="tnum">v{schedule.version}</span>
                <StateBadge value={schedule.status} />
                <span className="text-ink-3/50">·</span>
                <span>{schedule.source === 'optimization' ? 'Generated by optimization' : 'Manual'}</span>
                {schedule.decidedAt ? <span className="tnum">· committed {relativeTime(schedule.decidedAt)}</span> : null}
              </>
            ) : null}
          </>
        }
        actions={
          canWrite ? (
            <Button variant="primary" size="sm" onClick={startManual} loading={busy && !draft}>
              Assign manually
            </Button>
          ) : null
        }
      />

      {draft ? (
        <Alert tone="warn" title={`Draft v${draft.version} is not operational`}>
          <div className="flex flex-wrap items-center gap-2">
            <span>Assignments in this draft do not affect operations until it is committed.</span>
            <Button size="sm" variant="primary" disabled={!canApprove} onClick={commitDraft} loading={busy} title={canApprove ? '' : 'Requires schedule approval permission'}>
              Commit schedule
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAssignOpen(true)}>
              Add assignment
            </Button>
            <Button size="sm" variant="ghost" onClick={discardDraft}>
              Discard draft
            </Button>
          </div>
        </Alert>
      ) : null}

      {data.conflicts.length ? (
        <Alert tone="danger" title={`${data.conflicts.length} schedule conflict${data.conflicts.length === 1 ? '' : 's'}`}>
          <ul className="mt-1 space-y-0.5">
            {data.conflicts.slice(0, 6).map((conflict, index) => (
              <li key={`${conflict.assignmentId}-${index}`} className="tnum text-[12.5px]">
                <span className="mono">{conflict.taskCode}</span> — {conflict.message}
              </li>
            ))}
          </ul>
        </Alert>
      ) : null}

      <Section title="Assignment timeline">
        <div className="p-4">
          <AssignmentTimeline from={timelineWindow.from} to={timelineWindow.to} rows={timelineRows} emptyDetail="No committed assignments." />
        </div>
      </Section>

      <Section>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
          <Tabs
            value={tab}
            onChange={setTab}
            options={[
              { value: 'register', label: 'Assignments', count: data.assignments.length },
              { value: 'versions', label: 'Versions', count: versions.data?.items.length },
            ]}
          />
          {tab === 'versions' ? (
            <Select value={compareId} onChange={(e) => setCompareId(e.target.value)} aria-label="Compare version" className="w-auto min-w-[190px]">
              <option value="">Compare with…</option>
              {(versions.data?.items ?? []).map((version) => (
                <option key={version.id} value={version.id}>
                  v{version.version} · {version.status}
                </option>
              ))}
            </Select>
          ) : null}
        </div>

        {tab === 'register' ? (
          data.assignments.length ? (
            <TableWrap label="Schedule assignments">
              <table className="data">
                <thead>
                  <tr>
                    <th className="w-[140px]">Task</th>
                    <th className="min-w-[200px]">Assignment</th>
                    <th className="w-[130px]">Aircraft</th>
                    <th className="w-[170px]">Crew</th>
                    <th className="w-[150px]">Start (UTC)</th>
                    <th className="w-[110px]">End (UTC)</th>
                  </tr>
                </thead>
                <tbody>
                  {data.assignments.map((assignment) => (
                    <tr key={assignment.id}>
                      <td>
                        <Link to={`/console/tasks/${assignment.taskId}`} className="mono text-accent hover:underline">
                          {assignment.taskCode}
                        </Link>
                      </td>
                      <td>
                        <div className="max-w-[320px] truncate">{assignment.taskTitle}</div>
                      </td>
                      <td className="mono text-[12px]">{assignment.aircraft.split(' · ')[0]}</td>
                      <td className="text-[12px]">{assignment.crew ?? <span className="text-ink-3">Unassigned</span>}</td>
                      <td className="tnum text-[12px]">{formatDateTime(assignment.start)}</td>
                      <td className="tnum text-[12px]">{formatTime(assignment.end)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          ) : (
            <p className="px-4 py-6 text-center text-[12.5px] text-ink-3">No assignments in the committed schedule.</p>
          )
        ) : (
          <div className="divide-y divide-line">
            {(versions.data?.items ?? []).map((version) => (
              <div key={version.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="tnum text-[13px] font-semibold">v{version.version}</span>
                  <StateBadge value={version.status} />
                  <Badge tone="neutral">{version.assignmentCount} assignments</Badge>
                  <span className="text-[11.5px] text-ink-3">{version.source === 'optimization' ? 'Optimization' : 'Manual'}</span>
                  <span className="tnum text-[11.5px] text-ink-3">{formatDateTime(version.createdAt)}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {version.status === 'draft' && canApprove ? (
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={async () => {
                        setBusy(true)
                        try {
                          await post(`/schedule/${version.id}/commit`, { reason: 'Approved from version history' })
                          toast.push(`Schedule v${version.version} committed`)
                          reload()
                          versions.reload()
                        } catch (caught) {
                          toast.push(caught instanceof ApiError ? caught.message : 'Commit failed', 'danger')
                        } finally {
                          setBusy(false)
                        }
                      }}
                    >
                      Commit
                    </Button>
                  ) : null}
                  {version.status === 'draft' && canWrite ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        try {
                          await post(`/schedule/${version.id}/discard`)
                          toast.push(`Draft v${version.version} discarded`)
                          versions.reload()
                        } catch (caught) {
                          toast.push(caught instanceof ApiError ? caught.message : 'Discard failed', 'danger')
                        }
                      }}
                    >
                      Discard
                    </Button>
                  ) : null}
                  <Button size="sm" variant="secondary" onClick={() => setCompareId(version.id)}>
                    Inspect
                  </Button>
                </div>
              </div>
            ))}
            {compareId && compare.data ? (
              <div className="bg-surface-2/40 px-4 py-3">
                <div className="mb-2 flex flex-wrap items-center gap-2 text-[12px]">
                  <span className="font-semibold">Comparison</span>
                  <span className="text-ink-3">
                    committed {data.assignments.length} assignments vs v{compare.data.schedule?.version ?? '?'} {compare.data.assignments.length} assignments
                  </span>
                </div>
                <ul className="space-y-1 text-[12px]">
                  {compare.data.assignments
                    .filter((candidate) => !data.assignments.some((current) => current.taskId === candidate.taskId))
                    .map((candidate) => (
                      <li key={candidate.id} className="text-ok">
                        + {candidate.taskCode} · {candidate.aircraft.split(' · ')[0]} · {formatDateTime(candidate.start)}
                      </li>
                    ))}
                  {data.assignments
                    .filter((candidate) => !compare.data!.assignments.some((other) => other.taskId === candidate.taskId))
                    .map((candidate) => (
                      <li key={candidate.id} className="text-danger">
                        − {candidate.taskCode} · {candidate.aircraft.split(' · ')[0]}
                      </li>
                    ))}
                  {compare.data.assignments.every((candidate) => data.assignments.some((current) => current.taskId === candidate.taskId)) &&
                  data.assignments.every((candidate) => compare.data!.assignments.some((other) => other.taskId === candidate.taskId)) ? (
                    <li className="text-ink-3">No task-level differences.</li>
                  ) : null}
                </ul>
              </div>
            ) : null}
          </div>
        )}
      </Section>

      <Section title={`Unassigned open tasks · ${data.unassigned.length}`}>
        {data.unassigned.length ? (
          <TableWrap label="Unassigned tasks">
            <table className="data">
              <thead>
                <tr>
                  <th className="w-[110px]">Task</th>
                  <th className="min-w-[220px]">Title</th>
                  <th className="w-[120px]">Priority</th>
                  <th className="w-[130px]">Window start</th>
                  <th className="min-w-[220px]">Reason</th>
                </tr>
              </thead>
              <tbody>
                {data.unassigned.map((task) => (
                  <tr key={task.id}>
                    <td>
                      <Link to={`/console/tasks/${task.id}`} className="mono text-accent hover:underline">
                        {task.code}
                      </Link>
                    </td>
                    <td className="max-w-[320px] truncate">{task.title}</td>
                    <td>
                      <StateBadge value={task.priority} />
                    </td>
                    <td className="tnum text-[12px]">{formatDateTime(task.windowStart)}</td>
                    <td className="text-[12px] text-ink-2">{task.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        ) : (
          <p className="px-4 py-6 text-center text-[12.5px] text-ink-3">Every open task has an assignment.</p>
        )}
      </Section>

      <Modal
        open={assignOpen}
        title={draft ? `Assign a task · draft v${draft.version}` : 'Assign a task'}
        onClose={() => setAssignOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setAssignOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submitAssignment} loading={busy} disabled={!form.taskId || !form.aircraftId || !form.crewId || !form.start}>
              Add assignment
            </Button>
          </>
        }
      >
        <div className="space-y-3.5">
          {formError ? (
            <Alert tone="danger" title={formError}>
              {violations.length ? (
                <ul className="mt-1 list-inside list-disc">
                  {violations.map((violation) => (
                    <li key={violation}>{violation}</li>
                  ))}
                </ul>
              ) : null}
            </Alert>
          ) : null}
          <Field label="Task" htmlFor="assign-task">
            <Select
              id="assign-task"
              value={form.taskId}
              onChange={(e) => {
                const task = data.tasks?.find((t) => t.id === e.target.value)
                setForm((current) => ({
                  ...current,
                  taskId: e.target.value,
                  start: task ? new Date(task.windowStart).toISOString().slice(0, 16) : current.start,
                }))
              }}
            >
              <option value="">Select an unassigned task</option>
              {data.unassigned.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.code} · {task.title}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Aircraft" htmlFor="assign-aircraft">
              <Select id="assign-aircraft" value={form.aircraftId} onChange={(e) => setForm((c) => ({ ...c, aircraftId: e.target.value }))}>
                <option value="">Select aircraft</option>
                {(data.resources?.aircraft ?? []).map((resource) => (
                  <option key={resource.id} value={resource.id}>
                    {resource.label} · {resource.status}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Crew" htmlFor="assign-crew">
              <Select id="assign-crew" value={form.crewId} onChange={(e) => setForm((c) => ({ ...c, crewId: e.target.value }))}>
                <option value="">Select crew</option>
                {(data.resources?.crew ?? []).map((resource) => (
                  <option key={resource.id} value={resource.id}>
                    {resource.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Start (UTC)" htmlFor="assign-start" hint="Duration comes from the task. Every constraint is re-checked on submit.">
            <input
              id="assign-start"
              type="datetime-local"
              className="input"
              value={form.start}
              onChange={(e) => setForm((c) => ({ ...c, start: e.target.value }))}
            />
          </Field>
          {form.taskId ? (
            <p className="tnum text-[11.5px] text-ink-3">
              Duration {formatDuration(data.tasks?.find((t) => t.id === form.taskId)?.durationMinutes ?? 0)} · window{' '}
              {(() => {
                const task = data.tasks?.find((t) => t.id === form.taskId)
                return task ? `${formatDateTime(task.windowStart)} → ${formatTime(task.windowEnd)}` : ''
              })()}
            </p>
          ) : null}
        </div>
      </Modal>
    </div>
  )
}
