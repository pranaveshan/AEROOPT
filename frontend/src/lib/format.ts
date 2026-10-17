/**
 * Shared display formatting. Every formatter returns "—" for missing input
 * so that empty data never looks like a real measurement.
 */
export const DASH = '—';

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Minutes → "27 h 15 min", "45 min", "3 h". */
export function duration(minutes: number | null | undefined): string {
  if (!isNum(minutes)) return DASH;
  const m = Math.round(Math.abs(minutes));
  const h = Math.floor(m / 60);
  const r = m % 60;
  const sign = minutes < 0 ? '−' : '';
  if (h === 0) return `${sign}${r} min`;
  return r === 0 ? `${sign}${h} h` : `${sign}${h} h ${r} min`;
}

/** Horizon minutes → 24 h clock "08:30". Minutes past the first day get a "+1d" suffix. */
export function clock(minutes: number | null | undefined): string {
  if (!isNum(minutes)) return DASH;
  const m = Math.max(0, Math.round(minutes));
  const day = Math.floor(m / 1440);
  const inDay = m % 1440;
  const hh = String(Math.floor(inDay / 60)).padStart(2, '0');
  const mm = String(inDay % 60).padStart(2, '0');
  return day > 0 && inDay === 0 && day === 1 ? '24:00' : `${hh}:${mm}${day > 0 ? ` +${day}d` : ''}`;
}

/** Window "08:00–09:30". */
export function window_(start: number | null | undefined, finish: number | null | undefined): string {
  if (!isNum(start) || !isNum(finish)) return DASH;
  return `${clock(start)}–${clock(finish)}`;
}

/** "$9,773" */
export function currency(v: number | null | undefined): string {
  if (!isNum(v)) return DASH;
  return `${v < 0 ? '−' : ''}$${Math.round(Math.abs(v)).toLocaleString('en-US')}`;
}

/** "14.4%" */
export function percent(v: number | null | undefined, digits = 1): string {
  if (!isNum(v)) return DASH;
  return `${v.toFixed(digits).replace(/\.0+$/, '')}%`;
}

/** "1,204" */
export function count(v: number | null | undefined): string {
  if (!isNum(v)) return DASH;
  return v.toLocaleString('en-US');
}

/** Wall-clock seconds "0.142 s" */
export function seconds(v: number | null | undefined, digits = 3): string {
  if (!isNum(v)) return DASH;
  return `${v.toFixed(digits)} s`;
}

/** "3/8" ratio */
export function ratio(a: number | null | undefined, b: number | null | undefined): string {
  if (!isNum(a) || !isNum(b)) return DASH;
  return `${a}/${b}`;
}

/** Date → "14:05:09 UTC" */
export function utcClock(d: Date): string {
  return `${d.toISOString().slice(11, 19)} UTC`;
}

/** ISO timestamp → "2026-10-14 15:36:02 UTC" */
export function utcTimestamp(iso: string | null | undefined): string {
  if (!iso) return DASH;
  const d = new Date(iso.endsWith('Z') || /[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`);
  if (Number.isNaN(d.getTime())) return DASH;
  return `${d.toISOString().slice(0, 19).replace('T', ' ')} UTC`;
}

/** Signed delta "+2", "−1", "0" */
export function delta(v: number | null | undefined): string {
  if (!isNum(v)) return DASH;
  return v > 0 ? `+${v}` : v < 0 ? `−${Math.abs(v)}` : '0';
}

/** Short hash "a3f9c1…" */
export function shortHash(h: string | null | undefined, n = 12): string {
  if (!h) return DASH;
  return h.length > n ? `${h.slice(0, n)}…` : h;
}
