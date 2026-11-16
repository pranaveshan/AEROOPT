// Create/edit task dialog. One form used by the register and the detail page.
import { useEffect, useState } from 'react'

import type { MetaResponse } from '../lib/dto'
import { ApiError, patch, post } from '../lib/api'
import { inputToIso, isoToLocalInput } from '../shared/format'
import type { OperationalTask } from '../shared/types'
import { Button, Field, Input, Modal, Select, Textarea, useToast } from './ui'

const roundToHalfHour = (date: Date) => {
  const copy = new Date(date)
  copy.setUTCMinutes(copy.getUTCMinutes() < 30 ? 30 : 0)
  if (copy.getUTCMinutes() === 0) copy.setUTCHours(copy.getUTCHours() + 1)
  copy.setUTCSeconds(0, 0)
  return copy
}

interface TaskFormState {
  title: string
  description: string
  priority: string
  state: string
  windowStart: string
  windowEnd: string
  durationMinutes: string
  payloadKg: string
  site: string
  client: string
  requiredCapabilities: string
  requiredQualifications: string
  dependencies: string[]
}

const defaults = (): TaskFormState => {
  const start = roundToHalfHour(new Date(Date.now() + 3600_000))
  const end = new Date(start.getTime() + 4 * 3600_000)
  return {
    title: '',
    description: '',
    priority: 'normal',
    state: 'pending',
    windowStart: isoToLocalInput(start.toISOString()),
    windowEnd: isoToLocalInput(end.toISOString()),
    durationMinutes: '120',
    payloadKg: '0',
    site: '',
    client: '',
    requiredCapabilities: '',
    requiredQualifications: '',
    dependencies: [],
  }
}


export function TaskFormModal({
  open,
  task,
  meta,
  tasks,
  onClose,
  onSaved,
}: {
  open: boolean
  task: OperationalTask | null
  meta: MetaResponse | null
  tasks: OperationalTask[]
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<TaskFormState>(defaults)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  useEffect(() => {
    if (!open) return
    setErrors({})
    setMessage('')
    if (task) {
      setForm({
        title: task.title,
        description: task.description,
        priority: task.priority,
        state: task.state,
        windowStart: isoToLocalInput(task.windowStart),
        windowEnd: isoToLocalInput(task.windowEnd),
        durationMinutes: String(task.durationMinutes),
        payloadKg: String(task.payloadKg),
        site: task.site,
        client: task.client,
        requiredCapabilities: task.requiredCapabilities.join(', '),
        requiredQualifications: task.requiredQualifications.join(', '),
        dependencies: task.dependencies.filter((d) => d !== task.id),
      })
    } else {
      setForm(defaults())
    }
  }, [open, task])

  const set = <K extends keyof TaskFormState>(key: K, value: TaskFormState[K]) => setForm((current) => ({ ...current, [key]: value }))
  const split = (value: string) => value.split(',').map((v) => v.trim()).filter(Boolean)

  const submit = async () => {
    setBusy(true)
    setErrors({})
    setMessage('')
    const payload = {
      ...form,
      windowStart: inputToIso(form.windowStart),
      windowEnd: inputToIso(form.windowEnd),
      durationMinutes: Number(form.durationMinutes),
      payloadKg: Number(form.payloadKg),
      requiredCapabilities: split(form.requiredCapabilities),
      requiredQualifications: split(form.requiredQualifications),
    }
    try {
      if (task) await patch(`/tasks/${task.id}`, payload)
      else await post('/tasks', payload)
      toast.push(task ? 'Task updated' : 'Task created')
      onSaved()
      onClose()
    } catch (caught) {
      if (caught instanceof ApiError) {
        setErrors(caught.fieldErrors)
        setMessage(caught.message)
      } else {
        setMessage('Could not save the task.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      title={task ? `Edit ${task.code}` : 'New task'}
      onClose={onClose}
      width={720}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={busy}>
            {task ? 'Save changes' : 'Create task'}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {message ? (
          <div className="sm:col-span-2">
            <p className="alert alert-danger">{message}</p>
          </div>
        ) : null}
        <Field label="Task name" htmlFor="title" error={errors.title} className="sm:col-span-2">
          <Input id="title" value={form.title} onChange={(e) => set('title', e.target.value)} />
        </Field>
        <Field label="Description" htmlFor="description" error={errors.description} className="sm:col-span-2">
          <Textarea id="description" value={form.description} onChange={(e) => set('description', e.target.value)} rows={2} />
        </Field>
        <Field label="Priority" htmlFor="priority" error={errors.priority}>
          <Select id="priority" value={form.priority} onChange={(e) => set('priority', e.target.value)}>
            {(meta?.priorities ?? ['critical', 'high', 'normal', 'low']).map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="State" htmlFor="state" error={errors.state}>
          <Select id="state" value={form.state} onChange={(e) => set('state', e.target.value)}>
            {(meta?.taskStates ?? ['draft', 'pending', 'scheduled', 'in_progress', 'completed', 'cancelled', 'blocked']).map((value) => (
              <option key={value} value={value}>
                {value.replace(/_/g, ' ')}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Window start (UTC)" htmlFor="windowStart" error={errors.windowStart}>
          <Input id="windowStart" type="datetime-local" value={form.windowStart} onChange={(e) => set('windowStart', e.target.value)} />
        </Field>
        <Field label="Window end (UTC)" htmlFor="windowEnd" error={errors.windowEnd}>
          <Input id="windowEnd" type="datetime-local" value={form.windowEnd} onChange={(e) => set('windowEnd', e.target.value)} />
        </Field>
        <Field label="Duration (minutes)" htmlFor="duration" error={errors.durationMinutes}>
          <Input id="duration" type="number" min={15} step={5} value={form.durationMinutes} onChange={(e) => set('durationMinutes', e.target.value)} />
        </Field>
        <Field label="Payload (kg)" htmlFor="payload" error={errors.payloadKg}>
          <Input id="payload" type="number" min={0} step={100} value={form.payloadKg} onChange={(e) => set('payloadKg', e.target.value)} />
        </Field>
        <Field label="Site" htmlFor="site" error={errors.site}>
          <Input id="site" value={form.site} onChange={(e) => set('site', e.target.value)} placeholder="LHR" />
        </Field>
        <Field label="Client" htmlFor="client" error={errors.client}>
          <Input id="client" value={form.client} onChange={(e) => set('client', e.target.value)} />
        </Field>
        <Field label="Required capabilities" htmlFor="capabilities" error={errors.requiredCapabilities} hint="Comma separated, e.g. pax, ifr">
          <Input id="capabilities" value={form.requiredCapabilities} onChange={(e) => set('requiredCapabilities', e.target.value)} />
        </Field>
        <Field label="Required qualifications" htmlFor="qualifications" error={errors.requiredQualifications} hint="Comma separated, e.g. pax, a320">
          <Input id="qualifications" value={form.requiredQualifications} onChange={(e) => set('requiredQualifications', e.target.value)} />
        </Field>
        <Field label="Dependencies" htmlFor="dependencies" error={errors.dependencies} className="sm:col-span-2" hint="Tasks that must finish before this one starts.">
          <select
            id="dependencies"
            multiple
            className="select h-auto min-h-[86px] py-2"
            value={form.dependencies}
            onChange={(e) => set('dependencies', Array.from(e.target.selectedOptions).map((option) => option.value))}
          >
            {tasks
              .filter((candidate) => candidate.id !== task?.id)
              .map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.code} · {candidate.title}
                </option>
              ))}
          </select>
        </Field>
      </div>
    </Modal>
  )
}
