import { useEffect, useState } from 'react'
import { Link } from 'react-router'

import {
  Badge,
  Details,
  EmptyState,
  ErrorState,
  Loading,
  PageHeader,
  SearchInput,
  Section,
  Select,
  TableWrap,
} from '../../components/ui'
import type { AuditResponse } from '../../lib/dto'
import { useQuery } from '../../lib/session'
import { formatDateTime } from '../../shared/format'

export default function AuditLogs() {
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [entityType, setEntityType] = useState('')
  const [limit, setLimit] = useState('80')

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(search), 250)
    return () => window.clearTimeout(timer)
  }, [search])

  const query = new URLSearchParams({ limit })
  if (debounced) query.set('search', debounced)
  if (entityType) query.set('entityType', entityType)

  const { data, error, loading, reload } = useQuery<AuditResponse>(`/audit?${query.toString()}`, [debounced, entityType, limit])

  return (
    <div className="space-y-4">
      <PageHeader
        title="Audit logs"
        meta={
          <>
            <span>Immutable record of operational changes · UTC</span>
            <span className="text-ink-3/50">·</span>
            <span className="tnum">{data?.items.length ?? 0} shown</span>
          </>
        }
      />

      <Section>
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5">
          <SearchInput value={search} onChange={setSearch} placeholder="Search summary, actor or action" />
          <Select value={entityType} onChange={(e) => setEntityType(e.target.value)} aria-label="Filter by entity" className="w-auto min-w-[150px]">
            <option value="">All entities</option>
            {(data?.entityTypes ?? []).map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </Select>
          <Select value={limit} onChange={(e) => setLimit(e.target.value)} aria-label="Rows" className="w-auto min-w-[120px]">
            <option value="40">Last 40</option>
            <option value="80">Last 80</option>
            <option value="200">Last 200</option>
          </Select>
        </div>

        {loading ? (
          <Loading rows={7} label="Loading audit log" />
        ) : error ? (
          <ErrorState message={error instanceof Error ? error.message : 'Could not load the audit log.'} onRetry={reload} />
        ) : !data?.items.length ? (
          <EmptyState title="No audit events match these filters" detail="Operational changes are recorded automatically." />
        ) : (
          <TableWrap label="Audit events">
            <table className="data">
              <thead>
                <tr>
                  <th className="w-[160px]">Time (UTC)</th>
                  <th className="w-[160px]">Actor</th>
                  <th className="w-[170px]">Action</th>
                  <th className="w-[110px]">Entity</th>
                  <th className="min-w-[300px]">Summary</th>
                  <th className="w-[90px]">Details</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((event) => (
                  <tr key={event.id}>
                    <td className="tnum text-[11.5px]">{formatDateTime(event.createdAt)}</td>
                    <td className="truncate text-[12px]">{event.actorName}</td>
                    <td>
                      <Badge tone="neutral">{event.action}</Badge>
                    </td>
                    <td className="text-[11.5px] text-ink-2">
                      {event.entityType}
                      {event.entityId ? <div className="mono text-[10.5px] text-ink-3">{event.entityId.slice(0, 14)}</div> : null}
                    </td>
                    <td className="text-[12.5px]">{event.summary}</td>
                    <td>
                      <Details summary="View">
                        <pre className="mono max-w-[320px] overflow-x-auto rounded bg-surface-2 p-2 text-[10.5px] whitespace-pre-wrap">{event.details}</pre>
                      </Details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Section>

      <p className="text-[11.5px] text-ink-3">
        Records are append-only. Task, resource, schedule, approval and permission changes all create entries. Automated scheduling also records its decisions.
        <Link to="/console/security" className="ml-1 text-accent hover:underline">
          Security events
        </Link>
      </p>
    </div>
  )
}
