/** Fleet and Personnel pages (same list pattern, JSON editors, archive/restore). */
import { useState } from 'react';
import { Plane, Users } from 'lucide-react';
import type { Aircraft, Crew } from '../../api';
import { clock, duration } from '../../lib/format';
import { useData } from '../data';
import { AircraftViewer } from '../three/AircraftViewer';
import { viewerStatus } from '../status';
import { Button, EmptyState, PageHeader, Panel, Skeleton, Table, Tag, toneFor } from '../ui';

const NEW_AIRCRAFT = { id: 'AC-NEW', type: 'Utility', capabilities: [], home_facility: 'NORTH FIELD', status: 'serviceable', available_from: 0, available_until: 1440, max_flight_minutes: 600, used_flight_minutes: 0, turnaround_minutes: 30, maintenance: [], archived: false };
const NEW_CREW = { id: 'CREW-NEW', role: 'Operator', qualifications: [], qualification_expiry: {}, available_from: 0, available_until: 1440, max_duty_minutes: 600, used_duty_minutes: 0, min_rest_minutes: 30, archived: false };
const j = (o: unknown) => JSON.stringify(o, null, 2);

function ArchiveToggle({ show, onToggle }: { show: boolean; onToggle: () => void }) {
  return <Button variant="ghost" size="sm" aria-pressed={show} onClick={onToggle}>{show ? 'Active only' : 'Include archived'}</Button>;
}

export function Fleet() {
  const d = useData();
  const [showArchived, setShowArchived] = useState(false);
  const list: Aircraft[] = showArchived ? d.archivedAircraft : d.aircraft;
  return (
    <>
      <PageHeader kicker="Console · Resources" title="Fleet" lede="Serviceability, capability, flight-hour limits and maintenance windows."
        actions={<><ArchiveToggle show={showArchived} onToggle={() => setShowArchived(v => !v)} /><Button variant="primary" onClick={() => d.openEditor('aircraft', null, j(NEW_AIRCRAFT))}>New aircraft</Button></>} />
      <div className="fleet-grid">
        <Panel kicker={showArchived ? 'Active and archived' : 'Active'} title={`${list.length} aircraft`}>
          {!d.loaded ? <Skeleton rows={5} height={28} /> : list.length === 0 ? <EmptyState title={showArchived ? 'No archived aircraft' : 'No active aircraft'} body="Use New aircraft to add one." /> : (
            <Table caption="Aircraft">
              <thead><tr><th>ID</th><th>Type · base</th><th>Capabilities</th><th>Status</th><th>Flight time left</th><th>Turnaround</th><th>Maintenance</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>{list.map(a => (
                <tr key={a.id}>
                  <td className="mono"><Plane size={14} aria-hidden className="row-icon" />{a.id}</td>
                  <td><span className="cell-main">{a.type}</span><small className="cell-sub">{a.home_facility}</small></td>
                  <td><span className="tag-list">{a.capabilities.length ? a.capabilities.map(c => <Tag key={c}>{c}</Tag>) : <span className="muted">None</span>}</span></td>
                  <td><Tag tone={toneFor(a.status)}>{a.status}</Tag></td>
                  <td className="mono">{duration(a.max_flight_minutes - a.used_flight_minutes)}</td>
                  <td className="mono">{duration(a.turnaround_minutes)}</td>
                  <td className="mono">{a.maintenance?.length ? a.maintenance.map(([s, f]) => `${clock(s)}–${clock(f)}`).join(', ') : 'None'}</td>
                  <td className="row-actions">
                    <button className="link-btn" onClick={() => d.openEditor('aircraft', a, j({ ...a, archived: false }))} aria-label={`Edit ${a.id} as JSON`}>Edit</button>
                    {a.archived
                      ? <button className="link-btn" disabled={d.busy} onClick={() => void d.resourceAction('aircraft', a, 'restore')} aria-label={`Restore ${a.id}`}>Restore</button>
                      : <button className="link-btn danger" disabled={d.busy} onClick={() => void d.resourceAction('aircraft', a, 'archive')} aria-label={`Archive ${a.id}`}>Archive</button>}
                  </td>
                </tr>))}
              </tbody>
            </Table>
          )}
        </Panel>
        <Panel kicker="Viewer" title="Fleet model" className="fleet-viewer">
          <AircraftViewer status={viewerStatus(d)} label="Procedural airliner model; beacon colour reflects the latest solver state." />
          <p className="field-hint">Generic procedural airliner. Records are edited as JSON and persisted by the API.</p>
        </Panel>
      </div>
    </>
  );
}

export function Personnel() {
  const d = useData();
  const [showArchived, setShowArchived] = useState(false);
  const list: Crew[] = showArchived ? d.archivedCrew : d.crew;
  return (
    <>
      <PageHeader kicker="Console · Resources" title="Personnel" lede="Qualifications, availability windows and duty limits."
        actions={<><ArchiveToggle show={showArchived} onToggle={() => setShowArchived(v => !v)} /><Button variant="primary" onClick={() => d.openEditor('personnel', null, j(NEW_CREW))}>New personnel</Button></>} />
      <Panel kicker={showArchived ? 'Active and archived' : 'Active'} title={`${list.length} people`}>
        {!d.loaded ? <Skeleton rows={5} height={28} /> : list.length === 0 ? <EmptyState title={showArchived ? 'No archived personnel' : 'No active personnel'} body="Use New personnel to add someone." /> : (
          <Table caption="Personnel">
            <thead><tr><th>ID</th><th>Role</th><th>Qualifications</th><th>Duty left</th><th>Window</th><th>Min rest</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{list.map(c => (
              <tr key={c.id}>
                <td className="mono"><Users size={14} aria-hidden className="row-icon" />{c.id}</td>
                <td>{c.role}</td>
                <td><span className="tag-list">{c.qualifications.length ? c.qualifications.map(q => <Tag key={q}>{q}</Tag>) : <span className="muted">None</span>}</span></td>
                <td className="mono">{duration(c.max_duty_minutes - c.used_duty_minutes)}</td>
                <td className="mono">{clock(c.available_from)}–{clock(c.available_until)}</td>
                <td className="mono">{duration(c.min_rest_minutes)}</td>
                <td className="row-actions">
                  <button className="link-btn" onClick={() => d.openEditor('personnel', c, j({ ...c, qualification_expiry: c.qualification_expiry ?? {}, archived: false }))} aria-label={`Edit ${c.id} as JSON`}>Edit</button>
                  {c.archived
                    ? <button className="link-btn" disabled={d.busy} onClick={() => void d.resourceAction('personnel', c, 'restore')} aria-label={`Restore ${c.id}`}>Restore</button>
                    : <button className="link-btn danger" disabled={d.busy} onClick={() => void d.resourceAction('personnel', c, 'archive')} aria-label={`Archive ${c.id}`}>Archive</button>}
                </td>
              </tr>))}
            </tbody>
          </Table>
        )}
      </Panel>
    </>
  );
}
