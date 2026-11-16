import { useState } from 'react'

import {
  Alert,
  Badge,
  Button,
  ConfirmDialog,
  ErrorState,
  Field,
  Input,
  Loading,
  Modal,
  PageHeader,
  SearchInput,
  Section,
  Select,
  StateBadge,
  TableWrap,
  useToast,
} from '../../components/ui'
import type { UserRow } from '../../lib/dto'
import { ApiError, patch, post } from '../../lib/api'
import { useAuth, useQuery } from '../../lib/session'
import { ROLE_LABEL, ROLES } from '../../shared/permissions'
import { formatDateTime, relativeTime } from '../../shared/format'

export default function UserManagement() {
  const { user } = useAuth()
  const toast = useToast()
  const { data, error, loading, reload } = useQuery<{ items: UserRow[] }>('/users')
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'viewer' })
  const [formError, setFormError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [suspend, setSuspend] = useState<UserRow | null>(null)
  const [reset, setReset] = useState<UserRow | null>(null)
  const [password, setPassword] = useState('')

  const items = (data?.items ?? []).filter(
    (row) => !search || `${row.name} ${row.email} ${row.role}`.toLowerCase().includes(search.toLowerCase()),
  )

  const changeRole = async (row: UserRow, role: string) => {
    try {
      await patch(`/users/${row.id}/role`, { role })
      toast.push(`${row.name} is now ${ROLE_LABEL[role as keyof typeof ROLE_LABEL]}`)
      reload()
    } catch (caught) {
      toast.push(caught instanceof ApiError ? caught.message : 'Role change failed', 'danger')
    }
  }

  const createUser = async () => {
    setBusy(true)
    setFormError('')
    setFieldErrors({})
    try {
      await post('/users', form)
      toast.push('Account created')
      setCreateOpen(false)
      setForm({ name: '', email: '', password: '', role: 'viewer' })
      reload()
    } catch (caught) {
      if (caught instanceof ApiError) {
        setFormError(caught.message)
        setFieldErrors(caught.fieldErrors)
      } else {
        setFormError('Account creation failed.')
      }
    } finally {
      setBusy(false)
    }
  }

  const toggleSuspend = async () => {
    if (!suspend) return
    setBusy(true)
    try {
      await post(`/users/${suspend.id}/${suspend.status === 'active' ? 'suspend' : 'activate'}`)
      toast.push(suspend.status === 'active' ? 'Account suspended' : 'Account reactivated')
      setSuspend(null)
      reload()
    } catch (caught) {
      toast.push(caught instanceof ApiError ? caught.message : 'Operation failed', 'danger')
    } finally {
      setBusy(false)
    }
  }

  const resetPassword = async () => {
    if (!reset) return
    setBusy(true)
    try {
      await post(`/users/${reset.id}/reset`, { password })
      toast.push('Password reset; sessions revoked')
      setReset(null)
      setPassword('')
      reload()
    } catch (caught) {
      toast.push(caught instanceof ApiError ? caught.message : 'Reset failed', 'danger')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <Loading rows={6} label="Loading users" />
  if (error) return <ErrorState message={error instanceof Error ? error.message : 'Could not load users.'} onRetry={reload} />

  return (
    <div className="space-y-4">
      <PageHeader
        title="User management"
        meta={
          <>
            <span>Accounts and roles</span>
            <span className="text-ink-3/50">·</span>
            <span className="tnum">{data?.items.length ?? 0} accounts</span>
          </>
        }
        actions={
          <Button variant="primary" onClick={() => setCreateOpen(true)}>
            Create account
          </Button>
        }
      />

      <Alert tone="default" title="Roles are enforced by the server">
        Changing a role takes effect on the next request. Suspended accounts have their sessions revoked immediately. The last active administrator cannot be demoted.
      </Alert>

      <Section>
        <div className="border-b border-line px-3 py-2.5">
          <SearchInput value={search} onChange={setSearch} placeholder="Search name, email or role" />
        </div>

        <TableWrap label="User accounts">
          <table className="data">
            <thead>
              <tr>
                <th className="min-w-[190px]">Account</th>
                <th className="w-[190px]">Role</th>
                <th className="w-[110px]">Status</th>
                <th className="w-[120px]">Sessions</th>
                <th className="w-[150px]">Last sign-in</th>
                <th className="w-[200px] text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id}>
                  <td>
                    <div className="text-[12.5px] font-medium">
                      {row.name}
                      {row.id === user?.id ? <span className="ml-1.5 text-[11px] text-ink-3">(you)</span> : null}
                    </div>
                    <div className="text-[11px] text-ink-3">{row.email}</div>
                  </td>
                  <td>
                    <Select
                      value={row.role}
                      aria-label={`Role for ${row.name}`}
                      onChange={(event) => changeRole(row, event.target.value)}
                      disabled={row.id === user?.id}
                      className="h-8 text-[12px]"
                    >
                      {ROLES.map((role) => (
                        <option key={role} value={role}>
                          {ROLE_LABEL[role]}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td>
                    <StateBadge value={row.status} />
                  </td>
                  <td className="tnum text-[12.5px]">{row.activeSessions}</td>
                  <td className="tnum text-[11.5px] text-ink-2">{row.lastLoginAt ? relativeTime(row.lastLoginAt) : 'Never'}</td>
                  <td>
                    <div className="flex flex-wrap justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setReset(row)}>
                        Reset password
                      </Button>
                      {row.id !== user?.id ? (
                        <Button size="sm" variant={row.status === 'active' ? 'danger' : 'secondary'} onClick={() => setSuspend(row)}>
                          {row.status === 'active' ? 'Suspend' : 'Activate'}
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Section>

      {data?.items.some((row) => row.status === 'suspended') ? (
        <Section title="Suspended accounts">
          <ul className="divide-y divide-line">
            {data.items
              .filter((row) => row.status === 'suspended')
              .map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                  <div>
                    <div className="text-[12.5px]">{row.name}</div>
                    <div className="text-[11px] text-ink-3">{row.email}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="tnum text-[11px] text-ink-3">{row.suspendedAt ? formatDateTime(row.suspendedAt) : ''}</span>
                    <Button size="sm" variant="secondary" onClick={() => setSuspend({ ...row, status: 'suspended' })}>
                      Activate
                    </Button>
                  </div>
                </li>
              ))}
          </ul>
        </Section>
      ) : null}

      <Modal
        open={createOpen}
        title="Create account"
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={createUser} loading={busy}>
              Create account
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {formError ? <Alert tone="danger">{formError}</Alert> : null}
          <Field label="Full name" htmlFor="new-name" error={fieldErrors.name}>
            <Input id="new-name" value={form.name} onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))} />
          </Field>
          <Field label="Work email" htmlFor="new-email" error={fieldErrors.email}>
            <Input id="new-email" type="email" value={form.email} onChange={(e) => setForm((c) => ({ ...c, email: e.target.value }))} />
          </Field>
          <Field label="Temporary password" htmlFor="new-password" error={fieldErrors.password} hint="At least 10 characters with a letter and a number.">
            <Input id="new-password" type="text" value={form.password} onChange={(e) => setForm((c) => ({ ...c, password: e.target.value }))} />
          </Field>
          <Field label="Role" htmlFor="new-role" error={fieldErrors.role}>
            <Select id="new-role" value={form.role} onChange={(e) => setForm((c) => ({ ...c, role: e.target.value }))}>
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABEL[role]}
                </option>
              ))}
            </Select>
          </Field>
          <p className="text-[11.5px] text-ink-3">Share the temporary password out of band. No mail provider is configured in this deployment.</p>
        </div>
      </Modal>

      <Modal
        open={Boolean(reset)}
        title={`Reset password · ${reset?.email ?? ''}`}
        onClose={() => setReset(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setReset(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={resetPassword} loading={busy}>
              Reset password
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Alert tone="warn">All sessions for this account are revoked immediately.</Alert>
          <Field label="New password" htmlFor="reset-password">
            <Input id="reset-password" type="text" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(suspend)}
        title={suspend?.status === 'active' ? `Suspend ${suspend?.name}?` : `Reactivate ${suspend?.name}?`}
        message={
          suspend?.status === 'active'
            ? 'The account is blocked from signing in and all its sessions are revoked. Audit history is retained.'
            : 'The account can sign in again. Existing sessions stay revoked.'
        }
        confirmLabel={suspend?.status === 'active' ? 'Suspend account' : 'Reactivate account'}
        tone={suspend?.status === 'active' ? 'danger' : 'primary'}
        loading={busy}
        onCancel={() => setSuspend(null)}
        onConfirm={toggleSuspend}
      />

      <p className="text-[11.5px] text-ink-3">
        Permission changes are written to the audit trail and to security events. {data ? `${data.items.filter((i) => i.status === 'active').length} active accounts.` : ''}
        <Badge tone="neutral">{ROLE_LABEL.viewer}</Badge>
      </p>
    </div>
  )
}
