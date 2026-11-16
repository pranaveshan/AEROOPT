// Input validation shared by the console forms and the Worker (authority).
import type { Role } from './types'
import { ROLES } from './permissions'

export type FieldErrors = Record<string, string>

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const num = (v: unknown) => (typeof v === 'number' ? v : Number(str(v)))
const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : [])
const bool = (v: unknown) => v === true || v === 'true'

export function isIso(value: string): boolean {
  return ISO.test(value) && !Number.isNaN(Date.parse(value))
}

export type CleanTask = {
  title: string
  description: string
  priority: 'critical' | 'high' | 'normal' | 'low'
  state: 'draft' | 'pending' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'blocked'
  windowStart: string
  windowEnd: string
  durationMinutes: number
  payloadKg: number
  requiredCapabilities: string[]
  requiredQualifications: string[]
  site: string
  client: string
  dependencies: string[]
}

const PRIORITIES = ['critical', 'high', 'normal', 'low'] as const
const STATES = ['draft', 'pending', 'scheduled', 'in_progress', 'completed', 'cancelled', 'blocked'] as const

export function validateTask(input: Record<string, unknown>): { errors: FieldErrors; value: CleanTask } {
  const errors: FieldErrors = {}
  const title = str(input.title)
  if (title.length < 3) errors.title = 'Enter a task name (3+ characters).'
  else if (title.length > 120) errors.title = 'Keep the name under 120 characters.'
  const description = str(input.description)
  if (description.length > 1000) errors.description = 'Keep the description under 1,000 characters.'

  const priority = str(input.priority) as CleanTask['priority']
  if (!PRIORITIES.includes(priority)) errors.priority = 'Choose a priority.'

  const state = (str(input.state) || 'pending') as CleanTask['state']
  if (!STATES.includes(state)) errors.state = 'Unknown state.'

  const windowStart = str(input.windowStart)
  const windowEnd = str(input.windowEnd)
  if (!isIso(windowStart)) errors.windowStart = 'Enter a valid start.'
  if (!isIso(windowEnd)) errors.windowEnd = 'Enter a valid end.'
  if (isIso(windowStart) && isIso(windowEnd) && Date.parse(windowEnd) <= Date.parse(windowStart)) {
    errors.windowEnd = 'End must be after the start.'
  }

  const durationMinutes = num(input.durationMinutes)
  if (!Number.isFinite(durationMinutes) || durationMinutes < 15) errors.durationMinutes = 'Minimum duration is 15 minutes.'
  else if (durationMinutes > 1440) errors.durationMinutes = 'Maximum duration is 24 hours.'
  else if (isIso(windowStart) && isIso(windowEnd) && durationMinutes * 60_000 > Date.parse(windowEnd) - Date.parse(windowStart)) {
    errors.durationMinutes = 'Duration is longer than the time window.'
  }

  const payloadKg = num(input.payloadKg ?? 0)
  if (!Number.isFinite(payloadKg) || payloadKg < 0) errors.payloadKg = 'Payload must be zero or more kilograms.'

  const site = str(input.site)
  if (!site) errors.site = 'Enter the operating site.'
  const client = str(input.client)
  if (!client) errors.client = 'Enter the requesting client.'

  return {
    errors,
    value: {
      title,
      description,
      priority,
      state,
      windowStart,
      windowEnd,
      durationMinutes,
      payloadKg,
      requiredCapabilities: arr(input.requiredCapabilities),
      requiredQualifications: arr(input.requiredQualifications),
      site,
      client,
      dependencies: arr(input.dependencies),
    },
  }
}

export type CleanAircraft = {
  registration: string
  type: string
  category: string
  status: 'serviceable' | 'restricted' | 'maintenance' | 'unserviceable'
  base: string
  capacityKg: number
  flightHours: number
  capabilities: string[]
  notes: string
}

const AIRCRAFT_STATUS = ['serviceable', 'restricted', 'maintenance', 'unserviceable'] as const

export function validateAircraft(input: Record<string, unknown>): { errors: FieldErrors; value: CleanAircraft } {
  const errors: FieldErrors = {}
  const registration = str(input.registration).toUpperCase()
  if (!registration) errors.registration = 'Enter a registration.'
  else if (!/^[A-Z0-9-]{3,10}$/.test(registration)) errors.registration = 'Use 3–10 letters, digits or hyphens.'

  const type = str(input.type)
  if (!type) errors.type = 'Enter the aircraft type.'
  const category = str(input.category)
  if (!category) errors.category = 'Enter the category.'
  const status = str(input.status) as CleanAircraft['status']
  if (!AIRCRAFT_STATUS.includes(status)) errors.status = 'Choose a status.'
  const base = str(input.base)
  if (!base) errors.base = 'Enter the operating base.'

  const capacityKg = num(input.capacityKg)
  if (!Number.isFinite(capacityKg) || capacityKg <= 0) errors.capacityKg = 'Capacity must be above zero.'

  const flightHours = num(input.flightHours ?? 0)
  if (!Number.isFinite(flightHours) || flightHours < 0) errors.flightHours = 'Flight hours cannot be negative.'

  return {
    errors,
    value: {
      registration,
      type,
      category,
      status,
      base,
      capacityKg,
      flightHours,
      capabilities: arr(input.capabilities),
      notes: str(input.notes).slice(0, 800),
    },
  }
}

export type CleanCrew = {
  code: string
  name: string
  role: string
  base: string
  status: 'available' | 'on_duty' | 'rest' | 'leave' | 'unavailable'
  qualifications: string[]
  certifications: { name: string; expiresAt: string }[]
  availableFrom: string
  availableTo: string
  dutyLimitMinutes: number
  restMinutes: number
}

const CREW_STATUS = ['available', 'on_duty', 'rest', 'leave', 'unavailable'] as const

export function validateCrew(input: Record<string, unknown>): { errors: FieldErrors; value: CleanCrew } {
  const errors: FieldErrors = {}
  const code = str(input.code).toUpperCase()
  if (!/^[A-Z0-9-]{2,12}$/.test(code)) errors.code = 'Use 2–12 letters, digits or hyphens.'
  const name = str(input.name)
  if (name.length < 2) errors.name = 'Enter the crew member name.'
  const role = str(input.role)
  if (!role) errors.role = 'Enter the crew role.'
  const base = str(input.base)
  if (!base) errors.base = 'Enter the crew base.'

  const status = str(input.status) as CleanCrew['status']
  if (!CREW_STATUS.includes(status)) errors.status = 'Choose an availability status.'

  const availableFrom = str(input.availableFrom)
  const availableTo = str(input.availableTo)
  if (!isIso(availableFrom)) errors.availableFrom = 'Enter a valid availability start.'
  if (!isIso(availableTo)) errors.availableTo = 'Enter a valid availability end.'
  if (isIso(availableFrom) && isIso(availableTo) && Date.parse(availableTo) <= Date.parse(availableFrom)) {
    errors.availableTo = 'Availability end must be after the start.'
  }

  const dutyLimitMinutes = num(input.dutyLimitMinutes)
  if (!Number.isFinite(dutyLimitMinutes) || dutyLimitMinutes < 60 || dutyLimitMinutes > 960) {
    errors.dutyLimitMinutes = 'Duty limit must be between 1 and 16 hours.'
  }
  const restMinutes = num(input.restMinutes)
  if (!Number.isFinite(restMinutes) || restMinutes < 0 || restMinutes > 720) {
    errors.restMinutes = 'Rest must be between 0 and 12 hours.'
  }

  const rawCerts = Array.isArray(input.certifications) ? input.certifications : []
  const certifications: { name: string; expiresAt: string }[] = []
  rawCerts.forEach((entry, index) => {
    const item = (entry ?? {}) as Record<string, unknown>
    const label = str(item.name)
    const expiresAt = str(item.expiresAt)
    if (!label) errors[`certifications.${index}.name`] = 'Certification needs a name.'
    else if (!isIso(expiresAt)) errors[`certifications.${index}.expiresAt`] = 'Certification needs an expiry.'
    else certifications.push({ name: label, expiresAt })
  })

  return {
    errors,
    value: {
      code,
      name,
      role,
      base,
      status,
      qualifications: arr(input.qualifications),
      certifications,
      availableFrom,
      availableTo,
      dutyLimitMinutes,
      restMinutes,
    },
  }
}

export type CleanMaintenance = {
  aircraftId: string
  type: 'scheduled' | 'unscheduled' | 'inspection'
  status: 'planned' | 'in_progress' | 'completed' | 'cancelled'
  windowStart: string
  windowEnd: string
  description: string
  restriction: string
}

const MAINT_TYPES = ['scheduled', 'unscheduled', 'inspection'] as const
const MAINT_STATUS = ['planned', 'in_progress', 'completed', 'cancelled'] as const

export function validateMaintenance(input: Record<string, unknown>): { errors: FieldErrors; value: CleanMaintenance } {
  const errors: FieldErrors = {}
  const aircraftId = str(input.aircraftId)
  if (!aircraftId) errors.aircraftId = 'Choose an aircraft.'
  const type = str(input.type) as CleanMaintenance['type']
  if (!MAINT_TYPES.includes(type)) errors.type = 'Choose a maintenance type.'
  const status = str(input.status) as CleanMaintenance['status']
  if (!MAINT_STATUS.includes(status)) errors.status = 'Choose a status.'

  const windowStart = str(input.windowStart)
  const windowEnd = str(input.windowEnd)
  if (!isIso(windowStart)) errors.windowStart = 'Enter a valid start.'
  if (!isIso(windowEnd)) errors.windowEnd = 'Enter a valid end.'
  if (isIso(windowStart) && isIso(windowEnd) && Date.parse(windowEnd) <= Date.parse(windowStart)) {
    errors.windowEnd = 'End must be after the start.'
  }
  const description = str(input.description)
  if (description.length < 5) errors.description = 'Describe the work (5+ characters).'

  return {
    errors,
    value: {
      aircraftId,
      type,
      status,
      windowStart,
      windowEnd,
      description,
      restriction: str(input.restriction).slice(0, 300),
    },
  }
}

export function validateSignUp(input: Record<string, unknown>): { errors: FieldErrors; value: { name: string; email: string; password: string; role: Role } } {
  const errors: FieldErrors = {}
  const name = str(input.name)
  if (name.length < 2) errors.name = 'Enter your full name.'
  const email = str(input.email).toLowerCase()
  if (!EMAIL.test(email)) errors.email = 'Enter a valid work email.'
  const password = typeof input.password === 'string' ? input.password : ''
  if (password.length < 10) errors.password = 'Use at least 10 characters.'
  else if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) errors.password = 'Include a letter and a number.'
  const requested = str(input.role) as Role
  // Public sign-up only ever creates a Viewer or Dispatcher account; elevated
  // roles are assigned by an administrator inside the console.
  const role: Role = requested === 'dispatcher' ? 'dispatcher' : 'viewer'
  if (requested && !ROLES.includes(requested)) errors.role = 'Choose a valid role.'
  return { errors, value: { name, email, password, role } }
}

export function validateEmail(input: Record<string, unknown>): { errors: FieldErrors; email: string } {
  const email = str(input.email).toLowerCase()
  return { errors: EMAIL.test(email) ? {} : { email: 'Enter a valid email address.' }, email }
}

export const normalizeAssigned = (v: unknown) => bool(v)
