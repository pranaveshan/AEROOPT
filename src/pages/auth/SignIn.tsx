import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'

import { Alert, Button, Field, Input } from '../../components/ui'
import { ApiError } from '../../lib/api'
import { useAuth } from '../../lib/session'
import { AuthLayout } from './AuthLayout'

const DEMO = [
  ['admin@aeroopt.io', 'Administrator'],
  ['ops@aeroopt.io', 'Operations Manager'],
  ['dispatch@aeroopt.io', 'Dispatcher'],
  ['maintenance@aeroopt.io', 'Maintenance Officer'],
  ['crew@aeroopt.io', 'Crew Coordinator'],
  ['viewer@aeroopt.io', 'Viewer'],
] as const

export function SignIn() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setFieldErrors({})
    try {
      await signIn(email.trim(), password)
      navigate(params.get('next') || '/console', { replace: true })
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message)
        setFieldErrors(caught.fieldErrors)
      } else {
        setError('Sign-in failed. Check your connection and try again.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Operational console access is restricted to authorised accounts."
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link to="/forgot-password" className="text-accent hover:underline">
            Forgot password
          </Link>
          <span>
            No account?{' '}
            <Link to="/signup" className="text-accent hover:underline">
              Request access
            </Link>
          </span>
        </div>
      }
    >
      <form onSubmit={submit} className="space-y-3.5" noValidate>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <Field label="Work email" htmlFor="email" error={fieldErrors.email}>
          <Input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@operator.com" required />
        </Field>
        <Field label="Password" htmlFor="password" error={fieldErrors.password}>
          <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        <Button type="submit" variant="primary" loading={busy} className="w-full">
          Sign in
        </Button>
      </form>

      <div className="mt-6 border-t border-line pt-4">
        <div className="mb-2 text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase">Demonstration accounts</div>
        <div className="grid gap-1">
          {DEMO.map(([address, role]) => (
            <button
              key={address}
              type="button"
              className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-[12px] text-ink-2 hover:bg-surface-2"
              onClick={() => {
                setEmail(address)
                setPassword('AeroOpt#2026')
                setError('')
              }}
            >
              <span className="mono truncate">{address}</span>
              <span className="shrink-0 text-[11px] text-ink-3">{role}</span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-ink-3">Shared demonstration password: AeroOpt#2026. Click an account to fill the form.</p>
      </div>
    </AuthLayout>
  )
}
