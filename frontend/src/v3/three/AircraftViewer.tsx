/**
 * Wrapper for the 3D airliner: lazy-loads the three.js chunk only when visible and WebGL works,
 * falls back to an SVG profile on no-WebGL, load errors or runtime errors. Reduced motion stops rotation.
 */
import { Component, Suspense, lazy, useEffect, useRef, useState, type ReactNode } from 'react';
import { useReducedMotion } from '../../lib/motion';
import type { ViewerStatus } from './AirlinerScene';

const Scene = lazy(() => import('./AirlinerScene'));
export const preloadAirliner = () => import('./AirlinerScene');

function webglAvailable(): boolean {
  try {
    if (new URLSearchParams(window.location.search).has('no3d')) return false;
    const c = document.createElement('canvas');
    const gl = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext | null;
    if (!gl) return false;
    // A software rasteriser (CI, headless, remote desktop, no GPU) cannot animate this scene at a
    // usable rate; the static SVG profile is the right answer there.
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) ?? '') : '';
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return !/swiftshader|llvmpipe|softwarerasterizer|basic render/i.test(renderer);
  } catch { return false; }
}

class Boundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(e: unknown) { console.warn('3D viewer failed; showing SVG fallback.', e); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

const STATUS_FILL: Record<ViewerStatus, string> = { idle: '#737F8C', live: '#7FD1FF', solving: '#7FD1FF', scenario: '#F5B84A', attention: '#FF6B6B' };

/** Static side profile used whenever 3D is unavailable. */
export function SvgAirliner({ status }: { status: ViewerStatus }) {
  return (
    <svg className="airliner-svg" viewBox="0 0 600 220" role="img" aria-label="Airliner side profile (static view)">
      <defs>
        <linearGradient id="fus" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#e6ebf0" /><stop offset="1" stopColor="#8d99a6" /></linearGradient>
      </defs>
      <path d="M40 118 C 60 96, 110 92, 160 92 L 470 92 C 520 92, 560 104, 578 116 C 560 128, 520 136, 470 136 L 160 136 C 110 136, 60 134, 40 118 Z" fill="url(#fus)" />
      <path d="M150 92 L 92 30 L 128 30 L 205 92 Z" fill="#8d99a6" />
      <path d="M120 112 L 70 96 L 92 96 L 160 112 Z" fill="#b8c2cc" />
      <path d="M270 124 L 360 178 L 392 178 L 340 124 Z" fill="#b8c2cc" />
      <rect x="318" y="146" width="80" height="22" rx="10" fill="#6b7784" />
      <path d="M480 104 L 528 104 C 540 106, 548 110, 552 114 L 486 114 Z" fill="#10161d" />
      <line x1="200" y1="106" x2="460" y2="106" stroke="#10161d" strokeWidth="4" strokeDasharray="5 6" />
      <circle cx="300" cy="90" r="5" fill={STATUS_FILL[status]} />
    </svg>
  );
}

export function AircraftViewer({ status, mode = 'callout', label }: { status: ViewerStatus; mode?: 'hero' | 'callout'; label: string }) {
  const reduced = useReducedMotion();
  const host = useRef<HTMLDivElement>(null);
  const [can3d] = useState(webglAvailable);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!can3d || !host.current) return;
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); io.disconnect(); } }, { rootMargin: '200px' });
    io.observe(host.current);
    return () => io.disconnect();
  }, [can3d]);
  const fallback = <SvgAirliner status={status} />;
  return (
    <figure ref={host} className={`viewer viewer-${mode}`} aria-label={label}>
      {can3d && visible ? (
        <Boundary fallback={fallback}>
          <Suspense fallback={fallback}><Scene status={status} reduced={reduced} mode={mode} /></Suspense>
        </Boundary>
      ) : fallback}
      <figcaption className="sr-only">{label}</figcaption>
    </figure>
  );
}
