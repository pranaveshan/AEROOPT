// Raise a maintenance record.
import { useEffect, useState } from 'react'

import { ApiError, post } from '../lib/api'
import { inputToIso, isoToLocalInput } from '../shared/format'
import { Button, Field, Input, Modal, Select, Textarea, useToast } from './ui'

const blank = () => ({
  aircraftId: '',
  type: 'scheduled',
  status: 'planned',
  windowStart: isoToLocalInput(new Date(Date.now() + 3600_000).toISOString()),
  windowEnd: isoToLocalInput(new Date(Date.now() + 6 * 3600_000).toISOString()),
  description: '',
  restriction: '',
})

export function MaintenanceFormModal({
  open,
  aircraft,
  onClose,
  onSaved,
}: {
  open: boolean
  aircraft: { id: string; label: string }[]
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState(blank)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  useEffect(() => {
    if (!open) return
    setForm(blank())
    setErrors({})
    setMessage('')
  }, [open])

  const set = (key: keyof ReturnType<typeof blank>, value: string) => setForm((current) => ({ ...current, [key]: value }))

  const submit = async () => {
    setBusy(true)
    setErrors({})
    setMessage('')
    try {
      await post('/maintenance', {
        ...form,
        windowStart: inputToIso(form.windowStart),
        windowEnd: inputToIso(form.windowEnd),
      })
      toast.push('Maintenance record raised')
      onSaved()
      onClose()
    } catch (caught) {
      if (caught instanceof ApiError) {
        setErrors(caught.fieldErrors)
        setMessage(caught.message)
      } else {
        setMessage('Could not create the maintenance record.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      title="Raise maintenance record"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={busy}>
            Create record
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {message ? <p className="alert alert-danger sm:col-span-2">{message}</p> : null}
        <Field label="Aircraft" htmlFor="aircraftId" error={errors.aircraftId} className="sm:col-span-2">
          <Select id="aircraftId" value={form.aircraftId} onChange={(e) => set('aircraftId', e.target.value)}>
            <option value="">Select aircraft</option>
            {aircraft.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Type" htmlFor="type" error={errors.type}>
          <Select id="type" value={form.type} onChange={(e) => set('type', e.target.value)}>
            {['scheduled', 'unscheduled', 'inspection'].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status" htmlFor="status" error={errors.status}>
          <Select id="status" value={form.status} onChange={(e) => set('status', e.target.value)}>
            {['planned', 'in_progress', 'completed', 'cancelled'].map((value) => (
              <option key={value} value={value}>
                {value.replace(/_/g, ' ')}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Window start (UTC)" htmlFor="start" error={errors.windowStart}>
          <Input id="start" type="datetime-local" value={form.windowStart} onChange={(e) => set('windowStart', e.target.value)} />
        </Field>
        <Field label="Window end (UTC)" htmlFor="end" error={errors.windowEnd}>
          <Input id="end" type="datetime-local" value={form.windowEnd} onChange={(e) => set('windowEnd', e.target.value)} />
        </Field>
        <Field label="Work description" htmlFor="description" error={errors.description} className="sm:col-span-2">
          <Textarea id="description" rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} />
        </Field>
        <Field label="Operational restriction" htmlFor="restriction" error={errors.restriction} className="sm:col-span-2" hint="Shown to dispatchers and applied by the scheduler.">
          <Input id="restriction" value={form.restriction} onChange={(e) => set('restriction', e.target.value)} placeholder="Day operations only until closed" />
        </Field>
        <p className="sm:col-span-2 text-[11.5px] text-ink-3">
          Setting the status to in progress takes the aircraft out of service. Completing the last open record returns it to serviceable.
        </p>
      </div>
    </Modal>
  )
}
