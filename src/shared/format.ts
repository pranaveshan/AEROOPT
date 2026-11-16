// Formatting helpers for the console. Every timestamp from the API is UTC.
export const OPERATIONAL_TZ = 'UTC'

export const isoToLocalInput = (iso: string): string => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 16)
}

export const inputToIso = (value: string): string => {
  if (!value) return ''
  const d = new Date(`${value}Z`)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString()
}

export const formatTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })

export const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })

export const formatDateTime = (iso: string): string => `${formatDate(iso)} · ${formatTime(iso)}`

export const formatDuration = (minutes: number): string => {
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  if (!h) return `${m}m`
  return m ? `${h}h ${m.toString().padStart(2, '0')}m` : `${h}h`
}

export const formatKg = (value: number): string => `${value.toLocaleString('en-GB')} kg`

export const formatPercent = (value: number, digits = 0): string => `${(value * 100).toFixed(digits)}%`

export const relativeTime = (iso: string): string => {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.round(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  return `${days} d ago`
}
