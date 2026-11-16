import { useEffect, useState } from 'react'
import { Link } from 'react-router'

import { TaskFormModal } from '../../components/TaskForm'
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Loading,
  PageHeader,
  Pagination,
  SearchInput,
  Section,
  Select,
  StateBadge,
  TableWrap,
  useToast,
} from '../../components/ui'
import type { ListResponse, MetaResponse, TaskRow } from '../../lib/dto'
import { ApiError, post } from '../../lib/api'
import { useAuth, useQuery } from '../../lib/session'
import { formatDuration, formatKg, formatTime } from '../../shared/format'
import type { OperationalTask } from '../../shared/types'

export default function Tasks() {
  const { can } = useAuth()
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [state, setState] = useState('')
  const [priority, setPriority] = useState('')
  const [sort, setSort] = useState('window:asc')
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<OperationalTask | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [cancelling, setCancelling] = useState<TaskRow | null>(null)
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebounced(search)
      setPage(1)
    }, 250)
    return () => window.clearTimeout(timer)
  }, [search])

  const query = new URLSearchParams({ page: String(page), pageSize: '25', sort })
  if (debounced) query.set('search', debounced)
  if (state) query.set('state', state)
  if (priority) query.set('priority', priority)

  const { data, error, loading, reload } = useQuery<ListResponse<TaskRow>>(`/tasks?${query.toString()}`, [page, debounced, state, priority, sort])
  const meta = useQuery<MetaResponse>('/meta')
  const allTasks = useQuery<ListResponse<TaskRow>>('/tasks?pageSize=100&sort=code:asc')

  const canWrite = can('tasks:write')

  const openCreate = () => {
    setEditing(null)
    setFormOpen(true)
  }

  const confirmCancel = async () => {
    if (!cancelling) return
    setBusy(true)
    try {
      await post(`/tasks/${cancelling.id}/state`, { state: 'cancelled' })
      toast.push(`${cancelling.code} cancelled`)
      setCancelling(null)
      reload()
    } catch (caught) {
      toast.push(caught instanceof ApiError ? caught.message : 'Could not cancel the task', 'danger')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Task register"
        meta={
          <>
            <span>Operational data · UTC</span>
            <span className="text-ink-3/50">·</span>
            <span className="tnum">{data?.total ?? 0} tasks</span>
          </>
        }
        actions={
          canWrite ? (
            <Button variant="primary" onClick={openCreate}>
              New task
            </Button>
          ) : null
        }
      />

      <Section>
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5">
          <SearchInput value={search} onChange={setSearch} placeholder="Search code, task, client or site" />
          <Select value={state} onChange={(e) => { setState(e.target.value); setPage(1) }} aria-label="Filter by state" className="w-auto min-w-[140px]">
            <option value="">All states</option>
            {['draft', 'pending', 'scheduled', 'in_progress', 'completed', 'cancelled', 'blocked'].map((value) => (
              <option key={value} value={value}>
                {value.replace(/_/g, ' ')}
              </option>
            ))}
          </Select>
          <Select value={priority} onChange={(e) => { setPriority(e.target.value); setPage(1) }} aria-label="Filter by priority" className="w-auto min-w-[130px]">
            <option value="">All priorities</option>
            {['critical', 'high', 'normal', 'low'].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
          <Select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort" className="w-auto min-w-[150px]">
            <option value="window:asc">Window ascending</option>
            <option value="window:desc">Window descending</option>
            <option value="priority:asc">Priority</option>
            <option value="code:asc">Task ID</option>
            <option value="duration:desc">Duration</option>
          </Select>
          {(debounced || state || priority) ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch('')
                setState('')
                setPriority('')
                setPage(1)
              }}
            >
              Clear filters
            </Button>
          ) : null}
        </div>

        {loading ? (
          <Loading rows={6} label="Loading tasks" />
        ) : error ? (
          <ErrorState message={error instanceof Error ? error.message : 'Could not load tasks.'} onRetry={reload} />
        ) : !data?.items.length ? (
          <EmptyState
            title="No tasks match these filters"
            detail="Adjust the search or filters, or create a new operational task."
            action={canWrite ? <Button onClick={openCreate}>New task</Button> : undefined}
          />
        ) : (
          <>
            <div className="hidden md:block">
              <TableWrap label="Task register">
                <table className="data">
                  <thead>
                    <tr>
                      <th className="w-[104px]">ID</th>
                      <th className="min-w-[280px]">Task</th>
                      <th className="w-[92px]">Priority</th>
                      <th className="w-[176px]">Window (UTC)</th>
                      <th className="w-[86px]">Duration</th>
                      <th className="w-[110px]">Dependencies</th>
                      <th className="w-[210px]">Assignment</th>
                      <th className="w-[104px]">State</th>
                      <th className="w-[132px] text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((task) => (
                      <tr key={task.id}>
                        <td>
                          <Link to={`/console/tasks/${task.id}`} className="mono whitespace-nowrap text-accent hover:underline">
                            {task.code}
                          </Link>
                        </td>
                        <td>
                          <div className="max-w-[380px] truncate font-medium">{task.title}</div>
                          <div className="mt-0.5 truncate text-[11.5px] text-ink-3">
                            {task.site} · {task.client}
                            {task.payloadKg ? ` · ${formatKg(task.payloadKg)}` : ''}
                          </div>
                        </td>
                        <td>
                          <StateBadge value={task.priority} />
                        </td>
                        <td className="tnum text-[12px] whitespace-nowrap">
                          {formatTime(task.windowStart)} → {formatTime(task.windowEnd)}
                          <div className="text-[11px] text-ink-3">{new Date(task.windowStart).toISOString().slice(0, 10)}</div>
                        </td>
                        <td className="tnum text-[12.5px]">{formatDuration(task.durationMinutes)}</td>
                        <td className="tnum text-[12.5px] text-ink-2">{task.dependencies.length || '—'}</td>
                        <td>
                          {task.assignment ? (
                            <div className="text-[12px]">
                              <div className="mono">{task.assignment.aircraft}</div>
                              <div className="tnum truncate text-[11px] text-ink-3">
                                {formatTime(task.assignment.start)}–{formatTime(task.assignment.end)} · {task.assignment.crew ?? 'no crew'}
                              </div>
                            </div>
                          ) : (
                            <Badge tone="warn">Unassigned</Badge>
                          )}
                        </td>
                        <td>
                          <StateBadge value={task.state} />
                        </td>
                        <td>
                          <div className="flex justify-end gap-1">
                            <Link to={`/console/tasks/${task.id}`} className="btn btn-ghost btn-sm">
                              View
                            </Link>
                            {canWrite && task.state !== 'cancelled' && task.state !== 'completed' ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setEditing(task)
                                  setFormOpen(true)
                                }}
                              >
                                Edit
                              </Button>
                            ) : null}
                            {canWrite && task.state !== 'cancelled' && task.state !== 'completed' ? (
                              <Button variant="ghost" size="sm" onClick={() => setCancelling(task)}>
                                Cancel
                              </Button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            </div>

            <ul className="divide-y divide-line md:hidden">
              {data.items.map((task) => (
                <li key={task.id} className="px-3 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link to={`/console/tasks/${task.id}`} className="mono text-[12px] text-accent">
                        {task.code}
                      </Link>
                      <div className="mt-0.5 text-[13px] font-medium">{task.title}</div>
                      <div className="mt-0.5 text-[11.5px] text-ink-3">
                        {task.site} · {task.client}
                      </div>
                    </div>
                    <StateBadge value={task.state} />
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-[11.5px]">
                    <div>
                      <div className="text-ink-3">Window (UTC)</div>
                      <div className="tnum">
                        {formatTime(task.windowStart)}–{formatTime(task.windowEnd)}
                      </div>
                    </div>
                    <div>
                      <div className="text-ink-3">Duration</div>
                      <div className="tnum">{formatDuration(task.durationMinutes)}</div>
                    </div>
                    <div>
                      <div className="text-ink-3">Assignment</div>
                      <div className="mono truncate">{task.assignment ? task.assignment.aircraft : 'Unassigned'}</div>
                    </div>
                    <div>
                      <div className="text-ink-3">Priority</div>
                      <StateBadge value={task.priority} />
                    </div>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <Link to={`/console/tasks/${task.id}`} className="btn btn-secondary btn-sm">
                      View task
                    </Link>
                    {canWrite && task.state !== 'cancelled' && task.state !== 'completed' ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditing(task)
                          setFormOpen(true)
                        }}
                      >
                        Edit
                      </Button>
                    ) : null}
                    {canWrite && task.state !== 'cancelled' && task.state !== 'completed' ? (
                      <Button variant="ghost" size="sm" onClick={() => setCancelling(task)}>
                        Cancel
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>

            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
          </>
        )}
      </Section>

      <p className="text-[11.5px] text-ink-3">
        Task changes are validated server-side. Cancelling a task blocks dependents and removes it from draft and proposed schedules.
      </p>

      <TaskFormModal
        open={formOpen}
        task={editing}
        meta={meta.data}
        tasks={allTasks.data?.items ?? []}
        onClose={() => setFormOpen(false)}
        onSaved={reload}
      />

      <ConfirmDialog
        open={Boolean(cancelling)}
        title={`Cancel ${cancelling?.code ?? 'task'}?`}
        message={
          <>
            The task will move to <strong>cancelled</strong>, its draft assignments are removed and dependent tasks become blocked. This is recorded in the audit trail.
          </>
        }
        confirmLabel="Cancel task"
        loading={busy}
        onCancel={() => setCancelling(null)}
        onConfirm={confirmCancel}
      />
    </div>
  )
}
