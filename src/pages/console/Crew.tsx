import { useEffect, useState } from 'react'
import { Link } from 'react-router'

import { CrewFormModal } from '../../components/CrewForm'
import {
  Badge,
  Button,
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
} from '../../components/ui'
import type { ListResponse } from '../../lib/dto'
import { useAuth, useQuery } from '../../lib/session'
import { formatDuration } from '../../shared/format'
import type { CrewMember } from '../../shared/types'

export default function Crew() {
  const { can } = useAuth()
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [status, setStatus] = useState('')
  const [sort, setSort] = useState('name:asc')
  const [page, setPage] = useState(1)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<CrewMember | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebounced(search)
      setPage(1)
    }, 250)
    return () => window.clearTimeout(timer)
  }, [search])

  const query = new URLSearchParams({ page: String(page), pageSize: '25', sort })
  if (debounced) query.set('search', debounced)
  if (status) query.set('status', status)

  const { data, error, loading, reload } = useQuery<ListResponse<CrewMember>>(`/crew?${query.toString()}`, [page, debounced, status, sort])
  const canWrite = can('crew:write')

  return (
    <div className="space-y-4">
      <PageHeader
        title="Crew"
        meta={
          <>
            <span>Operational data · UTC</span>
            <span className="text-ink-3/50">·</span>
            <span className="tnum">{data?.total ?? 0} records</span>
          </>
        }
        actions={
          canWrite ? (
            <Button
              variant="primary"
              onClick={() => {
                setEditing(null)
                setFormOpen(true)
              }}
            >
              Add crew
            </Button>
          ) : null
        }
      />

      <Section>
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5">
          <SearchInput value={search} onChange={setSearch} placeholder="Search name, code, role or base" />
          <Select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value)
              setPage(1)
            }}
            aria-label="Filter by availability"
            className="w-auto min-w-[160px]"
          >
            <option value="">All availability</option>
            {['available', 'on_duty', 'rest', 'leave', 'unavailable'].map((value) => (
              <option key={value} value={value}>
                {value.replace(/_/g, ' ')}
              </option>
            ))}
          </Select>
          <Select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort" className="w-auto min-w-[140px]">
            <option value="name:asc">Name</option>
            <option value="duty:desc">Duty limit</option>
            <option value="status:asc">Availability</option>
          </Select>
        </div>

        {loading ? (
          <Loading rows={6} label="Loading crew" />
        ) : error ? (
          <ErrorState message={error instanceof Error ? error.message : 'Could not load crew.'} onRetry={reload} />
        ) : !data?.items.length ? (
          <EmptyState title="No crew match these filters" detail="Adjust the search or add a crew member." />
        ) : (
          <>
            <div className="hidden md:block">
              <TableWrap label="Crew register">
                <table className="data">
                  <thead>
                    <tr>
                      <th className="w-[100px]">Code</th>
                      <th className="min-w-[170px]">Name</th>
                      <th className="w-[120px]">Role</th>
                      <th className="w-[70px]">Base</th>
                      <th className="w-[110px]">Availability</th>
                      <th className="min-w-[220px]">Qualifications</th>
                      <th className="w-[110px]">Duty limit</th>
                      <th className="w-[110px] text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((member) => {
                      const expiring = member.certifications.find((cert) => Date.parse(cert.expiresAt) < Date.now() + 45 * 86_400_000)
                      return (
                        <tr key={member.id}>
                          <td>
                            <Link to={`/console/crew/${member.id}`} className="mono text-accent hover:underline">
                              {member.code}
                            </Link>
                          </td>
                          <td>
                            <div className="truncate font-medium">{member.name}</div>
                            <div className="text-[11px] text-ink-3">
                              {member.certifications.length} certification{member.certifications.length === 1 ? '' : 's'}
                              {expiring ? ` · ${expiring.name} expires ${expiring.expiresAt.slice(0, 10)}` : ''}
                            </div>
                          </td>
                          <td className="text-[12.5px]">{member.role}</td>
                          <td className="mono text-[12px]">{member.base}</td>
                          <td>
                            <StateBadge value={member.status} />
                          </td>
                          <td>
                            <div className="flex flex-wrap gap-1">
                              {member.qualifications.slice(0, 3).map((qualification) => (
                                <Badge key={qualification}>{qualification}</Badge>
                              ))}
                              {member.qualifications.length > 3 ? <Badge>+{member.qualifications.length - 3}</Badge> : null}
                            </div>
                          </td>
                          <td className="tnum text-[12px]">{formatDuration(member.dutyLimitMinutes)}</td>
                          <td>
                            <div className="flex justify-end gap-1">
                              <Link to={`/console/crew/${member.id}`} className="btn btn-ghost btn-sm">
                                View
                              </Link>
                              {canWrite ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setEditing(member)
                                    setFormOpen(true)
                                  }}
                                >
                                  Edit
                                </Button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </TableWrap>
            </div>

            <ul className="divide-y divide-line md:hidden">
              {data.items.map((member) => (
                <li key={member.id} className="px-3 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link to={`/console/crew/${member.id}`} className="mono text-[12px] text-accent">
                        {member.code}
                      </Link>
                      <div className="text-[13px] font-medium">{member.name}</div>
                      <div className="text-[11.5px] text-ink-3">
                        {member.role} · {member.base}
                      </div>
                    </div>
                    <StateBadge value={member.status} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {member.qualifications.slice(0, 4).map((qualification) => (
                      <Badge key={qualification}>{qualification}</Badge>
                    ))}
                  </div>
                  <div className="mt-2 flex gap-2">
                    <Link to={`/console/crew/${member.id}`} className="btn btn-secondary btn-sm">
                      Open crew record
                    </Link>
                    {canWrite ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditing(member)
                          setFormOpen(true)
                        }}
                      >
                        Edit
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

      <CrewFormModal open={formOpen} crew={editing} onClose={() => setFormOpen(false)} onSaved={reload} />
    </div>
  )
}
