/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from 'react';
import { request } from '../../api';
import { seconds, shortHash, utcTimestamp, DASH, count, delta } from '../../lib/format';
import { useData } from '../data';
import { friendlyError } from '../auth';
import type { RunRow } from '../types';
import { Button, EmptyState, PageHeader, Panel, Skeleton, Table, Tag, Telemetry, toneFor } from '../ui';

export function RunsTable({ runs }: { runs: RunRow[] }) {
  if (!runs.length) return <EmptyState title="No solver runs yet" body="Run the optimizer or the baseline from the Dashboard or Schedule page." />;
  return (
    <Table caption="Executed solver runs">
      <thead><tr><th>Run ID</th><th>Engine</th><th>Status</th><th>Duration</th><th>Started (UTC)</th><th>Input hash</th></tr></thead>
      <tbody>{runs.map(r => (
        <tr key={r.id}><td className="mono">{r.id}</td><td className="mono">{r.solver}</td><td><Tag tone={toneFor(r.status)}>{r.status}</Tag></td>
          <td className="mono">{seconds(Number(r.duration_seconds))}</td><td className="mono">{utcTimestamp(r.created_at)}</td><td className="mono hash">{shortHash(r.input_hash, 18)}</td></tr>
      ))}</tbody>
    </Table>
  );
}

export default function Analytics() {
  const d = useData();
  const recent = d.dashboard?.recent_run;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [spof, setSpof] = useState<any>(null);
  const [stress, setStress] = useState<any>(null);
  useEffect(() => { void d.refreshRuns(); }, [d.refreshRuns]); // eslint-disable-line react-hooks/exhaustive-deps
  async function run(kind: 'spof' | 'stress' | 'compare') {
    setBusy(true); setError('');
    try {
      if (kind === 'spof') setSpof(await request('/analytics/spof', { method: 'POST', body: JSON.stringify({ solver: 'greedy' }) }));
      if (kind === 'stress') setStress(await request('/analytics/stress', { method: 'POST', body: JSON.stringify({ solver: 'greedy' }) }));
      if (kind === 'compare') await d.compareSolvers();
    } catch (e) { setError(friendlyError(e instanceof Error ? e.message : 'Analysis failed')); } finally { setBusy(false); }
  }
  const c = d.comparison?.result;
  return (
    <>
      <PageHeader kicker="Console · Measured outcomes" title="Analytics" lede="Every figure here comes from an executed run. Nothing is estimated or filled in." />
      <div className="telemetry-rail two">
        <Telemetry label="Latest run" value={recent ? <Tag tone={toneFor(recent.status)}>{recent.status}</Tag> : DASH} note={recent?.solver ?? 'Run the baseline or the optimizer'} />
        <Telemetry label="Run duration" value={recent ? seconds(recent.duration_seconds) : DASH} note="Wall-clock measurement" />
      </div>
      <Panel kicker="Synthetic analyses" title="Failure, stress and strategy checks">
        <div className="button-row">
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => void run('spof')}>Single-point failures</Button>
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => void run('stress')}>Stress cases</Button>
          <Button variant="ghost" size="sm" disabled={busy || d.busy} onClick={() => void run('compare')}>Compare solvers</Button>
        </div>
        <div aria-live="polite" className="analysis-out">
          {busy && <p className="field-hint">Running analysis…</p>}
          {error && <div className="alert alert-error" role="alert">{error}</div>}
          {spof && <p>Critical aircraft: <b className="mono">{(spof.critical_aircraft || []).join(', ') || 'none'}</b>. Critical personnel: <b className="mono">{(spof.critical_personnel || []).join(', ') || 'none'}</b>.</p>}
          {stress && <ul className="plain-list">{stress.cases.map((s: any) => <li key={s.name}><span>{s.name}</span> <Tag tone={toneFor(s.status)}>{s.status}</Tag> <span className="mono">{s.assigned} assigned</span></li>)}</ul>}
          {c && <p>Baseline {c.greedy.status} with <b className="mono">{count(c.greedy.assigned)}</b> assigned vs optimizer {c.cp_sat.status} with <b className="mono">{count(c.cp_sat.assigned)}</b> ({c.cp_sat.solver}); difference <b className="mono">{delta(c.cp_sat.assigned - c.greedy.assigned)}</b>. Run at {utcTimestamp(d.comparison?.at)}.</p>}
        </div>
      </Panel>
      <Panel kicker="Run history" title="Executed solver runs">
        {!d.loaded ? <Skeleton rows={5} /> : <RunsTable runs={d.runs} />}
      </Panel>
    </>
  );
}
