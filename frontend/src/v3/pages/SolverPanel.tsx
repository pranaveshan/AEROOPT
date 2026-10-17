import { useState } from 'react';
import { clock, seconds } from '../../lib/format';
import { useData } from '../data';
import { Button, Panel, Tag, toneFor } from '../ui';

/** Run optimizer (CP-SAT, primary) / Run baseline (greedy, ghost), proposal review and approval. */
export function SolverPanel({ primary = true }: { primary?: boolean }) {
  const { solve, apply, run, busy, phase } = useData();
  const [stability, setStability] = useState(0);
  const approvable = run && (run.status === 'FEASIBLE' || run.status === 'OPTIMAL') && run.validation?.valid;
  return (
    <Panel kicker="Decision engine" title="Schedule solver" className="solver-panel">
      <div className="field">
        <label className="field-label" htmlFor="stability">Stability weight <b className="mono">{stability}</b></label>
        <input id="stability" type="range" min={0} max={10} value={stability} onChange={e => setStability(Number(e.target.value))} aria-describedby="stability-hint" />
        <span className="field-hint" id="stability-hint">Higher values keep more of the current schedule unchanged.</span>
      </div>
      <div className="solver-actions">
        <Button variant={primary ? 'primary' : 'ghost'} disabled={busy} onClick={() => void solve('cp-sat', stability)}>{busy && phase === 'solving' ? 'Solving…' : 'Run optimizer'}</Button>
        <Button variant="ghost" disabled={busy} onClick={() => void solve('greedy', stability)}>Run baseline</Button>
      </div>
      <p className="field-hint">Optimizer: OR-Tools CP-SAT, 5 s limit. Baseline: deterministic greedy. Every proposal is validated and needs your approval.</p>
      <div className="sr-only" aria-live="polite" role="status">
        {phase === 'solving' ? 'Solver running.' : phase === 'done' && run ? `Solver finished: ${run.status}.` : phase === 'error' ? 'Solver failed.' : ''}
      </div>
      {run && (
        <div className="run-result">
          <div className="run-grid">
            <div><span className="micro">Status</span><Tag tone={toneFor(run.status)}>{run.status}</Tag></div>
            <div><span className="micro">Engine</span><b className="mono">{run.solver}</b></div>
            <div><span className="micro">Validation</span><Tag tone={run.validation?.valid ? 'success' : 'warning'}>{run.validation?.valid ? 'Pass' : 'Review'}</Tag></div>
            <div><span className="micro">Wall time</span><b className="mono">{seconds(run.wall_time_seconds)}</b></div>
          </div>
          {run.validation && !run.validation.valid && run.validation.errors?.length > 0 && (
            <ul className="error-list">{run.validation.errors.map(e => <li key={e}>{e}</li>)}</ul>
          )}
          {run.assignments.length > 0 && (
            <div className="proposal">
              <span className="micro">Proposed allocations · not saved yet</span>
              <ul>{run.assignments.map(a => <li key={a.task_id}><b className="mono">{a.task_id}</b><span className="mono">{a.aircraft_id} / {a.crew_id}</span><span className="mono">{clock(a.start)}–{clock(a.finish)}</span></li>)}</ul>
            </div>
          )}
          {Object.keys(run.unassigned ?? {}).length > 0 && (
            <details className="unassigned"><summary>{Object.keys(run.unassigned).length} tasks unassigned: see reasons</summary>
              <ul>{Object.entries(run.unassigned).map(([k, v]) => <li key={k}><b className="mono">{k}</b> {v.join('; ')}</li>)}</ul>
            </details>
          )}
          {approvable && <Button variant="ghost" className="btn-approve" disabled={busy} onClick={() => void apply()}>Approve and apply</Button>}
        </div>
      )}
    </Panel>
  );
}
