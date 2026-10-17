/**
 * Session state for v3. The token lives where api.ts already keeps it (localStorage "aeroopt_token");
 * the username/role/expiry are read from the signed token payload (display only: the server verifies it).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getApiToken, request, setApiToken } from '../api';

export type Role = 'viewer' | 'planner' | 'admin';
export type Session = { username: string; role: Role; exp: number };
const RANK: Record<Role, number> = { viewer: 0, planner: 1, admin: 2 };

export function decodeSession(token: string): Session | null {
  try {
    const raw = token.split('.')[0];
    if (!raw || !token.includes('.')) return null;
    const json = JSON.parse(atob(raw.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (raw.length % 4)) % 4)));
    if (!json.sub || !(json.role in RANK) || typeof json.exp !== 'number') return null;
    if (json.exp * 1000 < Date.now()) return null;
    return { username: String(json.sub), role: json.role, exp: json.exp };
  } catch { return null; }
}

type AuthCtx = {
  session: Session | null;
  login: (username: string, password: string) => Promise<Session>;
  register: (v: { username: string; email: string; password: string }) => Promise<Session>;
  logout: () => void;
  /** Client-side hint only; the API enforces roles when access control is configured. */
  can: (required: Role) => boolean;
};
const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => decodeSession(getApiToken()));
  // Drop the session when the token expires.
  useEffect(() => {
    if (!session) return;
    const ms = session.exp * 1000 - Date.now();
    const id = setTimeout(() => { setApiToken(''); setSession(null); }, Math.max(0, Math.min(ms, 2 ** 31 - 1)));
    return () => clearTimeout(id);
  }, [session]);
  // Keep tabs in sync.
  useEffect(() => {
    const on = (e: StorageEvent) => { if (e.key === 'aeroopt_token') setSession(decodeSession(e.newValue ?? '')); };
    window.addEventListener('storage', on);
    return () => window.removeEventListener('storage', on);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const body = await request<{ access_token: string; role: Role; username?: string }>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
    setApiToken(body.access_token);
    const s = decodeSession(body.access_token) ?? { username: body.username ?? username, role: body.role, exp: Date.now() / 1000 + 3600 };
    setSession(s);
    return s;
  }, []);
  const register = useCallback(async (v: { username: string; email: string; password: string }) => {
    await request('/auth/register', { method: 'POST', body: JSON.stringify(v) });
    return login(v.username, v.password);
  }, [login]);
  const logout = useCallback(() => { setApiToken(''); setSession(null); }, []);
  const can = useCallback((required: Role) => !session || RANK[session.role] >= RANK[required], [session]);
  const value = useMemo(() => ({ session, login, register, logout, can }), [session, login, register, logout, can]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside <AuthProvider>');
  return v;
}

/** Turns raw API auth errors into something actionable. */
export function friendlyError(msg: string): string {
  if (/Valid bearer token required|Token expired/i.test(msg)) return 'You need to sign in for this. Go to Sign in, then try again.';
  if (/Insufficient role/i.test(msg)) return 'Your account role does not allow this action. Sign in as a planner or admin.';
  return msg;
}
