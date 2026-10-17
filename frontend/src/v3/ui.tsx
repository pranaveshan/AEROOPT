/** v3 base components. Styling lives in styles/v3.css; tokens in styles/tokens-v3.css. */
import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { DASH } from '../lib/format';
import { useTweenedNumber } from '../lib/motion';
import { Link } from '../lib/router';
import { useData } from './data';

type Variant = 'primary' | 'ghost' | 'quiet' | 'danger';
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'md' | 'sm' };

/** Exactly one `primary` per view; everything else is ghost/quiet. */
export function Button({ variant = 'ghost', size = 'md', className = '', type = 'button', ...rest }: BtnProps) {
  return <button type={type} className={`btn btn-${variant} btn-${size} ${className}`} {...rest} />;
}

export function LinkButton({ to, variant = 'ghost', children, className = '' }: { to: string; variant?: Variant; children: ReactNode; className?: string }) {
  return <Link to={to} className={`btn btn-${variant} btn-md ${className}`}>{children}</Link>;
}

export function Panel({ kicker, title, actions, children, className = '', id }: { kicker?: string; title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  const hid = useId();
  return (
    <section className={`panel ${className}`} aria-labelledby={title ? hid : undefined} id={id}>
      {(kicker || title || actions) && (
        <header className="panel-head">
          <div>
            {kicker && <span className="micro">{kicker}</span>}
            {title && <h2 id={hid} className="panel-title">{title}</h2>}
          </div>
          {actions && <div className="panel-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'accent';
export function Tag({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`tag tag-${tone}`}>{children}</span>;
}

/** Map a solver/task/aircraft status to a semantic tone. */
export function toneFor(status: string | null | undefined): Tone {
  const s = (status ?? '').toLowerCase();
  if (['optimal', 'feasible', 'serviceable', 'scheduled', 'completed', 'solved', 'applied', 'pass'].includes(s)) return 'success';
  if (['unknown', 'pending', 'draft', 'review', 'maintenance', 'timeout'].includes(s)) return 'warning';
  if (['infeasible', 'error', 'grounded', 'cancelled', 'discarded', 'model_invalid', 'unserviceable'].includes(s)) return 'danger';
  return 'neutral';
}

/** Telemetry readout: label, big mono value, optional unit and note. Numbers tween (<400 ms). */
export function Telemetry({ label, value, unit, note, tone, numeric }: { label: string; value: ReactNode; unit?: string; note?: ReactNode; tone?: Tone; numeric?: number | null }) {
  const tweened = useTweenedNumber(numeric);
  const shown = numeric !== undefined ? (tweened === null ? DASH : Math.round(tweened).toLocaleString('en-US')) : value;
  return (
    <div className={`telemetry ${tone ? `tone-${tone}` : ''}`}>
      <span className="micro">{label}</span>
      <span className="telemetry-value">{shown}{unit && shown !== DASH && <small>{unit}</small>}</span>
      {note && <span className="telemetry-note">{note}</span>}
    </div>
  );
}

/** Saved vs scenario mode. Scenario mode is a client-side selection (the API has no global active scenario). */
export function DataModeBanner() {
  const { activeScenario, setActiveScenario } = useData();
  if (!activeScenario) {
    return (
      <div className="mode-chip" role="note">
        <span className="dot dot-success" aria-hidden /> Saved data
      </div>
    );
  }
  return (
    <div className="mode-banner" role="note" aria-label="Scenario mode">
      <span className="dot dot-warning" aria-hidden />
      <span>
        <b>Scenario mode: {activeScenario.name}</b> ({activeScenario.id}). Scenario results live in{' '}
        <Link to="/console/scenarios">Scenarios</Link>; other pages still show saved data, which this scenario does not change until applied.
      </span>
      <Button size="sm" variant="quiet" onClick={() => setActiveScenario(null)}>Return to saved data</Button>
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <p className="empty-title">{title}</p>
      {body && <p className="empty-body">{body}</p>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}

/** Layout-matched placeholder rows. */
export function Skeleton({ rows = 4, height = 20 }: { rows?: number; height?: number }) {
  return (
    <div className="skeleton" aria-hidden>
      {Array.from({ length: rows }, (_, i) => <span key={i} style={{ height }} />)}
    </div>
  );
}

/** Accessible modal dialog: focus moves in, Escape closes, focus returns to the opener. */
export function Dialog({ open, onClose, title, kicker, children, footer, side = false }: { open: boolean; onClose: () => void; title: string; kicker?: string; children: ReactNode; footer?: ReactNode; side?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const el = ref.current;
    el?.querySelector<HTMLElement>('textarea, input, select, button:not([data-close])')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      if (e.key === 'Tab' && el) {
        const f = Array.from(el.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')).filter(x => !x.hasAttribute('disabled'));
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); opener?.focus?.(); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} className={side ? 'drawer' : 'dialog'} role="dialog" aria-modal="true" aria-labelledby={id}>
        <header className="panel-head">
          <div>{kicker && <span className="micro">{kicker}</span>}<h2 id={id} className="panel-title">{title}</h2></div>
          <button className="icon-btn" data-close onClick={onClose} aria-label={`Close ${title}`}><X size={16} /></button>
        </header>
        <div className="dialog-body">{children}</div>
        {footer && <footer className="dialog-foot">{footer}</footer>}
      </div>
    </div>
  );
}

/** Drawer = side-anchored Dialog. */
export function Drawer(props: Omit<Parameters<typeof Dialog>[0], 'side'>) { return <Dialog {...props} side />; }

/** Tooltip shown on hover and keyboard focus, wired with aria-describedby. */
export function Tooltip({ text, children }: { text: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className="tooltip-wrap" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} aria-describedby={id}>
      {children}
      <span role="tooltip" id={id} className={`tooltip ${open ? 'open' : ''}`}>{text}</span>
    </span>
  );
}

export function Table({ caption, children, className = '' }: { caption?: string; children: ReactNode; className?: string }) {
  return (
    <div className="table-wrap" tabIndex={0} role="region" aria-label={caption ?? 'Table'}>
      <table className={`table ${className}`}>
        {caption && <caption className="sr-only">{caption}</caption>}
        {children}
      </table>
    </div>
  );
}

export function PageHeader({ kicker, title, lede, actions }: { kicker: string; title: string; lede?: string; actions?: ReactNode }) {
  return (
    <div className="page-header">
      <div>
        <span className="micro">{kicker}</span>
        <h1>{title}</h1>
        {lede && <p className="lede">{lede}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}
