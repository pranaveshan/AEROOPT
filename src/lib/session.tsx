// Authentication context: session, permission helper and the mutation hooks
// every console page shares.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

import type { Permission } from '../shared/permissions'
import type { Role } from '../shared/types'
import { api, post } from './api'

export interface SessionUser {
  id: string
  email: string
  name: string
  role: Role
  status: 'active' | 'suspended'
}

interface SessionPayload {
  user: SessionUser | null
  permissions: Permission[]
  timezone?: string
  demoData?: boolean
}

interface AuthContextValue {
  user: SessionUser | null
  permissions: Permission[]
  timezone: string
  demoData: boolean
  loading: boolean
  can: (permission: Permission) => boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ user: SessionUser | null; permissions: Permission[]; timezone: string; demoData: boolean; loading: boolean }>({
    user: null,
    permissions: [],
    timezone: 'UTC',
    demoData: false,
    loading: true,
  })

  const load = useCallback(async () => {
    try {
      const data = await api<SessionPayload>('/auth/session')
      setState({ user: data.user, permissions: data.permissions ?? [], timezone: data.timezone ?? 'UTC', demoData: Boolean(data.demoData), loading: false })
    } catch {
      setState({ user: null, permissions: [], timezone: 'UTC', demoData: false, loading: false })
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      can: (permission) => state.permissions.includes(permission),
      signIn: async (email, password) => {
        await post('/auth/signin', { email, password })
        await load()
      },
      signOut: async () => {
        await post('/auth/signout')
        setState({ user: null, permissions: [], timezone: 'UTC', demoData: false, loading: false })
      },
      refresh: load,
    }),
    [state, load],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}

/** Minimal data-fetching hook: one dependency key, explicit reload. */
export function useQuery<T>(path: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [loading, setLoading] = useState(Boolean(path))
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (!path) {
      setLoading(false)
      return
    }
    let active = true
    setLoading(true)
    api<T>(path)
      .then((result) => {
        if (!active) return
        setData(result)
        setError(null)
      })
      .catch((caught) => {
        if (!active) return
        setError(caught)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, nonce, ...deps])

  return { data, error, loading, reload: () => setNonce((n) => n + 1), setData }
}
