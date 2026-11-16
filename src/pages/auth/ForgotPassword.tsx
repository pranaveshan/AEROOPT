import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'

import { Alert, Button, Field, Input } from '../../components/ui'
import { ApiError, post } from '../../lib/api'
import { AuthLayout } from './AuthLayout'

export function ForgotPassword() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [token, setToken] = useState('')
  const [password, setPassword] = useState('')
  const [issued, setIssued] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const requestReset = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const response = await post<{ resetToken?: string; message?: string }>('/auth/password/forgot', { email })
      if (response.resetToken) {
        setIssued(response.resetToken)
        setToken(response.resetToken)
      }
      setMessage(response.message ?? 'Reset requested.')
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Reset request failed.')
    } finally {
      setBusy(false)
    }
  }

  const applyReset = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await post('/auth/password/reset', { token, password })
      navigate('/signin')
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Reset failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      title="Recover access"
      subtitle="Issue a reset token, then set a new password. Existing sessions are revoked."
      footer={
        <Link to="/signin" className="text-accent hover:underline">
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={requestReset} className="space-y-3.5" noValidate>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        {message ? <Alert tone="ok">{message}</Alert> : null}
        <Field label="Account email" htmlFor="email">
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Button type="submit" variant="secondary" loading={busy}>
          Request reset token
        </Button>
      </form>

      {issued ? (
        <Alert tone="warn" title="No mail provider is configured">
          <p className="mb-2">
            Demonstration mode returns the token here instead of emailing it. This does not happen outside the demonstration deployment.
          </p>
          <code className="mono block overflow-x-auto rounded bg-surface-2 p-2 text-[11px] text-ink">{issued}</code>
        </Alert>
      ) : null}

      <form onSubmit={applyReset} className="mt-5 space-y-3.5 border-t border-line pt-5" noValidate>
        <Field label="Reset token" htmlFor="token">
          <Input id="token" value={token} onChange={(e) => setToken(e.target.value)} required />
        </Field>
        <Field label="New password" htmlFor="new-password" hint="At least 10 characters with a letter and a number.">
          <Input id="new-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        <Button type="submit" variant="primary" loading={busy} className="w-full">
          Set new password
        </Button>
      </form>
    </AuthLayout>
  )
}
