import { useState } from 'react'
import { Link } from 'react-router'

import { MaintenanceFormModal } from '../../components/MaintenanceForm'
import {
  Alert,
  Button,
  EmptyState,
  ErrorState,
  Loading,
  PageHeader,
  Section,
  Select,
  StateBadge,
  TableWrap,
  Tabs,
  useToast,
} from '../../components/ui'
import type { MaintenanceResponse } from '../../lib/dto'
import { ApiError, patch, post } from '../../lib/api'
import { useAuth, useQuery } from '../../lib/session'
import { formatDateTime, relativeTime } from '../../shared/format'

type Filter = 'open' | 'completed' | 'all'

export default function Maintenance() {
  const { can } = useAuth()
  const toast = useToast()
  const [filter, setFilter] = useState<Filter>('open')
  const [type, setType] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [busyId, setBusyId] = useState('')

  const query = filter === 'all' ? '' : `?status=${filter === 'open' ? '' : 'completed'}`
  const { data, error, loading, reload } = useQuery<MaintenanceResponse>(`/maintenance${query}`, [filter])
  const canWrite = can('maintenance:write')

  const act = async (id: string, action: 'start' | 'complete' | 'cancel') => {
    setBusyId(id)
    try {
      if (action === 'complete') await post(`/maintenance/${id}/complete`)
      else await patch(`/maintenance/${id}`, { status: action === 'start' ? 'in_progress' : 'cancelled' })
      toast.push(action === 'complete' ? 'Maintenance completed' : action === 'start' ? 'Maintenance started' : 'Maintenance cancelled')
      reload()
    } catch (caught) {
      toast.push(caught instanceof ApiError ? caught.message : 'Update failed', 'danger')
    } finally {
      setBusyId('')
    }
  }

  const items = (data?.items ?? []).filter((record) => {
    if (filter === 'open' && (record.status === 'completed' || record.status === 'cancelled')) return false
    if (filter === 'completed' && record.status !== 'completed') return false
    if (type && record.type !== type) return false
    return true
  })

  const active = items.filter((record) => record.status !== 'completed' && record.status !== 'cancelled')

  return (
    <div className="space-y-4">
      <PageHeader
        title="Maintenance"
        meta={
          <>
            <span>Operational data · UTC</span>
            <span className="text-ink-3/50">·</span>
            <span className="tnum">{active.length} open record{active.length === 1 ? '' : 's'}</span>
          </>
        }
        actions={
          canWrite ? (
            <Button variant="primary" onClick={() => setFormOpen(true)}>
              Raise record
            </Button>
          ) : null
        }
      />

      <Alert tone="default" title="Effect on scheduling">
        Planned and in-progress records block their aircraft for the entire window. Completed or cancelled records release the airframe once no other open record remains.
      </Alert>

      <Section>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
          <Tabs
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'open', label: 'Open' },
              { value: 'completed', label: 'Completed' },
              { value: 'all', label: 'All' },
            ]}
          />
          <Select value={type} onChange={(e) => setType(e.target.value)} aria-label="Filter by type" className="w-auto min-w-[150px]">
            <option value="">All types</option>
            {['scheduled', 'unscheduled', 'inspection'].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
        </div>

        {loading ? (
          <Loading rows={5} label="Loading maintenance records" />
        ) : error ? (
          <ErrorState message={error instanceof Error ? error.message : 'Could not load maintenance records.'} onRetry={reload} />
        ) : !items.length ? (
          <EmptyState title="No maintenance records" detail="Raise a record to schedule maintenance and restrict the affected aircraft." />
        ) : (
          <>
            <div className="hidden md:block">
              <TableWrap label="Maintenance register">
                <table className="data">
                  <thead>
                    <tr>
                      <th className="w-[150px]">Aircraft</th>
                      <th className="w-[110px]">Type</th>
                      <th className="w-[110px]">Status</th>
                      <th className="w-[190px]">Window (UTC)</th>
                      <th className="min-w-[240px]">Work / restriction</th>
                      <th className="w-[140px] text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((record) => (
                      <tr key={record.id}>
                        <td className="mono text-[12px]">{record.aircraftLabel.split(' · ')[0]}</td>
                        <td className="text-[12.5px]">{record.type}</td>
                        <td>
                          <StateBadge value={record.status} />
                        </td>
                        <td className="tnum text-[12px]">
                          {formatDateTime(record.windowStart)}
                          <div className="text-ink-3">→ {formatDateTime(record.windowEnd)}</div>
                        </td>
                        <td>
                          <div className="max-w-[340px] text-[12.5px]">{record.description}</div>
                          {record.restriction ? <div className="text-[11px] text-warn">{record.restriction}</div> : null}
                          {record.completedAt ? <div className="text-[11px] text-ink-3">Completed {relativeTime(record.completedAt)}</div> : null}
                        </td>
                        <td>
                          <div className="flex flex-wrap justify-end gap-1">
                            {canWrite && record.status === 'planned' ? (
                              <Button size="sm" variant="secondary" loading={busyId === record.id} onClick={() => act(record.id, 'start')}>
                                Start
                              </Button>
                            ) : null}
                            {canWrite && (record.status === 'planned' || record.status === 'in_progress') ? (
                              <>
                                <Button size="sm" variant="primary" loading={busyId === record.id} onClick={() => act(record.id, 'complete')}>
                                  Complete
                                </Button>
                                <Button size="sm" variant="ghost" loading={busyId === record.id} onClick={() => act(record.id, 'cancel')}>
                                  Cancel
                                </Button>
                              </>
                            ) : null}
                            {record.status === 'completed' || record.status === 'cancelled' ? (
                              <span className="text-[11.5px] text-ink-3">Closed</span>
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
              {items.map((record) => (
                <li key={record.id} className="px-3 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="mono text-[12px]">{record.aircraftLabel.split(' · ')[0]}</div>
                      <div className="text-[12.5px]">{record.description}</div>
                      <div className="text-[11px] text-ink-3">{record.type}</div>
                    </div>
                    <StateBadge value={record.status} />
                  </div>
                  <div className="tnum mt-1.5 text-[11.5px] text-ink-3">
                    {formatDateTime(record.windowStart)} → {formatDateTime(record.windowEnd)}
                  </div>
                  {record.restriction ? <div className="mt-1 text-[11.5px] text-warn">{record.restriction}</div> : null}
                  {canWrite && (record.status === 'planned' || record.status === 'in_progress') ? (
                    <div className="mt-2 flex gap-2">
                      {record.status === 'planned' ? (
                        <Button size="sm" variant="secondary" loading={busyId === record.id} onClick={() => act(record.id, 'start')}>
                          Start
                        </Button>
                      ) : null}
                      <Button size="sm" variant="primary" loading={busyId === record.id} onClick={() => act(record.id, 'complete')}>
                        Complete
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => act(record.id, 'cancel')}>
                        Cancel
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        )}
      </Section>

      <p className="text-[11.5px] text-ink-3">
        Aircraft statuses and scheduling constraints update immediately. See <Link to="/console/aircraft" className="text-accent hover:underline">Aircraft</Link> for
        per-airframe state.
      </p>

      <MaintenanceFormModal open={formOpen} aircraft={data?.aircraft ?? []} onClose={() => setFormOpen(false)} onSaved={reload} />
    </div>
  )
}
