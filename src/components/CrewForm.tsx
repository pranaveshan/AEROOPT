// Create/edit crew dialog. Certifications are entered one per line: "Name | YYYY-MM-DD".
import { useEffect, useState } from 'react'

import { ApiError, patch, post } from '../lib/api'
import { inputToIso, isoToLocalInput } from '../shared/format'
import type { CrewMember } from '../shared/types'
import { Button, Field, Input, Modal, Select, Textarea, useToast } from './ui'

const blank = () => {
  const from = isoToLocalInput(new Date(Date.now() - 3600_000).toISOString())
  const to = isoToLocalInput(new Date(Date.now() + 5 * 86_400_000).toISOString())
  return {
    code: '',
    name: '',
    role: 'Captain',
    base: '',
    status: 'available',
    qualifications: '',
    certifications: '',
    availableFrom: from,
    availableTo: to,
    dutyLimitMinutes: '600',
    restMinutes: '600',
  }
}

const certsToText = (crew: CrewMember) => crew.certifications.map((cert) => `${cert.name} | ${cert.expiresAt.slice(0, 10)}`).join('\n')

export function CrewFormModal({
  open,
  crew,
  onClose,
  onSaved,
}: {
  open: boolean
  crew: CrewMember | null
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
      crew
        ? {
            code: crew.code,
            name: crew.name,
            role: crew.role,
            base: crew.base,
            status: crew.status,
            qualifications: crew.qualifications.join(', '),
            certifications: certsToText(crew),
            availableFrom: isoToLocalInput(crew.availableFrom),
            availableTo: isoToLocalInput(crew.availableTo),
            dutyLimitMinutes: String(crew.dutyLimitMinutes),
            restMinutes: String(crew.restMinutes),
          }
        : blank(),
    )
  }, [open, crew])

  const set = (key: keyof ReturnType<typeof blank>, value: string) => setForm((current) => ({ ...current, [key]: value }))

  const submit = async () => {
    setBusy(true)
    setErrors({})
    setMessage('')
    const certifications = form.certifications
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [name, expiry] = line.split('|').map((part) => part.trim())
        return { name: name ?? '', expiresAt: expiry ? new Date(`${expiry}T00:00:00Z`).toISOString() : '' }
      })
    try {
      const payload = {
        ...form,
        qualifications: form.qualifications.split(',').map((value) => value.trim()).filter(Boolean),
        certifications,
        availableFrom: inputToIso(form.availableFrom),
        availableTo: inputToIso(form.availableTo),
        dutyLimitMinutes: Number(form.dutyLimitMinutes),
        restMinutes: Number(form.restMinutes),
      }
      if (crew) await patch(`/crew/${crew.id}`, payload)
      else await post('/crew', payload)
      toast.push(crew ? 'Crew record updated' : 'Crew member added')
      onSaved()
      onClose()
    } catch (caught) {
      if (caught instanceof ApiError) {
        setErrors(caught.fieldErrors)
        setMessage(caught.message)
      } else {
        setMessage('Could not save the crew record.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      title={crew ? `Edit ${crew.code}` : 'Add crew member'}
      onClose={onClose}
      width={680}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={busy}>
            {crew ? 'Save changes' : 'Add crew'}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {message ? <p className="alert alert-danger sm:col-span-2">{message}</p> : null}
        <Field label="Crew code" htmlFor="code" error={errors.code}>
          <Input id="code" value={form.code} onChange={(e) => set('code', e.target.value)} placeholder="CRW-112" />
        </Field>
        <Field label="Name" htmlFor="name" error={errors.name}>
          <Input id="name" value={form.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label="Role" htmlFor="role" error={errors.role}>
          <Input id="role" value={form.role} onChange={(e) => set('role', e.target.value)} placeholder="Captain" />
        </Field>
        <Field label="Base" htmlFor="base" error={errors.base}>
          <Input id="base" value={form.base} onChange={(e) => set('base', e.target.value)} placeholder="LHR" />
        </Field>
        <Field label="Availability status" htmlFor="status" error={errors.status}>
          <Select id="status" value={form.status} onChange={(e) => set('status', e.target.value)}>
            {['available', 'on_duty', 'rest', 'leave', 'unavailable'].map((value) => (
              <option key={value} value={value}>
                {value.replace(/_/g, ' ')}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Duty limit (minutes)" htmlFor="duty" error={errors.dutyLimitMinutes} hint="Maximum assigned minutes per UTC day.">
          <Input id="duty" type="number" min={60} step={30} value={form.dutyLimitMinutes} onChange={(e) => set('dutyLimitMinutes', e.target.value)} />
        </Field>
        <Field label="Rest requirement (minutes)" htmlFor="rest" error={errors.restMinutes}>
          <Input id="rest" type="number" min={0} step={30} value={form.restMinutes} onChange={(e) => set('restMinutes', e.target.value)} />
        </Field>
        <Field label="Available from (UTC)" htmlFor="from" error={errors.availableFrom}>
          <Input id="from" type="datetime-local" value={form.availableFrom} onChange={(e) => set('availableFrom', e.target.value)} />
        </Field>
        <Field label="Available to (UTC)" htmlFor="to" error={errors.availableTo}>
          <Input id="to" type="datetime-local" value={form.availableTo} onChange={(e) => set('availableTo', e.target.value)} />
        </Field>
        <Field label="Qualifications" htmlFor="quals" error={errors.qualifications} hint="Comma separated, e.g. pax, ifr, a320" className="sm:col-span-2">
          <Input id="quals" value={form.qualifications} onChange={(e) => set('qualifications', e.target.value)} />
        </Field>
        <Field
          label="Certifications"
          htmlFor="certs"
          error={errors.certifications}
          hint="One per line: A320 Type Rating | 2027-05-01"
          className="sm:col-span-2"
        >
          <Textarea id="certs" rows={3} value={form.certifications} onChange={(e) => set('certifications', e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}
