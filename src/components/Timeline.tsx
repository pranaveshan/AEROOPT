// 24-hour assignment timeline shared by the overview and schedule pages.
import { useEffect, useRef, useState } from 'react'

import type { TimelineRow } from '../lib/dto'
import { formatTime } from '../shared/format'
import { StateBadge } from './ui'

const pct = (value: number, from: number, to: number) => ((value - from) / Math.max(1, to - from)) * 100

export function AssignmentTimeline({
  from,
  to,
  rows,
  now = Date.now(),
  emptyDetail = 'No assignments in this window.',
}: {
  from: string
  to: string
  rows: TimelineRow[]
  now?: number
  emptyDetail?: string
}) {
  const start = Date.parse(from)
  const end = Date.parse(to)
  const hours: number[] = []
  for (let t = start; t <= end; t += 3 * 3600_000) hours.push(t)
  const nowPct = pct(now, start, end)
  const showNow = nowPct >= 0 && nowPct <= 100

  // Bars are percentage-positioned, so the label that fits depends on the
  // rendered track width. Measure it instead of guessing a character limit.
  const trackRef = useRef<HTMLDivElement>(null)
  const [trackPx, setTrackPx] = useState(0)
  useEffect(() => {
    const element = trackRef.current
    if (!element) return
    const observer = new ResizeObserver(() => setTrackPx(element.clientWidth))
    observer.observe(element)
    setTrackPx(element.clientWidth)
    return () => observer.disconnect()
  }, [])

  return (
    <div className="min-w-0">
      <div className="overflow-x-auto">
        <div style={{ minWidth: 620 }}>
          <div className="timeline-row text-[10.5px] text-ink-3">
            <div className="pl-1">Airframe</div>
            <div className="relative h-4">
              {hours.map((hour) => (
                <span
                  key={hour}
                  className="tnum absolute -translate-x-1/2 whitespace-nowrap"
                  style={{ left: `${Math.min(98, Math.max(2, pct(hour, start, end)))}%` }}
                >
                  {formatTime(new Date(hour).toISOString())}
                </span>
              ))}
            </div>
          </div>
          {rows.length ? (
            rows.map((row, rowIndex) => (
              <div key={row.id} className="timeline-row">
                <div className="min-w-0 pl-1">
                  <div className="mono truncate text-[12px] font-medium">{row.label}</div>
                  <div className="mt-0.5">
                    <StateBadge value={row.status} />
                  </div>
                </div>
                <div className="timeline-track" ref={rowIndex === 0 ? trackRef : undefined}>
                  {showNow ? <span className="timeline-now" style={{ left: `${nowPct}%` }} aria-hidden /> : null}
                  {row.bars.map((bar) => {
                    const left = pct(Date.parse(bar.start), start, end)
                    const width = Math.max(1.4, pct(Date.parse(bar.end), start, end) - left)
                    const clippedLeft = Math.max(0, left)
                    const clippedWidth = Math.min(100 - clippedLeft, width)
                    const barPx = (clippedWidth / 100) * (trackPx || 900)
                    const label = barPx >= 92 ? bar.label : barPx >= 30 ? bar.label.slice(-4) : ''
                    return (
                      <div
                        key={bar.id}
                        className="timeline-bar"
                        style={{
                          left: `${clippedLeft}%`,
                          width: `${clippedWidth}%`,
                          background: bar.state === 'in_progress' ? 'var(--info)' : bar.state === 'completed' ? 'var(--line-strong)' : 'var(--accent)',
                        }}
                        title={`${bar.label} · ${formatTime(bar.start)}–${formatTime(bar.end)} UTC`}
                      >
                        {label}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))
          ) : (
            <div className="py-6 text-center text-[12.5px] text-ink-3">{emptyDetail}</div>
          )}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3 border-t border-line pt-2 text-[11px] text-ink-3">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-accent" /> Assigned
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-info" /> In progress
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-line-strong" /> Completed
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-0.5 bg-info" /> Current time
        </span>
        <span className="ml-auto">Window {formatTime(from)}–{formatTime(to)} UTC</span>
      </div>
    </div>
  )
}
