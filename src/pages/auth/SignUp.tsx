import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'

import { Alert, Button, Field, Input, Select } from '../../components/ui'
import { ApiError, post } from '../../lib/api'
import { useAuth } from '../../lib/session'
import { AuthLayout } from './AuthLayout'

export function SignUp() {
  const navigate = useNavigate()
  const { refresh } = useAuth()
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'viewer' })
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  const update = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm((current) => ({ ...current, [key]: event.target.value }))

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setFieldErrors({})
    try {
      await post('/auth/signup', form)
      await refresh()
      navigate('/console', { replace: true })
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message)
        setFieldErrors(caught.fieldErrors)
      } else {
        setError('Account creation failed. Try again.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      title="Request access"
      subtitle="New accounts start with the role you select. An administrator can change it later."
      footer={
        <span>
          Already have an account?{' '}
          <Link to="/signin" className="text-accent hover:underline">
            Sign in
          </Link>
        </span>
      }
    >
      <form onSubmit={submit} className="space-y-3.5" noValidate>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <Field label="Full name" htmlFor="name" error={fieldErrors.name}>
          <Input id="name" autoComplete="name" value={form.name} onChange={update('name')} required />
        </Field>
        <Field label="Work email" htmlFor="email" error={fieldErrors.email}>
          <Input id="email" type="email" autoComplete="email" value={form.email} onChange={update('email')} required />
        </Field>
        <Field label="Password" htmlFor="password" error={fieldErrors.password} hint="At least 10 characters with a letter and a number.">
          <Input id="password" type="password" autoComplete="new-password" value={form.password} onChange={update('password')} required />
        </Field>
        <Field label="Role requested" htmlFor="role" error={fieldErrors.role} hint="Administrators and managers are assigned inside the console.">
          <Select id="role" value={form.role} onChange={update('role')}>
            <option value="viewer">Viewer</option>
            <option value="dispatcher">Dispatcher</option>
          </Select>
        </Field>
        <Button type="submit" variant="primary" loading={busy} className="w-full">
          Create account
        </Button>
      </form>
    </AuthLayout>
  )
}
