import type { ViewerStatus } from './three/AirlinerScene';

/** Derives the 3D beacon state from real data (never decorative). */
export function viewerStatus(d: { activeScenario: unknown; phase: string; dashboard: { recent_run?: { status: string } | null } | null }): ViewerStatus {
  if (d.activeScenario) return 'scenario';
  if (d.phase === 'solving') return 'solving';
  const s = d.dashboard?.recent_run?.status;
  if (!s) return 'idle';
  if (s === 'OPTIMAL' || s === 'FEASIBLE') return 'live';
  return 'attention';
}
