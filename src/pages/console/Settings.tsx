import { useEffect, useState } from 'react'

import { Alert, Badge, Button, ErrorState, Field, Input, Loading, PageHeader, Section, Select, useToast } from '../../components/ui'
import type { SettingsResponse } from '../../lib/dto'
import { ApiError, put } from '../../lib/api'
import { useMotionPreference } from '../../lib/motion'
import { useAuth, useQuery } from '../../lib/session'
import { formatDateTime } from '../../shared/format'

const LABELS: Record<string, { label: string; hint: string; type: 'number' | 'text' | 'select' }> = {
  operationalTimezone: { label: 'Operational time zone', hint: 'All API timestamps are stored in UTC; this label is shown to operators.', type: 'select' },
  turnaroundMinutes: { label: 'Aircraft turnaround', hint: 'Minimum gap between two assignments for the same airframe, minutes.', type: 'number' },
  crewGapMinutes: { label: 'Crew gap', hint: 'Minimum gap between two assignments for the same crew member, minutes.', type: 'number' },
  slotStepMinutes: { label: 'Scheduling step', hint: 'Granularity of the candidate start scan, minutes.', type: 'number' },
  defaultDutyLimitMinutes: { label: 'Default duty limit', hint: 'Applied to new crew records, minutes per UTC day.', type: 'number' },
  defaultRestMinutes: { label: 'Default rest requirement', hint: 'Applied to new crew records, minutes.', type: 'number' },
  sessionHours: { label: 'Session lifetime', hint: 'Hours before a signed-in session expires.', type: 'number' },
  loginRateLimit: { label: 'Sign-in attempt limit', hint: 'Failed attempts per email or IP in 15 minutes before blocking.', type: 'number' },
}

export default function SettingsPage() {
  const toast = useToast()
  const { refresh } = useAuth()
  const { preference, setPreference } = useMotionPreference()
  const { data, error, loading, reload } = useQuery<SettingsResponse>('/settings')
  const [form, setForm] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (data) setForm(data.settings)
  }, [data])

  if (loading) return <Loading rows={6} label="Loading settings" />
  if (error) return <ErrorState message={error instanceof Error ? error.message : 'Could not load settings.'} onRetry={reload} />

  const save = async () => {
    setBusy(true)
    setMessage('')
    setErrors({})
    try {
      const payload = Object.fromEntries(Object.keys(LABELS).map((key) => [key, form[key] ?? '']))
      await put('/settings', payload)
      toast.push('Settings saved')
      reload()
      await refresh()
    } catch (caught) {
      if (caught instanceof ApiError) {
        setErrors(caught.fieldErrors)
        setMessage(caught.message)
      } else {
        setMessage('Could not save settings.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Settings"
        meta={
          <>
            <span>Operational configuration · UTC</span>
            <span className="text-ink-3/50">·</span>
            <span>{data?.environment}</span>
          </>
        }
        actions={
          <Button variant="primary" onClick={save} loading={busy}>
            Save settings
          </Button>
        }
      />

      {message ? <Alert tone="danger">{message}</Alert> : null}
      {data?.demoData ? (
        <Alert tone="warn" title="Demonstration dataset">
          Records in this deployment are synthetic and internally generated. No external aviation feed is connected and no real operational data is present.
        </Alert>
      ) : null}

      <Section title="Scheduling and session parameters">
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          {Object.entries(LABELS).map(([key, meta]) => (
            <Field key={key} label={meta.label} htmlFor={key} error={errors[key]} hint={meta.hint}>
              {meta.type === 'select' ? (
                <Select id={key} value={form[key] ?? 'UTC'} onChange={(e) => setForm((current) => ({ ...current, [key]: e.target.value }))}>
                  {['UTC', 'Europe/London', 'Europe/Paris', 'America/New_York', 'Asia/Singapore'].map((zone) => (
                    <option key={zone} value={zone}>
                      {zone}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input
                  id={key}
                  type="number"
                  min={0}
                  value={form[key] ?? ''}
                  invalid={Boolean(errors[key])}
                  onChange={(e) => setForm((current) => ({ ...current, [key]: e.target.value }))}
                />
              )}
            </Field>
          ))}
        </div>
      </Section>

      <Section title="Interface">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="max-w-[520px]">
            <div className="text-[12.5px] font-medium">Motion</div>
            <p className="mt-0.5 text-[11.5px] text-ink-3">
              Reduced motion removes entrance, transition and hover animation. The operating-system preference is honoured in both settings.
            </p>
          </div>
          <div className="flex gap-1">
            <Button size="sm" variant={preference === 'full' ? 'primary' : 'secondary'} onClick={() => setPreference('full')}>
              Full
            </Button>
            <Button size="sm" variant={preference === 'reduced' ? 'primary' : 'secondary'} onClick={() => setPreference('reduced')}>
              Reduced
            </Button>
          </div>
        </div>
      </Section>

      <div className="grid gap-4 sm:grid-cols-2">
        <Section title="Deployment">
          <dl className="space-y-2 p-4 text-[12.5px]">
            <div className="flex justify-between gap-2">
              <dt className="text-ink-3">Runtime</dt>
              <dd>Cloudflare Worker + D1</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-ink-3">Schema version</dt>
              <dd className="tnum">v1</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-ink-3">Dataset seeded</dt>
              <dd className="tnum">{data?.seededAt ? formatDateTime(data.seededAt) : '—'}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-ink-3">Time handling</dt>
              <dd>Stored UTC · displayed UTC</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-ink-3">Demo data</dt>
              <dd>
                <Badge tone={data?.demoData ? 'warn' : 'ok'}>{data?.demoData ? 'Synthetic' : 'Off'}</Badge>
              </dd>
            </div>
          </dl>
        </Section>

        <Section title="Not configured">
          <ul className="space-y-2 p-4 text-[12.5px] text-ink-2">
            <li>Email delivery — password reset returns a token locally instead of sending mail.</li>
            <li>External aviation data feeds — the dataset is synthetic and clearly labelled.</li>
            <li>Multi-factor authentication — not implemented in this build.</li>
            <li>Dependency and secret scanning — run in CI; no scanner is wired into this deployment.</li>
          </ul>
        </Section>
      </div>
    </div>
  )
}
