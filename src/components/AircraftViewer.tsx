// Interactive airframe model. Built from extruded SVG layers rotated in CSS 3D,
// so it ships no 3D engine and still responds to drag, wheel and buttons.
// This is a conceptual composite airframe, not a type-specific accurate model.
import { useCallback, useEffect, useRef, useState } from 'react'

import { cn } from './ui'

const FUSELAGE = 'M100 10 C106 20 108 30 108 44 L108 118 C108 138 105 150 100 166 C95 150 92 138 92 118 L92 44 C92 30 94 20 100 10 Z'
const RIGHT_WING = 'M108 62 L170 108 L176 120 L110 99 Z'
const LEFT_WING = 'M92 62 L30 108 L24 120 L90 99 Z'
const RIGHT_STAB = 'M108 136 L146 156 L147 163 L108 151 Z'
const LEFT_STAB = 'M92 136 L54 156 L53 163 L92 151 Z'
const ENGINE_R = 'M118 84 L146 104 L146 111 L118 96 Z'
const ENGINE_L = 'M82 84 L54 104 L54 111 L82 96 Z'

function AirframeShape({ tone, opacity }: { tone: string; opacity?: number }) {
  return (
    <svg viewBox="0 0 200 178" aria-hidden style={{ opacity }}>
      <g fill={tone} stroke="none">
        <path d={FUSELAGE} />
        <path d={RIGHT_WING} />
        <path d={LEFT_WING} />
        <path d={RIGHT_STAB} />
        <path d={LEFT_STAB} />
        <path d={ENGINE_R} />
        <path d={ENGINE_L} />
      </g>
    </svg>
  )
}

const SLICES = 16
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export function AircraftViewer({
  label = 'Conceptual airframe',
  type = 'Composite twin-engine airliner',
  className,
  height = 320,
  register = 'G-AOPT',
}: {
  label?: string
  type?: string
  className?: string
  height?: number
  register?: string
}) {
  const [rotation, setRotation] = useState({ yaw: -26, pitch: 58 })
  const [zoom, setZoom] = useState(1)
  const [dragging, setDragging] = useState(false)
  const [entered, setEntered] = useState(false)
  const drag = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null)
  const frame = useRef<HTMLDivElement>(null)
  const reduced = useRef(false)

  useEffect(() => {
    reduced.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    // The entrance runs once; afterwards the model only follows the pointer.
    const timer = window.setTimeout(() => setEntered(true), 760)
    return () => window.clearTimeout(timer)
  }, [])

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      drag.current = { x: event.clientX, y: event.clientY, yaw: rotation.yaw, pitch: rotation.pitch }
      setDragging(true)
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    [rotation],
  )

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return
    const dx = event.clientX - drag.current.x
    const dy = event.clientY - drag.current.y
    setRotation({
      yaw: clamp(drag.current.yaw + dx * 0.45, -180, 180),
      pitch: clamp(drag.current.pitch - dy * 0.3, 6, 84),
    })
  }, [])

  const onPointerUp = useCallback(() => {
    drag.current = null
    setDragging(false)
  }, [])

  const reset = () => {
    setRotation({ yaw: -26, pitch: 58 })
    setZoom(1)
  }

  return (
    <div className={cn('viewer', className)} style={{ height }} data-entered={entered}>
      <span className="viewer-readout">
        {register} · {label}
      </span>
      <div
        className="viewer-stage"
        data-dragging={dragging}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={reset}
        onWheel={(event) => {
          event.preventDefault()
          setZoom((current) => clamp(current - event.deltaY * 0.0012, 0.65, 1.9))
        }}
        tabIndex={0}
        role="img"
        aria-label={`${type}. Interactive model: drag to rotate, scroll to zoom.`}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') setRotation((r) => ({ ...r, yaw: clamp(r.yaw - 8, -180, 180) }))
          if (event.key === 'ArrowRight') setRotation((r) => ({ ...r, yaw: clamp(r.yaw + 8, -180, 180) }))
          if (event.key === 'ArrowUp') setRotation((r) => ({ ...r, pitch: clamp(r.pitch + 6, 6, 84) }))
          if (event.key === 'ArrowDown') setRotation((r) => ({ ...r, pitch: clamp(r.pitch - 6, 6, 84) }))
          if (event.key === '+' || event.key === '=') setZoom((z) => clamp(z + 0.1, 0.65, 1.9))
          if (event.key === '-') setZoom((z) => clamp(z - 0.1, 0.65, 1.9))
          if (event.key === 'r' || event.key === 'R') reset()
        }}
      >
        <div
          ref={frame}
          className="viewer-model"
          style={{ transform: `scale(${zoom}) rotateX(${rotation.pitch}deg) rotateZ(${rotation.yaw}deg)` }}
        >
          {Array.from({ length: SLICES }).map((_, index) => {
            const depth = index * 1.05
            const isTop = index === SLICES - 1
            return (
              <div key={index} className="viewer-slice" style={{ transform: `translateZ(${depth}px)` }}>
                <AirframeShape
                  tone={isTop ? 'var(--surface-3)' : index % 2 === 0 ? '#202a30' : '#1a2329'}
                  opacity={isTop ? 1 : 0.94}
                />
              </div>
            )
          })}
          {/* Livery details sit on the top face only. */}
          <div className="viewer-slice" style={{ transform: `translateZ(${SLICES * 1.05 + 0.4}px)` }}>
            <svg viewBox="0 0 200 178" aria-hidden>
              <path d={FUSELAGE} fill="none" stroke="var(--accent)" strokeWidth="0.9" opacity="0.5" />
              <path d="M100 22 L100 152" stroke="var(--accent)" strokeWidth="0.5" opacity="0.28" strokeDasharray="3 4" />
              <path d="M92 44 L108 44" stroke="var(--accent)" strokeWidth="1.4" opacity="0.65" />
              <circle cx="100" cy="18" r="1.4" fill="var(--accent)" opacity="0.8" />
              <path d={RIGHT_WING} fill="none" stroke="var(--accent)" strokeWidth="0.5" opacity="0.3" />
              <path d={LEFT_WING} fill="none" stroke="var(--accent)" strokeWidth="0.5" opacity="0.3" />
            </svg>
          </div>
        </div>
        <div className="viewer-shadow" aria-hidden />
      </div>
      <div className="viewer-controls">
        <button
          className="btn btn-secondary btn-icon"
          onClick={() => setZoom((z) => clamp(z - 0.15, 0.65, 1.9))}
          aria-label="Zoom out"
          title="Zoom out"
        >
          <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M4 8h8" />
          </svg>
        </button>
        <button
          className="btn btn-secondary btn-icon"
          onClick={() => setZoom((z) => clamp(z + 0.15, 0.65, 1.9))}
          aria-label="Zoom in"
          title="Zoom in"
        >
          <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M8 4v8M4 8h8" />
          </svg>
        </button>
        <button className="btn btn-secondary btn-icon" onClick={reset} aria-label="Reset view" title="Reset view">
          <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M3.5 8a4.5 4.5 0 1 1 1.4 3.3M3.5 5v3h3" />
          </svg>
        </button>
      </div>
    </div>
  )
}
