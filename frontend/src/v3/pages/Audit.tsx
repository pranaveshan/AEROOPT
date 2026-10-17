/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from 'react';
import { request } from '../../api';
import { shortHash, utcTimestamp } from '../../lib/format';
import { Button, EmptyState, PageHeader, Panel, Skeleton, Table, Tag } from '../ui';

export default function Audit() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [result, setResult] = useState<any>(null);
  useEffect(() => { request<any[]>('/audit').then(setRows).catch(() => setRows([])); }, []);
  async function verify() {
    try { setResult(await request('/audit/verify')); } catch (e) { setResult({ valid: false, error: String(e) }); }
  }
  return (
    <>
      <PageHeader kicker="Console · Integrity" title="Audit log" lede="Append-only event chain for data changes and solver activity." />
      <Panel kicker="Integrity check" title="Hash chain" actions={<div className="verify"><Button variant="ghost" size="sm" onClick={() => void verify()}>Verify chain</Button>
        <span aria-live="polite">{result && <Tag tone={result.valid ? 'success' : 'danger'}>{result.valid ? 'Integrity pass' : `Broken at ${result.first_broken_event_id ?? 'unknown'}`}</Tag>}</span></div>}>
        {rows === null ? <Skeleton rows={8} /> : rows.length === 0 ? <EmptyState title="No events" body="Events appear after data changes or solver runs." /> : (
          <Table caption="Audit events">
            <thead><tr><th>ID</th><th>Timestamp (UTC)</th><th>Action</th><th>Entity</th><th>Event hash</th></tr></thead>
            <tbody>{rows.map(r => <tr key={r.id}><td className="mono">{r.id}</td><td className="mono">{utcTimestamp(r.created_at)}</td><td>{r.action}</td><td className="mono">{r.entity_id}</td><td className="mono hash">{shortHash(r.event_hash, 20)}</td></tr>)}</tbody>
          </Table>
        )}
      </Panel>
      <p className="field-hint">A hash chain detects local edits but does not stop a privileged actor from rewriting the whole chain.</p>
    </>
  );
}
