// Role/permission matrix. The Worker enforces it; the console only hides
// actions the user cannot perform.
import type { Role } from './types'

export const PERMISSIONS = [
  'tasks:read',
  'tasks:write',
  'aircraft:read',
  'aircraft:write',
  'crew:read',
  'crew:write',
  'maintenance:read',
  'maintenance:write',
  'schedule:read',
  'schedule:write',
  'schedule:approve',
  'optimize:run',
  'analytics:read',
  'security:read',
  'security:manage',
  'users:manage',
  'audit:read',
  'settings:manage',
] as const

export type Permission = (typeof PERMISSIONS)[number]

const READ_ONLY: Permission[] = [
  'tasks:read',
  'aircraft:read',
  'crew:read',
  'maintenance:read',
  'schedule:read',
  'analytics:read',
]

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: [...PERMISSIONS],
  ops_manager: [
    ...READ_ONLY,
    'tasks:write',
    'schedule:write',
    'schedule:approve',
    'optimize:run',
    'audit:read',
  ],
  dispatcher: [...READ_ONLY, 'tasks:write', 'schedule:write', 'optimize:run'],
  maintenance_officer: [...READ_ONLY, 'maintenance:write', 'aircraft:write'],
  crew_coordinator: [...READ_ONLY, 'crew:write'],
  viewer: [...READ_ONLY],
}

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Administrator',
  ops_manager: 'Operations Manager',
  dispatcher: 'Dispatcher',
  maintenance_officer: 'Maintenance Officer',
  crew_coordinator: 'Crew Coordinator',
  viewer: 'Viewer',
}

export const ROLES: Role[] = ['admin', 'ops_manager', 'dispatcher', 'maintenance_officer', 'crew_coordinator', 'viewer']

export function can(role: Role | undefined, permission: Permission): boolean {
  if (!role) return false
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false
}
