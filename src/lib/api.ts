// Thin API client. Cookies are same-origin; every endpoint returns JSON.
export class ApiError extends Error {
  status: number
  fieldErrors: Record<string, string>
  violations?: { code: string; message: string }[]

  constructor(message: string, status: number, fieldErrors: Record<string, string> = {}, violations?: { code: string; message: string }[]) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.fieldErrors = fieldErrors
    this.violations = violations
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    credentials: 'same-origin',
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  })
  const text = await response.text()
  const payload = text ? (JSON.parse(text) as Record<string, unknown>) : {}
  if (!response.ok) {
    throw new ApiError(
      String(payload.error ?? `Request failed (${response.status})`),
      response.status,
      (payload.fieldErrors as Record<string, string>) ?? {},
      payload.violations as { code: string; message: string }[] | undefined,
    )
  }
  return payload as T
}

export const post = <T,>(path: string, body?: unknown) => api<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) })
export const patch = <T,>(path: string, body: unknown) => api<T>(path, { method: 'PATCH', body: JSON.stringify(body) })
export const put = <T,>(path: string, body: unknown) => api<T>(path, { method: 'PUT', body: JSON.stringify(body) })
export const del = <T,>(path: string) => api<T>(path, { method: 'DELETE' })
