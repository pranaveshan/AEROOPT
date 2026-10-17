import { clock, DASH } from '../../lib/format';
import { useData } from '../data';
import { AssignmentTable, Detail, Gantt } from '../components';
import { Button, Drawer, PageHeader, Panel, Skeleton } from '../ui';
import { SolverPanel } from './SolverPanel';

export default function Schedule() {
  const d = useData();
  const selected = d.schedule.find(a => a.task_id === d.selectedTaskId) ?? null;
  return (
    <>
      <PageHeader kicker="Console · Scheduling" title="Schedule" lede="Assignments over the 24 h planning horizon. Times are minutes from the horizon origin, shown as 24 h clock." />
      <div className="schedule-grid">
        <Panel kicker={`Version ${d.dashboard?.schedule_version ?? DASH} · 00:00–24:00`} title="Assignment Gantt">
          {!d.loaded ? <Skeleton rows={6} height={26} /> : <Gantt aircraft={d.aircraft} schedule={d.schedule} selectedId={selected?.task_id} onSelect={a => d.setSelectedTaskId(a.task_id)} />}
        </Panel>
        <SolverPanel />
      </div>
      <Panel kicker="Accessible alternative" title="Assignment table" actions={<span className="mono muted">{d.schedule.length} records</span>}>
        {!d.loaded ? <Skeleton rows={5} /> : <AssignmentTable schedule={d.schedule} onInspect={a => d.setSelectedTaskId(a.task_id)} />}
      </Panel>
      <Drawer open={!!selected} onClose={() => d.setSelectedTaskId(null)} kicker="Assignment inspector" title={selected?.task_id ?? ''}
        footer={<Button variant="ghost" onClick={() => d.setSelectedTaskId(null)}>Close</Button>}>
        {selected && (
          <>
            <div className="detail-grid">
              <Detail label="Aircraft" value={selected.aircraft_id} />
              <Detail label="Crew" value={selected.crew_id} />
              <Detail label="Start" value={clock(selected.start)} />
              <Detail label="Finish" value={clock(selected.finish)} />
            </div>
            <span className="micro">Why this assignment</span>
            <ul className="explanation">{(selected.explanation ?? ['Eligibility is evaluated by the scheduling engine.']).map(x => <li key={x}>{x}</li>)}</ul>
          </>
        )}
      </Drawer>
    </>
  );
}
