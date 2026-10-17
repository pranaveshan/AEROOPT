import { useData } from './data';
import { Button, Dialog } from './ui';

export function ResourceEditor() {
  const d = useData();
  const e = d.editor;
  return (
    <Dialog open={!!e} onClose={d.closeEditor} kicker="JSON record" title={e ? `${e.item ? 'Edit' : 'Create'} ${e.kind === 'tasks' ? 'task' : e.kind}` : ''}
      footer={<><Button variant="ghost" onClick={d.closeEditor}>Cancel</Button><Button variant="primary" disabled={d.busy} onClick={() => void d.saveResource()}>{d.busy ? 'Saving…' : 'Save record'}</Button></>}>
      <p className="field-hint">Submit a complete API record. The server rejects invalid windows.</p>
      <textarea className="json-editor mono" value={e?.json ?? ''} onChange={x => d.setEditorJson(x.target.value)} aria-label="Record JSON" spellCheck={false} />
      {d.error && <div className="alert alert-error" role="alert">{d.error}</div>}
    </Dialog>
  );
}
