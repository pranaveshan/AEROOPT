/**
 * v3 data layer. Mirrors the original App's fetches and actions exactly (same endpoints,
 * same payloads) but keeps previous data while revalidating so tables never blank.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { request, type Aircraft, type Assignment, type Crew, type Task } from '../api';
import { friendlyError, useAuth, type Role } from './auth';
import type { Comparison, Dashboard, EditorState, EditorKind, Run, RunRow, Scenario, SolverPhase, StoredComparison } from './types';

const COMPARE_KEY = 'aeroopt_last_comparison';
const SCENARIO_KEY = 'aeroopt_active_scenario';

type DataCtx = {
  loaded: boolean; refreshing: boolean; apiOnline: boolean | null;
  dashboard: Dashboard | null; aircraft: Aircraft[]; archivedAircraft: Aircraft[];
  crew: Crew[]; archivedCrew: Crew[]; tasks: Task[]; schedule: Assignment[];
  runs: RunRow[]; run: Run | null; busy: boolean; phase: SolverPhase;
  error: string; notice: string; comparison: StoredComparison | null;
  activeScenario: Pick<Scenario, 'id' | 'name'> | null;
  editor: EditorState | null;
  setError: (s: string) => void; setNotice: (s: string) => void;
  refresh: () => Promise<void>; refreshRuns: () => Promise<void>;
  solve: (solver: 'cp-sat' | 'greedy', stability: number) => Promise<void>;
  apply: () => Promise<void>;
  openEditor: (kind: EditorKind, item: { id: string } | null, json: string) => void;
  setEditorJson: (json: string) => void; closeEditor: () => void;
  saveResource: () => Promise<void>;
  resourceAction: (kind: EditorKind, item: { id: string }, action: 'archive' | 'restore' | 'cancel') => Promise<void>;
  compareSolvers: () => Promise<void>;
  setActiveScenario: (s: Pick<Scenario, 'id' | 'name'> | null) => void;
  selectedTaskId: string | null; setSelectedTaskId: (id: string | null) => void;
};

const Ctx = createContext<DataCtx | null>(null);

function readJSON<T>(store: Storage, key: string): T | null {
  try { const v = store.getItem(key); return v ? (JSON.parse(v) as T) : null; } catch { return null; }
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [aircraft, setAircraft] = useState<Aircraft[]>([]);
  const [archivedAircraft, setArchivedAircraft] = useState<Aircraft[]>([]);
  const [crew, setCrew] = useState<Crew[]>([]);
  const [archivedCrew, setArchivedCrew] = useState<Crew[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [schedule, setSchedule] = useState<Assignment[]>([]);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [run, setRun] = useState<Run | null>(null);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<SolverPhase>('idle');
  const [error, setErrorRaw] = useState('');
  const setError = useCallback((m: string) => setErrorRaw(m ? friendlyError(m) : ''), []);
  const { can, session } = useAuth();
  const denied = useCallback((need: Role) => {
    if (can(need)) return false;
    setErrorRaw(`Your role (${session?.role}) cannot do this. Sign in as ${need === 'admin' ? 'an admin' : 'a planner or admin'}.`);
    return true;
  }, [can, session]);
  const [notice, setNotice] = useState('');
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [comparison, setComparison] = useState<StoredComparison | null>(() => readJSON(localStorage, COMPARE_KEY));
  const [activeScenario, setActive] = useState<Pick<Scenario, 'id' | 'name'> | null>(() => readJSON(sessionStorage, SCENARIO_KEY));
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const mounted = useRef(true);

  const refreshRuns = useCallback(async () => {
    try { setRuns(await request<RunRow[]>('/runs')); } catch { /* keep previous rows */ }
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const [d, a, aa, c, ac, t, s] = await Promise.all([
        request<Dashboard>('/dashboard'),
        request<Aircraft[]>('/aircraft'),
        request<Aircraft[]>('/aircraft?include_archived=true'),
        request<Crew[]>('/personnel'),
        request<Crew[]>('/personnel?include_archived=true'),
        request<Task[]>('/tasks'),
        request<{ assignments: Assignment[] }>('/schedule'),
      ]);
      if (!mounted.current) return;
      setDashboard(d); setAircraft(a); setArchivedAircraft(aa); setCrew(c); setArchivedCrew(ac); setTasks(t);
      setSchedule(s.assignments ?? []); setApiOnline(true);
      void refreshRuns();
    } catch (e) {
      setApiOnline(false);
      setError(e instanceof Error ? `Could not load data: ${e.message}. Check that the API is running, then refresh.` : 'API unavailable');
    } finally {
      setLoaded(true); setRefreshing(false);
    }
  }, [refreshRuns, setError]);

  useEffect(() => { mounted.current = true; void refresh(); return () => { mounted.current = false; }; }, [refresh]);
  // Reload when the signed-in user changes (roles can change what the API returns or allows).
  const who = session?.username ?? '';
  const firstWho = useRef(who);
  useEffect(() => { if (who !== firstWho.current) { firstWho.current = who; setErrorRaw(''); void refresh(); } }, [who, refresh]);

  const solve = useCallback(async (solver: 'cp-sat' | 'greedy', stability: number) => {
    if (denied('planner')) return;
    setBusy(true); setPhase('solving'); setError(''); setNotice('');
    try {
      const r = await request<Run>('/schedule/solve', { method: 'POST', body: JSON.stringify({ solver, time_limit_seconds: 5, stability_weight: stability }) });
      setNotice(`Run ${r.run_id}: ${r.status}. The proposal is not saved until you approve it.`);
      await refresh();
      setRun(r); setSchedule(r.assignments ?? []); setPhase('done');
    } catch (e) {
      setPhase('error');
      setError(e instanceof Error ? `Solve failed: ${e.message}` : 'Solve failed');
    } finally { setBusy(false); }
  }, [refresh, denied, setError]);

  const apply = useCallback(async () => {
    if (!run || denied('planner')) return;
    setBusy(true);
    try {
      const r = await request<{ applied: boolean; assignments: number }>('/schedule/apply', { method: 'POST', body: JSON.stringify({ run_id: run.run_id, approved: true }) });
      setNotice(`Approved schedule saved: ${r.assignments} assignments.`);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? `Apply failed: ${e.message}` : 'Apply failed');
    } finally { setBusy(false); }
  }, [run, refresh, denied, setError]);

  const saveResource = useCallback(async () => {
    if (!editor || denied('admin')) return;
    setBusy(true); setError('');
    try {
      const payload = JSON.parse(editor.json);
      const endpoint = editor.kind === 'personnel' ? '/personnel' : `/${editor.kind}`;
      await request(endpoint + (editor.item ? `/${encodeURIComponent(editor.item.id)}` : ''), { method: editor.item ? 'PUT' : 'POST', body: JSON.stringify(payload) });
      const label = editor.kind === 'personnel' ? 'Personnel' : editor.kind === 'tasks' ? 'Task' : 'Aircraft';
      setNotice(`${label} ${editor.item ? 'updated' : 'created'}.`);
      setEditor(null);
      await refresh();
    } catch (e) {
      setError(e instanceof SyntaxError ? `The JSON is not valid: ${e.message}. Fix it and save again.` : e instanceof Error ? e.message : 'Unable to save the record');
    } finally { setBusy(false); }
  }, [editor, refresh, denied, setError]);

  const resourceAction = useCallback(async (kind: EditorKind, item: { id: string }, action: 'archive' | 'restore' | 'cancel') => {
    if (denied('admin')) return;
    setBusy(true); setError('');
    try {
      const base = kind === 'personnel' ? '/personnel' : `/${kind}`;
      const suffix = action === 'cancel' ? '/cancel' : action === 'restore' ? '/restore' : '';
      await request(`${base}/${encodeURIComponent(item.id)}${suffix}`, { method: action === 'archive' ? 'DELETE' : 'POST', ...(action === 'cancel' ? { body: JSON.stringify({}) } : {}) });
      setNotice(`${item.id}: ${action} done.`);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
    } finally { setBusy(false); }
  }, [refresh, denied, setError]);

  const compareSolvers = useCallback(async () => {
    if (denied('planner')) return;
    setBusy(true); setError('');
    try {
      const result = await request<Comparison>('/analytics/compare-solvers', { method: 'POST', body: JSON.stringify({ time_limit_seconds: 5 }) });
      const stored = { at: new Date().toISOString(), result };
      setComparison(stored);
      try { localStorage.setItem(COMPARE_KEY, JSON.stringify(stored)); } catch { /* ignore */ }
    } catch (e) {
      setError(e instanceof Error ? `Comparison failed: ${e.message}` : 'Comparison failed');
    } finally { setBusy(false); }
  }, [denied, setError]);

  const setActiveScenario = useCallback((s: Pick<Scenario, 'id' | 'name'> | null) => {
    setActive(s);
    try { if (s) sessionStorage.setItem(SCENARIO_KEY, JSON.stringify(s)); else sessionStorage.removeItem(SCENARIO_KEY); } catch { /* ignore */ }
  }, []);

  const value = useMemo<DataCtx>(() => ({
    loaded, refreshing, apiOnline, dashboard, aircraft, archivedAircraft, crew, archivedCrew, tasks, schedule, runs, run, busy, phase,
    error, notice, comparison, activeScenario, editor, setError, setNotice, refresh, refreshRuns, solve, apply,
    openEditor: (kind, item, json) => { setError(''); setEditor({ kind, item, json }); },
    setEditorJson: json => setEditor(e => (e ? { ...e, json } : e)),
    closeEditor: () => setEditor(null),
    saveResource, resourceAction, compareSolvers, setActiveScenario, selectedTaskId, setSelectedTaskId,
  }), [selectedTaskId, loaded, refreshing, apiOnline, dashboard, aircraft, archivedAircraft, crew, archivedCrew, tasks, schedule, runs, run, busy, phase, error, notice, comparison, activeScenario, editor, refresh, refreshRuns, solve, apply, saveResource, resourceAction, compareSolvers, setActiveScenario, setError]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useData(): DataCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useData must be used inside <DataProvider>');
  return v;
}
