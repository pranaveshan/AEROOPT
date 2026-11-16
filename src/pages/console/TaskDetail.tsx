import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'

import { TaskFormModal } from '../../components/TaskForm'
import {
  Alert,
  Badge,
  Button,
  ConfirmDialog,
  ErrorState,
  KeyValue,
  Loading,
  PageHeader,
  Section,
  StateBadge,
  useToast,
} from '../../components/ui'
import type { ListResponse, MetaResponse, TaskDetailResponse, TaskRow } from '../../lib/dto'
import { ApiError, post } from '../../lib/api'
import { useAuth, useQuery } from '../../lib/session'
import { formatDateTime, formatDuration, formatKg, formatTime, relativeTime } from '../../shared/format'
import type { OperationalTask } from '../../shared/types'

export default function TaskDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { can } = useAuth()
  const toast = useToast()
  const { data, error, loading, reload } = useQuery<TaskDetailResponse>(`/tasks/${id}`, [id])
  const meta = useQuery<MetaResponse>('/meta')
  const all = useQuery<ListResponse<TaskRow>>('/tasks?pageSize=100&sort=code:asc')
  const [formOpen, setFormOpen] = useState(false)
  const [confirm, setConfirm] = useState<{ state: string; label: string } | null>(null)
  const [busy, setBusy] = useState(false)

  if (loading) return <Loading rows={6} label="Loading task" />
  if (error) return <ErrorState message={error instanceof Error ? error.message : 'Could not load the task.'} onRetry={reload} />
  if (!data) return null

  const { task } = data
  const canWrite = can('tasks:write')

  const transition = async () => {
    if (!confirm) return
    setBusy(true)
    try {
      await post(`/tasks/${id}/state`, { state: confirm.state })
      toast.push(`Task moved to ${confirm.state.replace(/_/g, ' ')}`)
      setConfirm(null)
      reload()
    } catch (caught) {
      toast.push(caught instanceof ApiError ? caught.message : 'Transition failed', 'danger')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <nav className="flex items-center gap-1.5 text-[11.5px] text-ink-3">
        <Link to="/console/tasks" className="hover:text-ink-2">
          Tasks
        </Link>
        <span>/</span>
        <span className="mono">{task.code}</span>
      </nav>

      <PageHeader
        title={task.title}
        meta={
          <>
            <span className="mono">{task.code}</span>
            <span className="text-ink-3/50">·</span>
            <StateBadge value={task.state} />
            <StateBadge value={task.priority} />
            <span className="text-ink-3/50">·</span>
            <span>
              {task.site} · {task.client}
            </span>
          </>
        }
        actions={
          canWrite ? (
            <>
              {data.allowedTransitions.slice(0, 2).map((next) => (
                <Button
                  key={next}
                  size="sm"
                  onClick={() => setConfirm({ state: next, label: next.replace(/_/g, ' ') })}
                  variant={next === 'cancelled' ? 'danger' : 'secondary'}
                >
                  {next === 'cancelled' ? 'Cancel task' : `Mark ${next.replace(/_/g, ' ')}`}
                </Button>
              ))}
              <Button size="sm" variant="primary" onClick={() => setFormOpen(true)}>
                Edit task
              </Button>
            </>
          ) : null
        }
      />

      {task.description ? (
        <p className="max-w-[860px] text-[13px] leading-relaxed text-ink-2">{task.description}</p>
      ) : null}

      {data.assignment ? (
        <Alert tone="default" title="Assigned in the committed schedule">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px]">
            <span className="mono">{data.assignment.aircraft}</span>
            <span className="text-ink-3">{data.assignment.aircraftType}</span>
            <span className="tnum">
              {formatDateTime(data.assignment.start)} → {formatTime(data.assignment.end)} UTC
            </span>
            <span>{data.assignment.crew ?? 'No crew assigned'}</span>
            <Link to="/console/schedule" className="text-accent hover:underline">
              Open schedule
            </Link>
          </div>
        </Alert>
      ) : (
        <Alert tone="warn" title="Not assigned">
          This task has no aircraft or crew in the committed schedule. Run the decision engine or assign it manually from the schedule page.
        </Alert>
      )}

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Section title="Task specification">
          <div className="p-4">
            <KeyValue
              items={[
                { label: 'Window start (UTC)', value: <span className="tnum">{formatDateTime(task.windowStart)}</span> },
                { label: 'Window end (UTC)', value: <span className="tnum">{formatDateTime(task.windowEnd)}</span> },
                { label: 'Duration', value: <span className="tnum">{formatDuration(task.durationMinutes)}</span> },
                { label: 'Payload', value: <span className="tnum">{formatKg(task.payloadKg)}</span> },
                { label: 'Site', value: task.site },
                { label: 'Client', value: task.client },
                {
                  label: 'Required capabilities',
                  value: task.requiredCapabilities.length ? (
                    <span className="flex flex-wrap gap-1">{task.requiredCapabilities.map((cap) => <Badge key={cap}>{cap}</Badge>)}</span>
                  ) : (
                    'None'
                  ),
                },
                {
                  label: 'Required qualifications',
                  value: task.requiredQualifications.length ? (
                    <span className="flex flex-wrap gap-1">{task.requiredQualifications.map((qual) => <Badge key={qual}>{qual}</Badge>)}</span>
                  ) : (
                    'None'
                  ),
                },
                { label: 'Created', value: <span className="tnum">{formatDateTime(task.createdAt)}</span> },
                { label: 'Last updated', value: <span className="tnum">{formatDateTime(task.updatedAt)}</span> },
              ]}
            />
          </div>
        </Section>

        <div className="space-y-4">
          <Section title="Dependencies">
            {data.dependencies.length ? (
              <ul className="divide-y divide-line">
                {data.dependencies.map((dep) => (
                  <li key={dep.id} className="flex items-center justify-between gap-2 px-4 py-2">
                    <Link to={`/console/tasks/${dep.id}`} className="min-w-0">
                      <div className="mono text-[11.5px] text-accent">{dep.code}</div>
                      <div className="truncate text-[12.5px]">{dep.title}</div>
                    </Link>
                    <StateBadge value={dep.state} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-3 text-[12.5px] text-ink-3">No upstream dependencies.</p>
            )}
            {data.dependents.length ? (
              <div className="border-t border-line px-4 py-2.5">
                <div className="mb-1.5 text-[11px] tracking-wide text-ink-3 uppercase">Blocks</div>
                <div className="flex flex-wrap gap-1.5">
                  {data.dependents.map((dependent) => (
                    <Link key={dependent.id} to={`/console/tasks/${dependent.id}`} className="badge badge-neutral hover:border-line-strong">
                      {dependent.code}
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}
          </Section>

          <Section title="History">
            {data.history.length ? (
              <ul className="divide-y divide-line">
                {data.history.map((event) => (
                  <li key={event.id} className="px-4 py-2.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[12.5px] font-medium">{event.summary}</span>
                      <span className="tnum shrink-0 text-[11px] text-ink-3">{relativeTime(event.createdAt)}</span>
                    </div>
                    <div className="text-[11px] text-ink-3">
                      {event.actorName} · {event.action}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-3 text-[12.5px] text-ink-3">No recorded changes.</p>
            )}
          </Section>
        </div>
      </div>

      <TaskFormModal
        open={formOpen}
        task={task as OperationalTask}
        meta={meta.data}
        tasks={all.data?.items ?? []}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          reload()
          navigate(`/console/tasks/${id}`)
        }}
      />

      <ConfirmDialog
        open={Boolean(confirm)}
        title={`Move ${task.code} to ${confirm?.label ?? ''}?`}
        message={
          confirm?.state === 'cancelled'
            ? 'Cancelling blocks dependent tasks and removes draft assignments. The action is recorded in the audit trail.'
            : 'The state transition is validated against the allowed workflow and recorded in the audit trail.'
        }
        confirmLabel={`Mark ${confirm?.label ?? ''}`}
        tone={confirm?.state === 'cancelled' ? 'danger' : 'primary'}
        loading={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={transition}
      />
    </div>
  )
}
