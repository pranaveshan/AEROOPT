import { useEffect, useState } from 'react'
import { Link } from 'react-router'

import { AircraftFormModal } from '../../components/AircraftForm'
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
import { formatKg } from '../../shared/format'
import type { Aircraft } from '../../shared/types'

export default function AircraftList() {
  const { can } = useAuth()
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [status, setStatus] = useState('')
  const [sort, setSort] = useState('registration:asc')
  const [page, setPage] = useState(1)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Aircraft | null>(null)

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

  const { data, error, loading, reload } = useQuery<ListResponse<Aircraft>>(`/aircraft?${query.toString()}`, [page, debounced, status, sort])
  const canWrite = can('aircraft:write')

  return (
    <div className="space-y-4">
      <PageHeader
        title="Aircraft"
        meta={
          <>
            <span>Operational data · UTC</span>
            <span className="text-ink-3/50">·</span>
            <span className="tnum">{data?.total ?? 0} airframes</span>
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
              Add aircraft
            </Button>
          ) : null
        }
      />

      <Section>
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5">
          <SearchInput value={search} onChange={setSearch} placeholder="Search registration, type or base" />
          <Select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value)
              setPage(1)
            }}
            aria-label="Filter by status"
            className="w-auto min-w-[150px]"
          >
            <option value="">All statuses</option>
            {['serviceable', 'restricted', 'maintenance', 'unserviceable'].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
          <Select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort" className="w-auto min-w-[150px]">
            <option value="registration:asc">Registration</option>
            <option value="hours:desc">Flight hours</option>
            <option value="capacity:desc">Capacity</option>
            <option value="status:asc">Status</option>
          </Select>
        </div>

        {loading ? (
          <Loading rows={6} label="Loading aircraft" />
        ) : error ? (
          <ErrorState message={error instanceof Error ? error.message : 'Could not load aircraft.'} onRetry={reload} />
        ) : !data?.items.length ? (
          <EmptyState title="No aircraft match these filters" detail="Adjust the search or register a new airframe." />
        ) : (
          <>
            <div className="hidden md:block">
              <TableWrap label="Aircraft register">
                <table className="data">
                  <thead>
                    <tr>
                      <th className="w-[110px]">Registration</th>
                      <th className="min-w-[200px]">Type</th>
                      <th className="w-[78px]">Base</th>
                      <th className="w-[112px]">Status</th>
                      <th className="w-[190px]">Capabilities</th>
                      <th className="w-[100px]">Capacity</th>
                      <th className="w-[90px]">Hours</th>
                      <th className="w-[120px] text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((aircraft) => (
                      <tr key={aircraft.id}>
                        <td>
                          <Link to={`/console/aircraft/${aircraft.id}`} className="mono text-accent hover:underline">
                            {aircraft.registration}
                          </Link>
                        </td>
                        <td>
                          <div className="max-w-[260px] truncate">{aircraft.type}</div>
                          <div className="text-[11px] text-ink-3">{aircraft.category}</div>
                        </td>
                        <td className="mono text-[12px]">{aircraft.base}</td>
                        <td>
                          <StateBadge value={aircraft.status} />
                        </td>
                        <td>
                          <div className="flex flex-wrap gap-1">
                            {aircraft.capabilities.slice(0, 4).map((capability) => (
                              <Badge key={capability}>{capability}</Badge>
                            ))}
                            {aircraft.capabilities.length > 4 ? <Badge>+{aircraft.capabilities.length - 4}</Badge> : null}
                          </div>
                        </td>
                        <td className="tnum text-[12px]">{formatKg(aircraft.capacityKg)}</td>
                        <td className="tnum text-[12px]">{aircraft.flightHours.toLocaleString('en-GB')}</td>
                        <td>
                          <div className="flex justify-end gap-1">
                            <Link to={`/console/aircraft/${aircraft.id}`} className="btn btn-ghost btn-sm">
                              View
                            </Link>
                            {canWrite ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setEditing(aircraft)
                                  setFormOpen(true)
                                }}
                              >
                                Edit
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
              {data.items.map((aircraft) => (
                <li key={aircraft.id} className="px-3 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <Link to={`/console/aircraft/${aircraft.id}`} className="mono text-[12.5px] text-accent">
                        {aircraft.registration}
                      </Link>
                      <div className="text-[12.5px]">{aircraft.type}</div>
                      <div className="text-[11.5px] text-ink-3">{aircraft.category}</div>
                    </div>
                    <StateBadge value={aircraft.status} />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11.5px] text-ink-3">
                    <span className="mono">{aircraft.base}</span>
                    <span className="tnum">{formatKg(aircraft.capacityKg)}</span>
                    <span className="tnum">{aircraft.flightHours.toLocaleString('en-GB')} h</span>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <Link to={`/console/aircraft/${aircraft.id}`} className="btn btn-secondary btn-sm">
                      Open aircraft
                    </Link>
                    {canWrite ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditing(aircraft)
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

      <AircraftFormModal open={formOpen} aircraft={editing} onClose={() => setFormOpen(false)} onSaved={reload} />
    </div>
  )
}
