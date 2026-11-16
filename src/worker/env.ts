import type { D1DatabaseLike } from './db'
import type { Role } from '../shared/types'

export interface Env {
  DB: D1DatabaseLike
  ASSETS: { fetch(request: Request): Promise<Response> }
  ENVIRONMENT?: string
}

export interface AuthUser {
  id: string
  email: string
  name: string
  role: Role
  status: 'active' | 'suspended'
  sessionId: string
}

export type AppEnv = {
  Bindings: Env
  Variables: { user: AuthUser | null }
}
