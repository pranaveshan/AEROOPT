import type { Assignment } from '../api';

export type Dashboard = {
  synthetic: boolean;
  schedule_version: string;
  aircraft: { total: number; serviceable: number; grounded: number };
  personnel: { total: number; available: number };
  tasks: { total: number; pending: number; scheduled: number; unassigned: number; completed: number; cancelled: number };
  completion_rate: number;
  recent_run?: { id: string; status: string; solver: string; duration_seconds: number } | null;
  latest_assignments: Assignment[];
};

export type Run = {
  run_id: string;
  status: string;
  solver: string;
  assignments: Assignment[];
  unassigned: Record<string, string[]>;
  objective_components: Record<string, number>;
  wall_time_seconds: number;
  validation: { valid: boolean; errors: string[] };
  approval_required: boolean;
};

export type RunRow = {
  id: string; created_at: string | null; solver: string; status: string;
  duration_seconds: number; input_hash: string; output_hash?: string;
};

export type StrategyResult = {
  status: string; solver: string; assigned: number;
  validation?: { valid: boolean; errors?: string[] };
  objective?: number | null;
  objective_components?: Record<string, number>;
  unassigned?: Record<string, string[]>;
};
export type Comparison = { greedy: StrategyResult; cp_sat: StrategyResult };
export type StoredComparison = { at: string; result: Comparison };

export type EditorKind = 'aircraft' | 'personnel' | 'tasks';
export type EditorState = { kind: EditorKind; item: { id: string } | null; json: string };

export type SolverPhase = 'idle' | 'solving' | 'done' | 'error';
export type Scenario = { id: string; name: string; status: string; version: number; result?: unknown };
