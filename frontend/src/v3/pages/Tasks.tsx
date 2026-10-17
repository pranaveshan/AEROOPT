import { useState } from 'react';
import type { Task } from '../../api';
import { duration, window_ } from '../../lib/format';
import { useRouter } from '../../lib/router';
import { useData } from '../data';
import { Button, EmptyState, Field, PageHeader, Panel, Skeleton, Table, Tag, toneFor } from '../ui';

const NEW_TASK = { id: 'TASK-NEW', title: 'New task', category: 'Training and evaluation', priority: 3, release: 0, earliest_start: 0, latest_finish: 1440, duration: 60, capabilities: [], qualifications: [], dependencies: [], support_units: 1, status: 'pending', previous_aircraft_id: null, archived: false };

export default function Tasks() {
  const d = useData();
  const { navigate } = useRouter();
  const [filter, setFilter] = useState('all');
  const list = d.tasks.filter(t => filter === 'all' || t.status === filter);
  const edit = (t: Task) => d.openEditor('tasks', t, JSON.stringify({ ...t, previous_aircraft_id: (t as Task & { previous_aircraft_id?: string | null }).previous_aircraft_id ?? null, archived: false }, null, 2));
  return (
    <>
      <PageHeader kicker="Console · Work" title="Tasks" lede="Priority, release windows, duration and dependencies. Times are minutes from the horizon start."
        actions={<Button variant="primary" onClick={() => d.openEditor('tasks', null, JSON.stringify(NEW_TASK, null, 2))}>New task</Button>} />
      <div className="toolbar">
        <Field label="Filter by status">
          <select value={filter} onChange={e => setFilter(e.target.value)}>
            <option value="all">All statuses</option><option value="pending">Pending</option><option value="scheduled">Scheduled</option><option value="cancelled">Cancelled</option>
          </select>
        </Field>
        <span className="mono muted" aria-live="polite">{list.length} tasks</span>
      </div>
      <Panel title="Task register">
        {!d.loaded ? <Skeleton rows={8} /> : list.length === 0 ? <EmptyState title="No tasks match" body="Change the filter or add a task." /> : (
          <Table caption="Task register">
            <thead><tr><th>ID</th><th>Task</th><th>Priority</th><th>Window</th><th>Duration</th><th>Depends on</th><th>Assignment</th><th>State</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{list.map(t => {
              const a = d.schedule.find(x => x.task_id === t.id);
              return (
                <tr key={t.id}>
                  <td className="mono">{t.id}</td>
                  <td><span className="cell-main">{t.title}</span><small className="cell-sub">{t.category}</small></td>
                  <td><span className={`prio prio-${t.priority}`}>P{t.priority}</span></td>
                  <td className="mono">{window_(t.earliest_start, t.latest_finish)}</td>
                  <td className="mono">{duration(t.duration)}</td>
                  <td className="mono">{t.dependencies.length ? t.dependencies.join(', ') : 'None'}</td>
                  <td>{a ? <button className="link-btn mono" onClick={() => { d.setSelectedTaskId(t.id); navigate('/console/schedule'); }} aria-label={`View ${t.id} on schedule`}>{a.aircraft_id}</button> : <span className="muted">Unassigned</span>}</td>
                  <td><Tag tone={toneFor(a ? 'scheduled' : t.status)}>{a ? 'Scheduled' : t.status}</Tag></td>
                  <td className="row-actions">
                    <button className="link-btn" onClick={() => edit(t)} aria-label={`Edit ${t.id} as JSON`}>Edit</button>
                    {t.status !== 'cancelled' && <button className="link-btn danger" disabled={d.busy} onClick={() => void d.resourceAction('tasks', t, 'cancel')} aria-label={`Cancel task ${t.id}`}>Cancel task</button>}
                  </td>
                </tr>
              );
            })}</tbody>
          </Table>
        )}
      </Panel>
    </>
  );
}
