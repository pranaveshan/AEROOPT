// Password hashing, token generation and constant-time comparison on WebCrypto
// (available in workerd and Node 24).
const encoder = new TextEncoder()

const toHex = (buffer: ArrayBuffer): string =>
  [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('')

const fromHex = (hex: string): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(new ArrayBuffer(hex.length / 2))
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

export const randomId = (prefix = ''): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(9))
  return `${prefix}${toHex(bytes.buffer)}`
}

export const randomToken = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function sha256(value: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', encoder.encode(value)))
}

/**
 * Workerd rejects PBKDF2 above 100,000 iterations, so that is the platform
 * maximum rather than a free choice. The count is stored with the hash
 * (`iterations:salt:hash`) so a future change can be verified per record.
 */
export const PBKDF2_ITERATIONS = 100_000

/** Returns `iterations:salt:hash`, all hex except the iteration count. */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' }, key, 256)
  return `${PBKDF2_ITERATIONS}:${toHex(salt.buffer)}:${toHex(bits)}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(':')
  // Legacy records were stored as `salt:hash` at 150k iterations.
  const legacy = parts.length === 2
  const saltHex = legacy ? parts[0] : parts[1]
  const hashHex = legacy ? parts[1] : parts[2]
  const requested = legacy ? 150_000 : Number(parts[0])
  if (!saltHex || !hashHex) return false
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
  const derive = async (iterations: number) =>
    toHex(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: fromHex(saltHex), iterations, hash: 'SHA-256' }, key, 256))
  let derived: string
  try {
    derived = await derive(Number.isFinite(requested) && requested > 0 ? requested : PBKDF2_ITERATIONS)
  } catch {
    // Workerd rejects counts above its platform ceiling.
    derived = await derive(PBKDF2_ITERATIONS)
  }
  return timingSafeEqual(derived, hashHex)
}

/** Compares two strings without leaking length or content through timing. */
export function timingSafeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length)
  let diff = a.length ^ b.length
  for (let i = 0; i < len; i += 1) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  }
  return diff === 0
}
