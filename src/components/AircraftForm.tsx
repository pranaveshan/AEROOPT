// Create/edit aircraft dialog.
import { useEffect, useState } from 'react'

import { ApiError, patch, post } from '../lib/api'
import type { Aircraft } from '../shared/types'
import { Button, Field, Input, Modal, Select, Textarea, useToast } from './ui'

const blank = {
  registration: '',
  type: '',
  category: '',
  status: 'serviceable',
  base: '',
  capacityKg: '5000',
  flightHours: '0',
  capabilities: '',
  notes: '',
}

export function AircraftFormModal({
  open,
  aircraft,
  onClose,
  onSaved,
}: {
  open: boolean
  aircraft: Aircraft | null
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
    setErrors({})
    setMessage('')
    setForm(
      aircraft
        ? {
            registration: aircraft.registration,
            type: aircraft.type,
            category: aircraft.category,
            status: aircraft.status,
            base: aircraft.base,
            capacityKg: String(aircraft.capacityKg),
            flightHours: String(aircraft.flightHours),
            capabilities: aircraft.capabilities.join(', '),
            notes: aircraft.notes,
          }
        : blank,
    )
  }, [open, aircraft])

  const set = (key: keyof typeof blank, value: string) => setForm((current) => ({ ...current, [key]: value }))

  const submit = async () => {
    setBusy(true)
    setErrors({})
    setMessage('')
    try {
      const payload = {
        ...form,
        capacityKg: Number(form.capacityKg),
        flightHours: Number(form.flightHours),
        capabilities: form.capabilities.split(',').map((value) => value.trim()).filter(Boolean),
      }
      if (aircraft) await patch(`/aircraft/${aircraft.id}`, payload)
      else await post('/aircraft', payload)
      toast.push(aircraft ? 'Aircraft updated' : 'Aircraft added')
      onSaved()
      onClose()
    } catch (caught) {
      if (caught instanceof ApiError) {
        setErrors(caught.fieldErrors)
        setMessage(caught.message)
      } else {
        setMessage('Could not save the aircraft.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      title={aircraft ? `Edit ${aircraft.registration}` : 'Add aircraft'}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={busy}>
            {aircraft ? 'Save changes' : 'Add aircraft'}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {message ? <p className="alert alert-danger sm:col-span-2">{message}</p> : null}
        <Field label="Registration" htmlFor="registration" error={errors.registration}>
          <Input id="registration" value={form.registration} onChange={(e) => set('registration', e.target.value)} placeholder="G-ABCD" />
        </Field>
        <Field label="Type" htmlFor="type" error={errors.type}>
          <Input id="type" value={form.type} onChange={(e) => set('type', e.target.value)} placeholder="Airbus A320-200" />
        </Field>
        <Field label="Category" htmlFor="category" error={errors.category}>
          <Input id="category" value={form.category} onChange={(e) => set('category', e.target.value)} placeholder="Narrowbody · passenger" />
        </Field>
        <Field label="Operational status" htmlFor="status" error={errors.status}>
          <Select id="status" value={form.status} onChange={(e) => set('status', e.target.value)}>
            {['serviceable', 'restricted', 'maintenance', 'unserviceable'].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Base" htmlFor="base" error={errors.base}>
          <Input id="base" value={form.base} onChange={(e) => set('base', e.target.value)} placeholder="LHR" />
        </Field>
        <Field label="Payload capacity (kg)" htmlFor="capacity" error={errors.capacityKg}>
          <Input id="capacity" type="number" min={1} value={form.capacityKg} onChange={(e) => set('capacityKg', e.target.value)} />
        </Field>
        <Field label="Flight hours" htmlFor="hours" error={errors.flightHours}>
          <Input id="hours" type="number" min={0} value={form.flightHours} onChange={(e) => set('flightHours', e.target.value)} />
        </Field>
        <Field label="Capabilities" htmlFor="caps" error={errors.capabilities} hint="Comma separated, e.g. pax, ifr, night-ops">
          <Input id="caps" value={form.capabilities} onChange={(e) => set('capabilities', e.target.value)} />
        </Field>
        <Field label="Notes" htmlFor="notes" error={errors.notes} className="sm:col-span-2">
          <Textarea id="notes" rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}
