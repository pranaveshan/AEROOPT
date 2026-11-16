// Interactive airframe view. A vector airliner drawn in three-quarter profile,
// tilted in CSS 3D so drag and keyboard input change the presentation without
// ever flattening the aircraft into an unreadable silhouette.
import { useCallback, useEffect, useId, useRef, useState } from 'react'

import { cn } from './ui'

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

function Airframe({ uid }: { uid: string }) {
  const body = `${uid}-body`
  const belly = `${uid}-belly`
  const nacelle = `${uid}-nacelle`
  const wing = `${uid}-wing`
  const fin = `${uid}-fin`
  const glow = `${uid}-glow`
  const windows = Array.from({ length: 16 }, (_, index) => 206 + index * 18)

  return (
    <svg viewBox="0 0 900 420" role="presentation" className="viewer-art">
      <defs>
        <linearGradient id={body} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f6fafc" />
          <stop offset="0.4" stopColor="#d6e0e5" />
          <stop offset="0.76" stopColor="#96a5ad" />
          <stop offset="1" stopColor="#5d6c74" />
        </linearGradient>
        <linearGradient id={belly} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#cfd9de" />
          <stop offset="1" stopColor="#5f6e76" />
        </linearGradient>
        <linearGradient id={nacelle} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#cfd9de" />
          <stop offset="1" stopColor="#5f6e76" />
        </linearGradient>
        <linearGradient id={wing} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d3dee3" />
          <stop offset="1" stopColor="#526068" />
        </linearGradient>
        <linearGradient id={fin} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f2f7f9" />
          <stop offset="1" stopColor="#7f8d95" />
        </linearGradient>
        <radialGradient id={glow} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#f2c231" stopOpacity="0.24" />
          <stop offset="1" stopColor="#f2c231" stopOpacity="0" />
        </radialGradient>
      </defs>

      <ellipse cx="450" cy="352" rx="318" ry="28" fill={`url(#${glow})`} />

      {/* far wing, seen above the fuselage */}
      <path d="M478 176 L628 88 L676 96 L556 180 Z" fill="#5d6b73" opacity="0.95" />

      {/* vertical fin */}
      <path d="M752 168 L818 60 L860 66 L846 172 Z" fill={`url(#${fin})`} />
      <path d="M778 152 L830 76 L850 79 L822 156 Z" fill="#f2c231" opacity="0.94" />

      {/* far horizontal stabiliser */}
      <path d="M818 150 L872 128 L878 137 L824 158 Z" fill="#78868e" />

      {/* fuselage */}
      <path
        d="M58 216 C 98 178 170 162 308 160 L700 157 C 764 157 806 148 836 130 C 846 142 840 160 816 170 L700 196 C 430 212 176 224 58 216 Z"
        fill={`url(#${body})`}
      />
      <path d="M130 212 C 320 220 560 204 806 172 L700 196 C 430 212 190 220 130 212 Z" fill="#44525a" opacity="0.33" />

      {/* accent cheatline */}
      <path
        d="M96 202 C 176 190 252 185 342 184 L742 181 C 788 180 814 172 834 158"
        fill="none"
        stroke="#f2c231"
        strokeWidth="4"
        opacity="0.95"
      />

      {/* cockpit */}
      <path d="M96 199 C 118 180 148 172 176 170 L184 187 C 154 191 126 198 108 209 Z" fill="#1b2a33" />
      <path d="M112 195 L164 183" stroke="#8fd8f2" strokeWidth="2" opacity="0.55" />

      {/* cabin windows */}
      <g fill="#22323b" opacity="0.92">
        {windows.map((x, index) => (
          <rect key={x} x={x} y={181 - index * 0.38} width="7" height="5" rx="2" />
        ))}
      </g>
      <rect x="196" y="176" width="3" height="14" rx="1.4" fill="#7d8b93" opacity="0.5" />
      <rect x="524" y="172" width="3" height="14" rx="1.4" fill="#7d8b93" opacity="0.5" />

      {/* near wing */}
      <path d="M344 200 L228 306 L292 314 L566 212 Z" fill={`url(#${wing})`} />
      <path d="M344 200 L566 212 L560 220 L344 206 Z" fill="#a7b4ba" opacity="0.5" />
      <path d="M228 306 L292 314 L300 326 L236 318 Z" fill="#f2c231" />

      {/* engine pylon and nacelle */}
      <path d="M408 224 L470 232 L470 254 L414 248 Z" fill="#7c8a92" />
      <rect x="286" y="248" width="126" height="54" rx="27" fill={`url(#${nacelle})`} />
      <ellipse cx="292" cy="275" rx="15" ry="26" fill="#16232a" />
      <ellipse cx="292" cy="275" rx="8" ry="17" fill="#33454f" />
      <path d="M316 251 L392 253" stroke="#f2c231" strokeWidth="3" opacity="0.72" />
      <rect x="404" y="262" width="8" height="26" rx="4" fill="#4d5b62" />

      <circle cx="240" cy="313" r="4" fill="#f2c231" />
      <circle cx="842" cy="168" r="3" fill="#f2c231" opacity="0.75" />
    </svg>
  )
}

export function AircraftViewer({
  label = 'Twin-engine airliner',
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
  const uid = useId().replace(/[^a-zA-Z0-9-]/g, '')
  const [view, setView] = useState({ yaw: -8, pitch: 6 })
  const [zoom, setZoom] = useState(1)
  const [dragging, setDragging] = useState(false)
  const [entered, setEntered] = useState(false)
  const drag = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null)

  useEffect(() => {
    // The entrance runs once; afterwards the model only follows the pointer.
    const timer = window.setTimeout(() => setEntered(true), 760)
    return () => window.clearTimeout(timer)
  }, [])

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      drag.current = { x: event.clientX, y: event.clientY, yaw: view.yaw, pitch: view.pitch }
      setDragging(true)
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    [view],
  )

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return
    const dx = event.clientX - drag.current.x
    const dy = event.clientY - drag.current.y
    setView({
      yaw: clamp(drag.current.yaw + dx * 0.12, -16, 16),
      pitch: clamp(drag.current.pitch - dy * 0.1, -8, 14),
    })
  }, [])

  const onPointerUp = useCallback(() => {
    drag.current = null
    setDragging(false)
  }, [])

  const reset = () => {
    setView({ yaw: -8, pitch: 6 })
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
          setZoom((current) => clamp(current - event.deltaY * 0.0012, 0.7, 1.7))
        }}
        tabIndex={0}
        role="img"
        aria-label={`${type}. Interactive model: drag to rotate, scroll to zoom.`}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') setView((v) => ({ ...v, yaw: clamp(v.yaw - 4, -16, 16) }))
          if (event.key === 'ArrowRight') setView((v) => ({ ...v, yaw: clamp(v.yaw + 4, -16, 16) }))
          if (event.key === 'ArrowUp') setView((v) => ({ ...v, pitch: clamp(v.pitch + 3, -8, 14) }))
          if (event.key === 'ArrowDown') setView((v) => ({ ...v, pitch: clamp(v.pitch - 3, -8, 14) }))
          if (event.key === '+' || event.key === '=') setZoom((z) => clamp(z + 0.1, 0.7, 1.7))
          if (event.key === '-') setZoom((z) => clamp(z - 0.1, 0.7, 1.7))
          if (event.key === 'r' || event.key === 'R') reset()
        }}
      >
        <div
          className="viewer-model"
          style={{ transform: `scale(${zoom}) rotateX(${view.pitch}deg) rotateY(${view.yaw}deg)` }}
        >
          <Airframe uid={uid} />
        </div>
      </div>
      <div className="viewer-controls">
        <button
          className="btn btn-secondary btn-icon"
          onClick={() => setZoom((z) => clamp(z - 0.15, 0.7, 1.7))}
          aria-label="Zoom out"
          title="Zoom out"
        >
          <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M4 8h8" />
          </svg>
        </button>
        <button
          className="btn btn-secondary btn-icon"
          onClick={() => setZoom((z) => clamp(z + 0.15, 0.7, 1.7))}
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
