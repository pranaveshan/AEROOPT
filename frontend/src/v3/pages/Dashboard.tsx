import { ratio, percent, seconds, DASH } from '../../lib/format';
import { useRouter } from '../../lib/router';
import { useData } from '../data';
import { AircraftViewer } from '../three/AircraftViewer';
import { Gantt, TaskTable } from '../components';
import { LinkButton, PageHeader, Panel, Skeleton, Tag, Telemetry, EmptyState, toneFor } from '../ui';
import { SolverPanel } from './SolverPanel';
import { viewerStatus } from '../status';

export default function Dashboard() {
  const d = useData();
  const { navigate } = useRouter();
  const m = d.dashboard;
  const recent = m?.recent_run ?? null;
  return (
    <>
      <PageHeader kicker="Console" title="Dashboard" lede="Fleet readiness, today's schedule and the latest solver run, all from the API." />
      <div className="telemetry-rail" aria-label="Key figures">
        <Telemetry label="Serviceable aircraft" value={m ? ratio(m.aircraft.serviceable, m.aircraft.total) : DASH} note={m ? `${m.aircraft.grounded} grounded` : 'Waiting for API'} />
        <Telemetry label="Available personnel" value={m ? ratio(m.personnel.available, m.personnel.total) : DASH} note="Within the configured window" />
        <Telemetry label="Pending tasks" numeric={m?.tasks.pending ?? null} value={DASH} note={m ? `${m.tasks.unassigned} unassigned` : 'Waiting for API'} />
        <Telemetry label="Task completion" value={m ? percent(m.completion_rate) : DASH} note="Completed of active tasks" />
        <Telemetry label="Latest run" value={recent ? <Tag tone={toneFor(recent.status)}>{recent.status}</Tag> : DASH} note={recent ? `${recent.solver} · ${seconds(recent.duration_seconds)}` : 'No run yet: run the optimizer'} />
      </div>
      <div className="dash-grid">
        <Panel kicker={`Schedule version ${m?.schedule_version ?? DASH}`} title="Today's assignments" className="dash-gantt"
          actions={<LinkButton to="/console/schedule" variant="quiet">Open schedule</LinkButton>}>
          {!d.loaded ? <Skeleton rows={5} height={22} /> :
            <Gantt compact aircraft={d.aircraft} schedule={d.schedule} onSelect={a => { d.setSelectedTaskId(a.task_id); navigate('/console/schedule'); }} />}
          <p className="field-hint">Gantt bars open the inspector. The cyan line marks the current UTC time of day on the 24 h horizon. A table version is on the Schedule page.</p>
        </Panel>
        <SolverPanel />
        <Panel kicker="Fleet viewer" title="Aircraft status" className="dash-viewer">
          <AircraftViewer status={viewerStatus(d)} label={`Procedural airliner model. Beacon colour shows solver state: ${viewerStatus(d)}.`} />
          <p className="field-hint">Procedural model, not a specific aircraft. Beacon: cyan = latest run feasible, amber = scenario mode, red = needs attention, grey = no run.</p>
        </Panel>
      </div>
      <Panel kicker="Work queue" title="Active tasks" actions={<LinkButton to="/console/tasks" variant="quiet">All tasks</LinkButton>}>
        {!d.loaded ? <Skeleton rows={6} /> : d.tasks.length === 0 ? <EmptyState title="No tasks" body="Create tasks on the Tasks page." /> :
          <TaskTable tasks={d.tasks.slice(0, 6)} assignments={d.schedule} onSelect={t => { d.setSelectedTaskId(t.id); navigate('/console/schedule'); }} />}
      </Panel>
    </>
  );
}
