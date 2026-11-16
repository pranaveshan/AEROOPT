// Shared console primitives. One implementation per component, used everywhere.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Link } from 'react-router'

import { fade, modalPanel, transition } from '../lib/motion'

export const cn = (...values: (string | false | null | undefined)[]): string => values.filter(Boolean).join(' ')

/* ------------------------------------------------------------------ buttons */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md'; loading?: boolean }) {
  return (
    <button className={cn('btn', `btn-${variant}`, size === 'sm' && 'btn-sm', className)} disabled={props.disabled || loading} {...props}>
      {loading ? <span className="spinner" aria-hidden /> : null}
      {children}
    </button>
  )
}

export function LinkButton({
  to,
  variant = 'secondary',
  size = 'md',
  className,
  children,
}: {
  to: string
  variant?: Variant
  size?: 'sm' | 'md'
  className?: string
  children: ReactNode
}) {
  return (
    <Link to={to} className={cn('btn', `btn-${variant}`, size === 'sm' && 'btn-sm', className)}>
      {children}
    </Link>
  )
}

/* ------------------------------------------------------------------- layout */

export function PageHeader({
  title,
  meta,
  actions,
}: {
  title: string
  meta?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[22px] leading-tight font-semibold">{title}</h1>
        {meta ? <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-ink-3">{meta}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

export function Section({
  title,
  action,
  children,
  className,
  bare = false,
}: {
  title?: string
  action?: ReactNode
  children: ReactNode
  className?: string
  bare?: boolean
}) {
  return (
    <section className={cn(!bare && 'card', className)}>
      {title || action ? (
        <div className={cn('flex items-center justify-between gap-3 px-4 pt-3.5', bare ? 'pb-1' : 'border-b border-line pb-3')}>
          {title ? <h2 className="text-[13px] font-semibold tracking-wide text-ink-2">{title}</h2> : <span />}
          {action}
        </div>
      ) : null}
      {children}
    </section>
  )
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'accent' | 'ok' | 'warn' | 'danger' | 'info'; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}

export const STATE_TONE: Record<string, 'neutral' | 'accent' | 'ok' | 'warn' | 'danger' | 'info'> = {
  draft: 'neutral',
  pending: 'warn',
  scheduled: 'accent',
  in_progress: 'info',
  completed: 'ok',
  cancelled: 'neutral',
  blocked: 'danger',
  serviceable: 'ok',
  restricted: 'warn',
  maintenance: 'info',
  unserviceable: 'danger',
  available: 'ok',
  on_duty: 'info',
  rest: 'warn',
  leave: 'neutral',
  unavailable: 'danger',
  planned: 'warn',
  proposed: 'warn',
  committed: 'ok',
  superseded: 'neutral',
  rejected: 'danger',
  active: 'ok',
  suspended: 'danger',
  critical: 'danger',
  high: 'warn',
  normal: 'neutral',
  low: 'neutral',
  feasible: 'ok',
  partial: 'warn',
  infeasible: 'danger',
  approved: 'ok',
  pending_approval: 'warn',
}

export function StateBadge({ value, label }: { value: string; label?: string }) {
  return <Badge tone={STATE_TONE[value] ?? 'neutral'}>{(label ?? value).replace(/_/g, ' ')}</Badge>
}

export function Metric({
  label,
  value,
  unit,
  detail,
  tone = 'default',
}: {
  label: string
  value: ReactNode
  unit?: string
  detail?: ReactNode
  tone?: 'default' | 'ok' | 'warn' | 'danger'
}) {
  const toneClass = tone === 'danger' ? 'text-danger' : tone === 'warn' ? 'text-warn' : tone === 'ok' ? 'text-ok' : 'text-ink'
  return (
    <div className="card card-pad">
      <div className="text-[11.5px] font-medium tracking-wide text-ink-3 uppercase">{label}</div>
      <div className={cn('mt-2 flex items-baseline gap-1.5 text-[26px] leading-none font-semibold tnum', toneClass)}>
        {value}
        {unit ? <span className="text-[12px] font-medium text-ink-3">{unit}</span> : null}
      </div>
      {detail ? <div className="mt-2 text-[12px] text-ink-3">{detail}</div> : null}
    </div>
  )
}

/* -------------------------------------------------------------------- forms */

export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
  className,
}: {
  label: string
  htmlFor?: string
  error?: string
  hint?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error ? (
        <div className="field-error" role="alert">
          {error}
        </div>
      ) : hint ? (
        <div className="mt-1 text-[11.5px] text-ink-3">{hint}</div>
      ) : null}
    </div>
  )
}

export function Input({ invalid, className, ...props }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input className={cn('input', className)} aria-invalid={invalid || undefined} {...props} />
}

export function Textarea({ invalid, className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return <textarea className={cn('textarea', className)} aria-invalid={invalid || undefined} {...props} />
}

export function Select({
  invalid,
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return (
    <select className={cn('select', className)} aria-invalid={invalid || undefined} {...props}>
      {children}
    </select>
  )
}

export function Checkbox({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const id = useId()
  return (
    <label htmlFor={id} className="flex items-center gap-2 text-[13px] text-ink-2">
      <input id={id} type="checkbox" className="size-4 accent-[var(--accent)]" {...props} />
      {label}
    </label>
  )
}

export function SearchInput({ value, onChange, placeholder = 'Search' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative min-w-0 flex-1 sm:max-w-[280px]">
      <svg aria-hidden viewBox="0 0 20 20" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" fill="none" stroke="currentColor" strokeWidth="1.6">
        <circle cx="8.5" cy="8.5" r="5" />
        <path d="m12.5 12.5 4 4" />
      </svg>
      <input className="input pl-9" value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} aria-label={placeholder} />
    </div>
  )
}

/* ------------------------------------------------------------------ feedback */

export function Alert({ tone = 'default', title, children }: { tone?: 'default' | 'danger' | 'warn' | 'ok'; title?: string; children?: ReactNode }) {
  return (
    <div className={cn('alert', tone !== 'default' && `alert-${tone}`)} role={tone === 'danger' ? 'alert' : undefined}>
      <div>
        {title ? <div className="mb-0.5 font-semibold">{title}</div> : null}
        {children ? <div className="text-ink-2">{children}</div> : null}
      </div>
    </div>
  )
}

export function EmptyState({ title, detail, action }: { title: string; detail?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <div className="text-[14px] font-semibold">{title}</div>
      {detail ? <p className="max-w-[380px] text-[12.5px] text-ink-3">{detail}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}

export function Loading({ rows = 4, label = 'Loading' }: { rows?: number; label?: string }) {
  return (
    <div className="space-y-2 p-4" role="status" aria-label={label}>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="skeleton h-8" style={{ opacity: 1 - index * 0.15 }} />
      ))}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="p-4">
      <Alert tone="danger" title="Request failed">
        {message}
      </Alert>
      {onRetry ? (
        <div className="mt-3">
          <Button size="sm" onClick={onRetry}>
            Retry
          </Button>
        </div>
      ) : null}
    </div>
  )
}

/* -------------------------------------------------------------------- modals */

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  width = 620,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  width?: number
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const previous = document.activeElement as HTMLElement | null
    const firstField = panelRef.current?.querySelector<HTMLElement>('input, select, textarea, button')
    firstField?.focus()
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      previous?.focus()
    }
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open ? (
    <motion.div className="modal-backdrop" variants={fade} initial="initial" animate="animate" exit="exit" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <motion.div className="modal-panel" role="dialog" aria-modal="true" aria-label={title} ref={panelRef} style={{ maxWidth: width }} variants={modalPanel} initial="initial" animate="animate" exit="exit">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 className="text-[14px] font-semibold">{title}</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close dialog">
            <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.7">
              <path d="m5 5 10 10M15 5 5 15" />
            </svg>
          </button>
        </div>
        <div className="px-4 py-4">{children}</div>
        {footer ? <div className="flex flex-wrap justify-end gap-2 border-t border-line px-4 py-3">{footer}</div> : null}
      </motion.div>
    </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  tone = 'danger',
  loading,
  onCancel,
  onConfirm,
}: {
  open: boolean
  title: string
  message: ReactNode
  confirmLabel?: string
  tone?: 'danger' | 'primary'
  loading?: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      width={460}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant={tone} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-[13px] text-ink-2">{message}</div>
    </Modal>
  )
}

/* -------------------------------------------------------------------- toasts */

type Toast = { id: number; message: string; tone: 'ok' | 'danger' | 'info' }
const ToastContext = createContext<{ push: (message: string, tone?: Toast['tone']) => void }>({ push: () => {} })

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const push = useCallback((message: string, tone: Toast['tone'] = 'ok') => {
    const id = Date.now() + Math.random()
    setToasts((current) => [...current, { id, message, tone }])
    window.setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), 4200)
  }, [])
  const value = useMemo(() => ({ push }), [push])
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-3 bottom-3 z-[100] flex w-[min(360px,calc(100vw-24px))] flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className={cn(
              'card px-3 py-2.5 text-[13px] shadow-lg',
              toast.tone === 'danger' && 'border-danger/50 text-danger',
              toast.tone === 'ok' && 'border-ok/40 toast-ok',
            )}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)

/* --------------------------------------------------------------------- table */

export function TableWrap({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div className="table-wrap" role="region" aria-label={label} tabIndex={0}>
      {children}
    </div>
  )
}

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number
  pageSize: number
  total: number
  onPage: (page: number) => void
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (total <= pageSize) return null
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2.5 text-[12px] text-ink-3">
      <span className="tnum">
        {Math.min(total, (page - 1) * pageSize + 1)}–{Math.min(total, page * pageSize)} of {total}
      </span>
      <div className="flex items-center gap-1.5">
        <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </Button>
        <span className="tnum px-1">
          {page} / {pages}
        </span>
        <Button size="sm" variant="ghost" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  )
}

export function KeyValue({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-[11px] tracking-wide text-ink-3 uppercase">{item.label}</dt>
          <dd className="mt-0.5 text-[13px] break-words">{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}

export function Tabs<T extends string>({ value, onChange, options }: { value: T; onChange: (value: T) => void; options: { value: T; label: string; count?: number }[] }) {
  const pillId = useId()
  return (
    <div className="flex flex-wrap gap-1" role="tablist">
      {options.map((option) => {
        const selected = value === option.value
        return (
          <button
            key={option.value}
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'relative inline-flex h-8 items-center gap-1.5 rounded-lg border border-transparent px-2.5 text-[12.5px] font-medium transition-colors',
              selected ? 'text-ink' : 'text-ink-3 hover:bg-surface-2 hover:text-ink',
            )}
          >
            {selected ? (
              <motion.span
                layoutId={pillId}
                className="absolute inset-0 rounded-lg border border-line-strong bg-surface-2"
                transition={transition.move}
                aria-hidden
              />
            ) : null}
            <span className="relative">{option.label}</span>
            {typeof option.count === 'number' ? <span className="tnum relative text-[11px] text-ink-3">{option.count}</span> : null}
          </button>
        )
      })}
    </div>
  )
}

export function Details({ summary, children }: { summary: string; children: ReactNode }) {
  return (
    <details className="group border-t border-line py-2.5">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[12.5px] font-medium text-ink-2 select-none">
        <svg viewBox="0 0 20 20" className="size-3.5 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="m8 5 5 5-5 5" />
        </svg>
        {summary}
      </summary>
      <div className="mt-2 text-[12.5px] text-ink-2">{children}</div>
    </details>
  )
}

export function Bar({ value, tone = 'accent' }: { value: number; tone?: 'accent' | 'warn' | 'danger' | 'info' }) {
  const pct = Math.max(0, Math.min(1, value)) * 100
  const color = tone === 'warn' ? 'var(--warn)' : tone === 'danger' ? 'var(--danger)' : tone === 'info' ? 'var(--info)' : 'var(--accent)'
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
      <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}
