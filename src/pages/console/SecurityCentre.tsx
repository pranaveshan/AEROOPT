import { useState } from 'react'

import {
  Alert,
  Badge,
  Button,
  ConfirmDialog,
  ErrorState,
  Loading,
  Metric,
  PageHeader,
  Section,
  StateBadge,
  TableWrap,
  Tabs,
  useToast,
} from '../../components/ui'
import type { SecurityResponse } from '../../lib/dto'
import { ApiError, post } from '../../lib/api'
import { useAuth, useQuery } from '../../lib/session'
import { formatDateTime, relativeTime } from '../../shared/format'

type Tab = 'events' | 'sessions' | 'controls'

export default function SecurityCentre() {
  const { can, user } = useAuth()
  const toast = useToast()
  const { data, error, loading, reload } = useQuery<SecurityResponse>('/security')
  const [tab, setTab] = useState<Tab>('events')
  const [revoking, setRevoking] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const canManage = can('security:manage')

  if (loading) return <Loading rows={6} label="Loading security centre" />
  if (error) return <ErrorState message={error instanceof Error ? error.message : 'Could not load the security centre.'} onRetry={reload} />
  if (!data) return null

  const revoke = async () => {
    if (!revoking) return
    setBusy(true)
    try {
      await post(`/auth/sessions/${revoking}/revoke`)
      toast.push('Session revoked')
      setRevoking(null)
      reload()
    } catch (caught) {
      toast.push(caught instanceof ApiError ? caught.message : 'Revocation failed', 'danger')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Security centre"
        meta={
          <>
            <span>Authentication and session activity · UTC</span>
            <span className="text-ink-3/50">·</span>
            <span className="tnum">{data.stats.activeSessions} active sessions</span>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Failed sign-ins · 24 h" value={data.stats.failedLogins24h} tone={data.stats.failedLogins24h > 5 ? 'warn' : 'default'} />
        <Metric label="Rate-limited attempts" value={data.stats.rateLimited24h} tone={data.stats.rateLimited24h ? 'warn' : 'default'} detail="15-minute window" />
        <Metric label="Suspended accounts" value={data.stats.suspendedAccounts} tone={data.stats.suspendedAccounts ? 'danger' : 'default'} />
        <Metric label="Audit events" value={data.stats.auditEvents} detail="All recorded operational changes" />
      </div>

      {data.alerts.length ? (
        <Alert tone="warn" title={`${data.alerts.length} recent security warning${data.alerts.length === 1 ? '' : 's'}`}>
          <ul className="space-y-0.5">
            {data.alerts.slice(0, 3).map((alert) => (
              <li key={alert.id} className="text-[12.5px]">
                {alert.message} · {alert.email} · {relativeTime(alert.createdAt)}
              </li>
            ))}
          </ul>
        </Alert>
      ) : null}

      <Section>
        <div className="border-b border-line px-3 py-2">
          <Tabs
            value={tab}
            onChange={setTab}
            options={[
              { value: 'events', label: 'Events', count: data.events.length },
              { value: 'sessions', label: 'Sessions', count: data.sessions.length },
              { value: 'controls', label: 'Controls', count: data.controls.length },
            ]}
          />
        </div>

        {tab === 'events' ? (
          data.events.length ? (
            <TableWrap label="Security events">
              <table className="data">
                <thead>
                  <tr>
                    <th className="w-[130px]">Severity</th>
                    <th className="w-[190px]">Type</th>
                    <th className="min-w-[240px]">Message</th>
                    <th className="w-[200px]">Account</th>
                    <th className="w-[110px]">Source</th>
                    <th className="w-[160px]">Time (UTC)</th>
                  </tr>
                </thead>
                <tbody>
                  {data.events.map((event) => (
                    <tr key={event.id}>
                      <td>
                        <StateBadge value={event.severity === 'critical' ? 'suspended' : event.severity === 'warning' ? 'restricted' : 'available'} label={event.severity} />
                      </td>
                      <td className="mono text-[11.5px]">{event.type}</td>
                      <td className="text-[12.5px]">{event.message}</td>
                      <td className="truncate text-[12px]">{event.email || '—'}</td>
                      <td className="mono text-[11.5px] text-ink-3">{event.ip}</td>
                      <td className="tnum text-[11.5px]">{formatDateTime(event.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          ) : (
            <p className="px-4 py-6 text-center text-[12.5px] text-ink-3">No security events recorded.</p>
          )
        ) : null}

        {tab === 'sessions' ? (
          <TableWrap label="Active sessions">
            <table className="data">
              <thead>
                <tr>
                  <th className="min-w-[170px]">Account</th>
                  <th className="w-[120px]">Role</th>
                  <th className="w-[110px]">Source IP</th>
                  <th className="w-[160px]">Started</th>
                  <th className="w-[140px]">Last seen</th>
                  <th className="w-[150px]">Expires</th>
                  <th className="w-[120px] text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.sessions.map((session) => (
                  <tr key={session.id}>
                    <td>
                      <div className="truncate text-[12.5px]">{session.name}</div>
                      <div className="truncate text-[11px] text-ink-3">{session.email}</div>
                    </td>
                    <td className="text-[11.5px] text-ink-2">{session.role}</td>
                    <td className="mono text-[11.5px]">{session.ip}</td>
                    <td className="tnum text-[11.5px]">{formatDateTime(session.createdAt)}</td>
                    <td className="tnum text-[11.5px]">{relativeTime(session.lastSeenAt)}</td>
                    <td className="tnum text-[11.5px]">{formatDateTime(session.expiresAt)}</td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        {session.current ? <Badge tone="accent">Current</Badge> : null}
                        {session.revoked ? (
                          <Badge>Revoked</Badge>
                        ) : (session.userId === user?.id || canManage) ? (
                          <Button size="sm" variant="ghost" onClick={() => setRevoking(session.id)}>
                            Revoke
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        ) : null}

        {tab === 'controls' ? (
          <div className="divide-y divide-line">
            {data.controls.map((control) => (
              <div key={control.control} className="flex flex-wrap items-start justify-between gap-2 px-4 py-3">
                <div className="min-w-0">
                  <div className="text-[12.5px] font-medium">{control.control}</div>
                  <div className="text-[11.5px] text-ink-3">{control.detail}</div>
                </div>
                <Badge tone={control.status === 'enforced' ? 'ok' : 'warn'}>{control.status.replace(/_/g, ' ')}</Badge>
              </div>
            ))}
            <p className="px-4 py-3 text-[11.5px] text-ink-3">
              Controls marked not configured are real gaps in this deployment, not pass results. No security control makes a system unhackable.
            </p>
          </div>
        ) : null}
      </Section>

      <ConfirmDialog
        open={Boolean(revoking)}
        title="Revoke this session?"
        message="The session token stops working immediately. The account must sign in again."
        confirmLabel="Revoke session"
        loading={busy}
        onCancel={() => setRevoking(null)}
        onConfirm={revoke}
      />
    </div>
  )
}
