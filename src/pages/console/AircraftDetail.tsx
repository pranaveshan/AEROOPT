import { useState } from 'react'
import { Link, useParams } from 'react-router'

import { AircraftFormModal } from '../../components/AircraftForm'
import { AircraftViewer } from '../../components/AircraftViewer'
import {
  Alert,
  Badge,
  Button,
  ErrorState,
  KeyValue,
  Loading,
  PageHeader,
  Section,
  StateBadge,
  TableWrap,
} from '../../components/ui'
import type { AircraftDetailResponse } from '../../lib/dto'
import { useAuth, useQuery } from '../../lib/session'
import { formatDateTime, formatKg, relativeTime } from '../../shared/format'

export default function AircraftDetail() {
  const { id = '' } = useParams()
  const { can } = useAuth()
  const { data, error, loading, reload } = useQuery<AircraftDetailResponse>(`/aircraft/${id}`, [id])
  const [formOpen, setFormOpen] = useState(false)

  if (loading) return <Loading rows={6} label="Loading aircraft" />
  if (error) return <ErrorState message={error instanceof Error ? error.message : 'Could not load the aircraft.'} onRetry={reload} />
  if (!data) return null

  const { aircraft } = data
  const activeRestrictions = data.restrictions.filter((restriction) => Date.parse(restriction.windowEnd) > Date.now())

  return (
    <div className="space-y-4">
      <nav className="flex items-center gap-1.5 text-[11.5px] text-ink-3">
        <Link to="/console/aircraft" className="hover:text-ink-2">
          Aircraft
        </Link>
        <span>/</span>
        <span className="mono">{aircraft.registration}</span>
      </nav>

      <PageHeader
        title={aircraft.registration}
        meta={
          <>
            <span>{aircraft.type}</span>
            <span className="text-ink-3/50">·</span>
            <span>{aircraft.category}</span>
            <StateBadge value={aircraft.status} />
            <span className="text-ink-3/50">·</span>
            <span className="mono">{aircraft.base}</span>
          </>
        }
        actions={
          can('aircraft:write') ? (
            <Button size="sm" variant="primary" onClick={() => setFormOpen(true)}>
              Edit aircraft
            </Button>
          ) : null
        }
      />

      {activeRestrictions.length ? (
        <Alert tone="warn" title={`${activeRestrictions.length} active restriction${activeRestrictions.length === 1 ? '' : 's'}`}>
          <ul className="space-y-1">
            {activeRestrictions.map((restriction) => (
              <li key={restriction.id} className="text-[12.5px]">
                {restriction.restriction} · {formatDateTime(restriction.windowStart)} → {formatDateTime(restriction.windowEnd)} UTC
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[11.5px] text-ink-3">The scheduler treats this airframe as unavailable for overlapping windows.</p>
        </Alert>
      ) : null}

      {aircraft.status === 'unserviceable' ? (
        <Alert tone="danger" title="Aircraft unserviceable">
          {aircraft.notes || 'No return-to-service note recorded.'} The scheduler will not assign this airframe until status changes.
        </Alert>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <Section title="Airframe record">
          <div className="space-y-4 p-4">
            <AircraftViewer height={230} register={aircraft.registration} label={aircraft.type} type={aircraft.type} />
            <KeyValue
              items={[
                { label: 'Registration', value: <span className="mono">{aircraft.registration}</span> },
                { label: 'Type', value: aircraft.type },
                { label: 'Category', value: aircraft.category },
                { label: 'Base', value: aircraft.base },
                { label: 'Payload capacity', value: <span className="tnum">{formatKg(aircraft.capacityKg)}</span> },
                { label: 'Flight hours', value: <span className="tnum">{aircraft.flightHours.toLocaleString('en-GB')}</span> },
                {
                  label: 'Capabilities',
                  value: aircraft.capabilities.length ? (
                    <span className="flex flex-wrap gap-1">{aircraft.capabilities.map((capability) => <Badge key={capability}>{capability}</Badge>)}</span>
                  ) : (
                    'None recorded'
                  ),
                },
                { label: 'Updated', value: <span className="tnum">{relativeTime(aircraft.updatedAt)}</span> },
              ]}
            />
            {aircraft.notes ? <p className="mt-3 border-t border-line pt-3 text-[12.5px] text-ink-2">{aircraft.notes}</p> : null}
          </div>
        </Section>

        <Section title={`Maintenance history · ${data.maintenance.length}`}>
          {data.maintenance.length ? (
            <>
              <div className="hidden sm:block">
                <TableWrap label="Maintenance history">
                  <table className="data">
                    <thead>
                      <tr>
                        <th className="w-[110px]">Status</th>
                        <th className="min-w-[180px]">Work</th>
                        <th className="w-[160px]">Window (UTC)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.maintenance.map((record) => (
                        <tr key={record.id}>
                          <td>
                            <StateBadge value={record.status} />
                          </td>
                          <td>
                            <div className="max-w-[260px] text-[12.5px]">{record.description}</div>
                            <div className="text-[11px] text-ink-3">{record.type}</div>
                          </td>
                          <td className="tnum text-[11.5px]">
                            {formatDateTime(record.windowStart)}
                            <div className="text-ink-3">→ {formatDateTime(record.windowEnd)}</div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableWrap>
              </div>
              <ul className="divide-y divide-line sm:hidden">
                {data.maintenance.map((record) => (
                  <li key={record.id} className="px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[12.5px]">{record.description}</span>
                      <StateBadge value={record.status} />
                    </div>
                    <div className="tnum mt-1 text-[11px] text-ink-3">{formatDateTime(record.windowStart)}</div>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="px-4 py-6 text-center text-[12.5px] text-ink-3">No maintenance records.</p>
          )}
        </Section>
      </div>

      <Section title={`Assignment history · ${data.assignments.length}`}>
        {data.assignments.length ? (
          <TableWrap label="Assignment history">
            <table className="data">
              <thead>
                <tr>
                  <th className="min-w-[240px]">Task</th>
                  <th className="w-[170px]">Start (UTC)</th>
                  <th className="w-[110px]">End (UTC)</th>
                </tr>
              </thead>
              <tbody>
                {data.assignments.map((assignment) => (
                  <tr key={assignment.id}>
                    <td>
                      <Link to={`/console/tasks/${assignment.taskId}`} className="text-accent hover:underline">
                        {assignment.taskLabel}
                      </Link>
                    </td>
                    <td className="tnum text-[12px]">{formatDateTime(assignment.start)}</td>
                    <td className="tnum text-[12px]">{formatDateTime(assignment.end)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        ) : (
          <p className="px-4 py-6 text-center text-[12.5px] text-ink-3">No committed assignments for this airframe.</p>
        )}
      </Section>

      <AircraftFormModal open={formOpen} aircraft={aircraft} onClose={() => setFormOpen(false)} onSaved={reload} />
    </div>
  )
}
