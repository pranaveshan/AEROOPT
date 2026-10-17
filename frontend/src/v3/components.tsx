import { useEffect, useState } from 'react';
import type { Aircraft, Assignment, Task } from '../api';
import { clock, window_ } from '../lib/format';
import { Table, Tag, toneFor, EmptyState, LinkButton } from './ui';

const HOURS = [0, 4, 8, 12, 16, 20, 24];

/** Current UTC minute of day, ticking each minute. Used for the Gantt reference line. */
export function useUtcMinute(): number {
  const [m, setM] = useState(() => { const d = new Date(); return d.getUTCHours() * 60 + d.getUTCMinutes(); });
  useEffect(() => {
    const id = setInterval(() => { const d = new Date(); setM(d.getUTCHours() * 60 + d.getUTCMinutes()); }, 30_000);
    return () => clearInterval(id);
  }, []);
  return m;
}

/**
 * Assignment Gantt: one row per aircraft over the 24 h horizon. Bars are buttons (keyboard reachable);
 * the accessible table alternative is rendered by the page beside it.
 */
export function Gantt({ aircraft, schedule, selectedId, onSelect, compact = false }: {
  aircraft: Aircraft[]; schedule: Assignment[]; selectedId?: string; onSelect?: (a: Assignment) => void; compact?: boolean;
}) {
  const now = useUtcMinute();
  const rows = aircraft.length ? aircraft.map(a => ({ id: a.id, sub: a.type })) :
    Array.from(new Set(schedule.map(s => s.aircraft_id))).map(id => ({ id, sub: '' }));
  if (!rows.length) return <EmptyState title="No aircraft or assignments yet" body="Add aircraft in Fleet, then run the optimizer to build a schedule." action={<LinkButton to="/console/fleet">Open Fleet</LinkButton>} />;
  return (
    <div className={`gantt ${compact ? 'gantt-compact' : ''}`} role="group" aria-label="Assignment Gantt chart, 00:00 to 24:00">
      <div className="gantt-axis" aria-hidden>
        <span className="gantt-label micro">Aircraft</span>
        <div className="gantt-scale">{HOURS.map(h => <span key={h} style={{ left: `${(h / 24) * 100}%` }}>{String(h).padStart(2, '0')}:00</span>)}</div>
      </div>
      {rows.map(r => {
        const bars = schedule.filter(s => s.aircraft_id === r.id);
        return (
          <div className="gantt-row" key={r.id}>
            <span className="gantt-label"><span className="mono">{r.id}</span>{r.sub && <small>{r.sub}</small>}</span>
            <div className="gantt-track">
              {HOURS.map(h => <i key={h} style={{ left: `${(h / 24) * 100}%` }} aria-hidden />)}
              {bars.map(s => (
                onSelect ? <button
                  key={s.task_id}
                  className={`gantt-bar ${selectedId === s.task_id ? 'selected' : ''}`}
                  style={{ left: `${(s.start / 1440) * 100}%`, width: `${Math.max(0.6, ((s.finish - s.start) / 1440) * 100)}%` }}
                  onClick={() => onSelect?.(s)}
                  aria-label={`${s.task_id} on ${s.aircraft_id} with ${s.crew_id}, ${window_(s.start, s.finish)}`}
                  title={`${s.task_id} · ${window_(s.start, s.finish)}`}
                >
                  <span className="mono">{s.task_id}</span>
                </button> : (
                  <span key={s.task_id} className="gantt-bar static" style={{ left: `${(s.start / 1440) * 100}%`, width: `${Math.max(0.6, ((s.finish - s.start) / 1440) * 100)}%` }}
                    title={`${s.task_id} · ${window_(s.start, s.finish)}`}><span className="mono">{s.task_id}</span></span>
                )
              ))}
            </div>
          </div>
        );
      })}
      <div className="gantt-now-layer" aria-hidden>
        <span className="gantt-now" style={{ left: `${(now / 1440) * 100}%` }}><b className="mono">{clock(now)} UTC</b></span>
      </div>
    </div>
  );
}

export function AssignmentTable({ schedule, onInspect }: { schedule: Assignment[]; onInspect?: (a: Assignment) => void }) {
  if (!schedule.length) return <EmptyState title="No assignments" body="Run the optimizer or the baseline to create a proposal." />;
  return (
    <Table caption="Assignments (table alternative to the Gantt chart)">
      <thead><tr><th>Task</th><th>Aircraft</th><th>Crew</th><th>Start</th><th>Finish</th><th><span className="sr-only">Actions</span></th></tr></thead>
      <tbody>
        {schedule.map(a => (
          <tr key={a.task_id}>
            <td className="mono">{a.task_id}</td><td className="mono">{a.aircraft_id}</td><td className="mono">{a.crew_id}</td>
            <td className="mono">{clock(a.start)}</td><td className="mono">{clock(a.finish)}</td>
            <td>{onInspect && <button className="link-btn" onClick={() => onInspect(a)} aria-label={`Inspect ${a.task_id}`}>Inspect</button>}</td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

export function TaskTable({ tasks, assignments, onSelect }: { tasks: Task[]; assignments: Assignment[]; onSelect: (t: Task) => void }) {
  if (!tasks.length) return <EmptyState title="No tasks match" body="Change the filter or add a task." />;
  return (
    <Table caption="Tasks">
      <thead><tr><th>ID</th><th>Task</th><th>Priority</th><th>Window</th><th>Assignment</th><th>State</th></tr></thead>
      <tbody>
        {tasks.map(t => {
          const a = assignments.find(x => x.task_id === t.id);
          return (
            <tr key={t.id}>
              <td className="mono">{t.id}</td>
              <td><span className="cell-main">{t.title}</span><small className="cell-sub">{t.category}</small></td>
              <td><span className={`prio prio-${t.priority}`}>P{t.priority}</span></td>
              <td className="mono">{window_(t.earliest_start, t.latest_finish)}</td>
              <td>{a ? <button className="link-btn mono" onClick={() => onSelect(t)} aria-label={`View ${t.id} on schedule (${a.aircraft_id})`}>{a.aircraft_id}</button> : <span className="muted">Unassigned</span>}</td>
              <td><Tag tone={toneFor(a ? 'scheduled' : t.status)}>{a ? 'Scheduled' : t.status}</Tag></td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}

/** Small label/value pair. */
export function Detail({ label, value }: { label: string; value: string }) {
  return <div className="detail"><span className="micro">{label}</span><b className="mono">{value}</b></div>;
}
