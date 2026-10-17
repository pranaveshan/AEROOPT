import { useEffect, useState } from 'react';
import { request } from '../../api';
import { count, delta, seconds, utcTimestamp, DASH } from '../../lib/format';
import { useData } from '../data';
import { Button, EmptyState, PageHeader, Panel, Table, Tag, toneFor } from '../ui';

type BenchInfo = { status: string; synthetic: boolean; message: string };

export default function Benchmarks() {
  const d = useData();
  const [info, setInfo] = useState<BenchInfo | null>(null);
  useEffect(() => { request<BenchInfo>('/analytics/benchmarks').then(setInfo).catch(() => setInfo(null)); }, []);
  const c = d.comparison?.result;
  const bySolver = (s: string) => d.runs.filter(r => r.solver.toLowerCase().includes(s));
  const summary = (s: string) => {
    const rs = bySolver(s);
    if (!rs.length) return null;
    const avg = rs.reduce((a, r) => a + Number(r.duration_seconds), 0) / rs.length;
    return { n: rs.length, avg, last: rs[0] };
  };
  const g = summary('greedy'), o = summary('cp');
  return (
    <>
      <PageHeader kicker="Console · Benchmarks" title="Benchmarks" lede="Optimizer (CP-SAT) against the greedy baseline on the current saved data."
        actions={<Button variant="primary" disabled={d.busy} onClick={() => void d.compareSolvers()}>{d.busy ? 'Comparing…' : 'Run comparison'}</Button>} />
      <Panel kicker={d.comparison ? `Last comparison · ${utcTimestamp(d.comparison.at)}` : 'Strategy comparison'} title="Optimizer vs baseline">
        {!c ? <EmptyState title="No comparison yet" body="Run comparison solves both engines on the saved data (CP-SAT has a 5 s limit). Results are kept in this browser." /> : (
          <Table caption="Optimizer vs baseline">
            <thead><tr><th>Engine</th><th>Status</th><th>Assigned tasks</th><th>Unassigned</th><th>Validation</th><th>Objective</th></tr></thead>
            <tbody>
              {([['Baseline', c.greedy], ['Optimizer', c.cp_sat]] as const).map(([label, r]) => (
                <tr key={label}><td><span className="cell-main">{label}</span><small className="cell-sub mono">{r.solver}</small></td><td><Tag tone={toneFor(r.status)}>{r.status}</Tag></td>
                  <td className="mono">{count(r.assigned)}</td><td className="mono">{count(Object.keys(r.unassigned ?? {}).length)}</td>
                  <td>{r.validation ? <Tag tone={r.validation.valid ? 'success' : 'warning'}>{r.validation.valid ? 'Pass' : 'Review'}</Tag> : DASH}</td>
                  <td className="mono">{typeof r.objective === 'number' ? count(r.objective) : DASH}</td></tr>
              ))}
              <tr className="row-total"><td>Difference</td><td /><td className="mono">{delta(c.cp_sat.assigned - c.greedy.assigned)}</td><td /><td /><td /></tr>
            </tbody>
          </Table>
        )}
      </Panel>
      <Panel kicker="From run history (last 50 runs)" title="Wall time by engine">
        {!g && !o ? <EmptyState title="No runs recorded" body="Run the optimizer and the baseline to populate this table." /> : (
          <Table caption="Wall time by engine">
            <thead><tr><th>Engine</th><th>Runs</th><th>Mean wall time</th><th>Latest status</th></tr></thead>
            <tbody>{([['Baseline (greedy)', g], ['Optimizer (CP-SAT)', o]] as const).map(([l, s]) => (
              <tr key={l}><td>{l}</td><td className="mono">{s ? s.n : DASH}</td><td className="mono">{s ? seconds(s.avg) : DASH}</td><td>{s ? <Tag tone={toneFor(s.last.status)}>{s.last.status}</Tag> : DASH}</td></tr>
            ))}</tbody>
          </Table>
        )}
      </Panel>
      <Panel kicker="Offline suite" title="Benchmark scripts">
        <p>{info ? info.message : 'Benchmark information is unavailable: the API did not respond.'}</p>
      </Panel>
    </>
  );
}
