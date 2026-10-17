/** Scenario lab: named isolated forks. Same endpoints and payloads as v2's ScenarioLab. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useState } from 'react';
import { request } from '../../api';
import { delta } from '../../lib/format';
import { useData } from '../data';
import { friendlyError } from '../auth';
import { Detail } from '../components';
import { Button, EmptyState, Field, PageHeader, Panel, Table, Tag, toneFor } from '../ui';

export default function Scenarios() {
  const { aircraft, crew, activeScenario, setActiveScenario, refresh } = useData();
  const [kind, setKind] = useState('aircraft_grounded');
  const [resource, setResource] = useState(aircraft[0]?.id ?? '');
  const [until, setUntil] = useState('360');
  const [start, setStart] = useState('600');
  const [finish, setFinish] = useState('720');
  const [solver, setSolver] = useState('greedy');
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [name, setName] = useState('Weathered morning');
  const [scenarios, setScenarios] = useState<any[]>([]);
  const selectedId = activeScenario?.id ?? '';
  const options: { id: string }[] = kind === 'crew_unavailable' ? crew : aircraft;
  useEffect(() => { if (!options.some(x => x.id === resource)) setResource(options[0]?.id ?? ''); }, [kind, resource, options]);

  const refreshScenarios = useCallback(async () => {
    try { const listed = await request<{ scenarios: any[] }>('/scenarios'); setScenarios(listed.scenarios ?? []); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to load scenarios'); }
  }, []);
  useEffect(() => { void refreshScenarios(); }, [refreshScenarios]);
  const selected = scenarios.find(s => s.id === selectedId);
  const select = (s: any | null) => { setActiveScenario(s ? { id: s.id, name: s.name } : null); setResult(null); };

  async function act(fn: () => Promise<void>, fail: string) {
    setBusy(true); setError('');
    try { await fn(); await refreshScenarios(); } catch (e) { setError(friendlyError(e instanceof Error ? e.message : fail)); } finally { setBusy(false); }
  }
  const create = () => act(async () => { const row = await request<any>('/scenarios', { method: 'POST', body: JSON.stringify({ name }) }); setNotice(`Created ${row.id}.`); select(row); }, 'Unable to create scenario');
  const mutate = () => selected && act(async () => {
    const extra = kind === 'crew_unavailable' ? { until: Number(until) } : kind === 'maintenance_extended' ? { start: Number(start), finish: Number(finish) } : {};
    const row = await request<any>(`/scenarios/${selected.id}`, { method: 'PATCH', body: JSON.stringify({ type: kind, resource_id: resource, version: selected.version, ...extra }) });
    setActiveScenario({ id: row.id, name: row.name ?? selected.name }); setNotice('Scenario change saved in isolation.');
  }, 'Scenario change failed');
  const run = () => selected && act(async () => {
    setResult(null);
    const row = await request<any>(`/scenarios/${selected.id}/solve`, { method: 'POST', body: JSON.stringify({ solver }) });
    setResult(row); setNotice(`Solved ${row.id}: ${row.result?.status}.`);
  }, 'Scenario solve failed');
  const discard = () => selected && act(async () => {
    const row = await request<any>(`/scenarios/${selected.id}/discard`, { method: 'POST' });
    setNotice(row.live_snapshot_unchanged ? 'Discarded. Saved data unchanged.' : 'Discarded.'); select(null);
  }, 'Discard failed');
  const apply = () => selected && act(async () => {
    const row = await request<any>(`/scenarios/${selected.id}/apply`, { method: 'POST', body: JSON.stringify({ approved: true, version: selected.version }) });
    setNotice(`Applied scenario ${row.id} to saved data.`); select(null); await refresh();
  }, 'Apply failed');

  const comparison = result?.result?.comparison || selected?.result?.comparison;
  return (
    <>
      <PageHeader kicker="Console · What-if" title="Scenarios" lede="Run isolated what-if schedules. Saved data does not change until you apply a scenario." />
      <Panel kicker="Named forks" title="Scenarios" actions={<Tag tone="warning">Isolated until applied</Tag>}>
        <div className="form-row">
          <Field label="Scenario name"><input value={name} onChange={e => setName(e.target.value)} /></Field>
          <Button variant={selected ? 'ghost' : 'primary'} disabled={busy || !name.trim()} onClick={() => void create()}>{busy ? 'Working…' : 'Create from saved data'}</Button>
        </div>
        {scenarios.length === 0 ? <EmptyState title="No scenarios yet" body="Create one from the current saved snapshot." /> : (
          <Table caption="Scenarios">
            <thead><tr><th>ID</th><th>Name</th><th>Status</th><th>Version</th><th><span className="sr-only">Select</span></th></tr></thead>
            <tbody>{scenarios.map(s => (
              <tr key={s.id} className={s.id === selectedId ? 'row-selected' : ''}>
                <td className="mono">{s.id}</td><td>{s.name}</td><td><Tag tone={toneFor(s.status)}>{s.status}</Tag></td><td className="mono">{s.version}</td>
                <td>{s.id === selectedId ? <span className="mono warn-text">Active</span> : <button className="link-btn" onClick={() => select(s)} aria-label={`Select scenario ${s.name}`}>Select</button>}</td>
              </tr>))}
            </tbody>
          </Table>
        )}
      </Panel>
      {selected && (
        <Panel kicker={`Selected · ${selected.id}`} title={selected.name} className="scenario-panel" actions={<span className="mono muted">v{selected.version} · {selected.status}</span>}>
          <div className="form-grid">
            <Field label="What-if event">
              <select value={kind} onChange={e => setKind(e.target.value)}>
                <option value="aircraft_grounded">Ground aircraft</option><option value="maintenance_extended">Extend maintenance</option><option value="crew_unavailable">Make personnel unavailable</option>
              </select>
            </Field>
            <Field label="Solver"><select value={solver} onChange={e => setSolver(e.target.value)}><option value="greedy">Baseline (deterministic greedy)</option><option value="cp-sat">Optimizer (OR-Tools CP-SAT)</option></select></Field>
            <Field label="Resource"><select value={resource} onChange={e => setResource(e.target.value)}>{options.map(x => <option key={x.id} value={x.id}>{x.id}</option>)}</select></Field>
            {kind === 'crew_unavailable' && <Field label="Availability ends (minutes)"><input type="number" min={0} max={1440} value={until} onChange={e => setUntil(e.target.value)} /></Field>}
            {kind === 'maintenance_extended' && <>
              <Field label="Maintenance start (minutes)"><input type="number" min={0} max={1439} value={start} onChange={e => setStart(e.target.value)} /></Field>
              <Field label="Maintenance finish (minutes)"><input type="number" min={1} max={1440} value={finish} onChange={e => setFinish(e.target.value)} /></Field>
            </>}
          </div>
          <div className="button-row">
            <Button variant="ghost" disabled={busy || selected.status === 'discarded' || selected.status === 'applied'} onClick={() => void mutate()}>Save isolated change</Button>
            <Button variant="primary" disabled={busy || selected.status === 'discarded'} onClick={() => void run()}>{busy ? 'Solving…' : 'Run scenario solve'}</Button>
            <Button variant="ghost" disabled={busy || selected.status === 'applied'} onClick={() => void discard()}>Discard</Button>
            <Button variant="danger" disabled={busy || selected.status !== 'solved'} onClick={() => void apply()}>Apply to saved data</Button>
          </div>
        </Panel>
      )}
      <div aria-live="polite">
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        {notice && <div className="alert alert-success" role="status">{notice}</div>}
      </div>
      {comparison && (
        <Panel kicker="Comparison" title="Saved baseline vs scenario">
          <div className="detail-grid">
            <Detail label="Baseline assigned" value={String(comparison.baseline_assigned)} />
            <Detail label="Scenario assigned" value={String(comparison.scenario_assigned)} />
            <Detail label="Delta" value={delta(comparison.assignment_delta)} />
            <Detail label="Tasks lost" value={(comparison.tasks_lost || []).join(', ') || 'None'} />
          </div>
          <p className="field-hint">Unassigned reasons are solver diagnostics, not proof of infeasibility unless the status is INFEASIBLE.</p>
        </Panel>
      )}
    </>
  );
}
