import { useState } from 'react'
import { Link, useParams } from 'react-router'

import { CrewFormModal } from '../../components/CrewForm'
import { Alert, Badge, Bar, Button, ErrorState, KeyValue, Loading, PageHeader, Section, StateBadge, TableWrap } from '../../components/ui'
import type { CrewDetailResponse } from '../../lib/dto'
import { useAuth, useQuery } from '../../lib/session'
import { formatDateTime, formatDuration, formatTime } from '../../shared/format'

export default function CrewDetail() {
  const { id = '' } = useParams()
  const { can } = useAuth()
  const { data, error, loading, reload } = useQuery<CrewDetailResponse>(`/crew/${id}`, [id])
  const [formOpen, setFormOpen] = useState(false)

  if (loading) return <Loading rows={6} label="Loading crew record" />
  if (error) return <ErrorState message={error instanceof Error ? error.message : 'Could not load the crew record.'} onRetry={reload} />
  if (!data) return null

  const { crew } = data
  const expiring = crew.certifications.filter((cert) => Date.parse(cert.expiresAt) < Date.now() + 60 * 86_400_000)
  const expired = crew.certifications.filter((cert) => Date.parse(cert.expiresAt) < Date.now())

  return (
    <div className="space-y-4">
      <nav className="flex items-center gap-1.5 text-[11.5px] text-ink-3">
        <Link to="/console/crew" className="hover:text-ink-2">
          Crew
        </Link>
        <span>/</span>
        <span className="mono">{crew.code}</span>
      </nav>

      <PageHeader
        title={crew.name}
        meta={
          <>
            <span className="mono">{crew.code}</span>
            <span className="text-ink-3/50">·</span>
            <span>{crew.role}</span>
            <span className="text-ink-3/50">·</span>
            <span className="mono">{crew.base}</span>
            <StateBadge value={crew.status} />
          </>
        }
        actions={
          can('crew:write') ? (
            <Button size="sm" variant="primary" onClick={() => setFormOpen(true)}>
              Edit crew record
            </Button>
          ) : null
        }
      />

      {expired.length ? (
        <Alert tone="danger" title={`${expired.length} expired certification${expired.length === 1 ? '' : 's'}`}>
          {expired.map((cert) => `${cert.name} (${cert.expiresAt.slice(0, 10)})`).join(', ')}. The scheduler will reject assignments that need this crew member
          past expiry.
        </Alert>
      ) : expiring.length ? (
        <Alert tone="warn" title="Certification expiring within 60 days">
          {expiring.map((cert) => `${cert.name} (${cert.expiresAt.slice(0, 10)})`).join(', ')}.
        </Alert>
      ) : null}

      {(crew.status === 'rest' || crew.status === 'leave' || crew.status === 'unavailable') && (
        <Alert tone="warn" title={`Currently ${crew.status.replace(/_/g, ' ')}`}>
          The scheduler only assigns crew with status available or on duty.
        </Alert>
      )}

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <Section title="Record">
          <div className="p-4">
            <KeyValue
              items={[
                { label: 'Role', value: crew.role },
                { label: 'Base', value: crew.base },
                { label: 'Availability from', value: <span className="tnum">{formatDateTime(crew.availableFrom)}</span> },
                { label: 'Availability to', value: <span className="tnum">{formatDateTime(crew.availableTo)}</span> },
                { label: 'Duty limit', value: <span className="tnum">{formatDuration(crew.dutyLimitMinutes)} / UTC day</span> },
                { label: 'Rest requirement', value: <span className="tnum">{formatDuration(crew.restMinutes)}</span> },
                {
                  label: 'Qualifications',
                  value: crew.qualifications.length ? (
                    <span className="flex flex-wrap gap-1">{crew.qualifications.map((qualification) => <Badge key={qualification}>{qualification}</Badge>)}</span>
                  ) : (
                    'None'
                  ),
                },
                {
                  label: 'Certifications',
                  value: crew.certifications.length ? (
                    <ul className="space-y-0.5">
                      {crew.certifications.map((cert) => (
                        <li key={cert.name} className="text-[12.5px]">
                          {cert.name} <span className="tnum text-ink-3">· {cert.expiresAt.slice(0, 10)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    'None'
                  ),
                },
              ]}
            />
          </div>
        </Section>

        <Section title="Duty by UTC day">
          {data.duty.length ? (
            <div className="space-y-3 p-4">
              {data.duty.map((day) => (
                <div key={day.date}>
                  <div className="mb-1 flex items-baseline justify-between text-[12px]">
                    <span className="tnum">{day.date}</span>
                    <span className="tnum text-ink-3">
                      {formatDuration(day.minutes)} / {formatDuration(day.limit)}
                    </span>
                  </div>
                  <Bar value={day.minutes / Math.max(1, day.limit)} tone={day.minutes > day.limit ? 'danger' : day.minutes > day.limit * 0.85 ? 'warn' : 'accent'} />
                </div>
              ))}
            </div>
          ) : (
            <p className="px-4 py-6 text-center text-[12.5px] text-ink-3">No committed assignments in the record.</p>
          )}
        </Section>
      </div>

      <Section title={`Assignment history · ${data.assignments.length}`}>
        {data.assignments.length ? (
          <TableWrap label="Crew assignment history">
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
                    <td className="tnum text-[12px]">{formatTime(assignment.end)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        ) : (
          <p className="px-4 py-6 text-center text-[12.5px] text-ink-3">No committed assignments for this crew member.</p>
        )}
      </Section>

      <CrewFormModal open={formOpen} crew={crew} onClose={() => setFormOpen(false)} onSaved={reload} />
    </div>
  )
}
