/**
 * Procedural twin-engine airliner rendered with react-three-fiber.
 * Built entirely at runtime from three.js geometry (lathe, extrude, torus, instancing): no model files,
 * textures or HDR images. Reflections come from three's procedural RoomEnvironment.
 * Loaded lazily (own chunk) by AircraftViewer.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  BoxGeometry, CircleGeometry, Color, CylinderGeometry, DoubleSide, ExtrudeGeometry, Group, InstancedMesh, LatheGeometry,
  MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial, Object3D, PMREMGenerator, Shape, SphereGeometry, TorusGeometry, Vector2,
  type BufferGeometry, type Material,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export type ViewerStatus = 'idle' | 'live' | 'solving' | 'scenario' | 'attention';
const BEACON: Record<ViewerStatus, string> = {
  idle: '#737F8C', live: '#7FD1FF', solving: '#7FD1FF', scenario: '#F5B84A', attention: '#FF6B6B',
};

/* ---------- geometry helpers (aircraft frame: nose +x, up +y, right wing +z) ---------- */

// Fuselage radius profile [x, r]: blunt rounded nose, constant cabin, long upswept tailcone.
const PROFILE: [number, number][] = [
  [5.6, 0], [5.55, 0.12], [5.42, 0.25], [5.2, 0.37], [4.9, 0.47], [4.5, 0.55], [4.0, 0.6], [3.3, 0.625],
  [-2.4, 0.625], [-3.0, 0.6], [-3.6, 0.53], [-4.2, 0.42], [-4.8, 0.29], [-5.3, 0.17], [-5.65, 0.08], [-5.8, 0],
];
export function fuselageRadius(x: number): number {
  for (let i = 0; i < PROFILE.length - 1; i++) {
    const [x0, r0] = PROFILE[i], [x1, r1] = PROFILE[i + 1];
    if (x <= x0 && x >= x1) return r0 + ((x - x0) / (x1 - x0)) * (r1 - r0);
  }
  return 0;
}

/** Lathe around Y, with points given along the aircraft x axis; mesh is rotated onto +x. */
function latheAlongX(points: [number, number][], segments = 64) {
  return new LatheGeometry(points.map(([x, r]) => new Vector2(r, x)), segments);
}

/** Swept planform in the XY plane (x = chord towards nose, y = span), extruded to a thin slab with rounded edges. */
function planform(root: number, tip: number, span: number, sweep: number, thickness: number) {
  const s = new Shape();
  s.moveTo(0, 0);
  s.lineTo(-sweep, span);
  s.lineTo(-sweep - tip, span);
  s.lineTo(-root, 0);
  s.closePath();
  const g = new ExtrudeGeometry(s, { depth: thickness, bevelEnabled: true, bevelSize: thickness * 0.45, bevelThickness: thickness * 0.45, bevelSegments: 2, curveSegments: 4 });
  g.translate(0, 0, -thickness / 2);
  return g;
}

// Wing numbers shared by geometry and light/engine placement.
const WING = { root: 2.6, tip: 0.62, span: 5.0, sweep: 2.45, x: 1.55, y: -0.36, z: 0.42, dihedral: 0.09 };
const leX = (z: number) => -(WING.sweep * z) / WING.span; // leading-edge x at span station z (wing-local)
const chord = (z: number) => WING.root + ((WING.tip - WING.root) * z) / WING.span;

function useGeometries() {
  const geo = useMemo(() => {
    const fuselage = latheAlongX(PROFILE, 72);
    const wing = planform(WING.root, WING.tip, WING.span, WING.sweep, 0.11);
    const winglet = (() => {
      const s = new Shape();
      s.moveTo(0, 0); s.lineTo(-0.4, 0.6); s.lineTo(-0.62, 0.6); s.lineTo(-0.6, 0); s.closePath();
      const g = new ExtrudeGeometry(s, { depth: 0.04, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 1 });
      g.translate(0, 0, -0.02); return g;
    })();
    const stab = planform(1.25, 0.42, 2.0, 1.2, 0.07);
    const fin = (() => {
      const s = new Shape();
      s.moveTo(0, 0); s.lineTo(-1.55, 2.15); s.lineTo(-2.15, 2.15); s.lineTo(-2.35, 0); s.closePath();
      const g = new ExtrudeGeometry(s, { depth: 0.08, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2 });
      g.translate(0, 0, -0.04); return g;
    })();
    const dorsal = (() => {
      const s = new Shape();
      s.moveTo(0, 0); s.lineTo(-1.0, 0.32); s.lineTo(-1.0, 0); s.closePath();
      const g = new ExtrudeGeometry(s, { depth: 0.06, bevelEnabled: false }); g.translate(0, 0, -0.03); return g;
    })();
    // Nacelle: lathe with a lip, a fat mid-body and a tapering exhaust; open at the front.
    const nacelle = latheAlongX([[0.78, 0.27], [0.7, 0.33], [0.4, 0.35], [-0.2, 0.33], [-0.62, 0.25], [-0.78, 0.2]], 48);
    const intakeRing = new TorusGeometry(0.28, 0.04, 14, 48);
    const fan = new CircleGeometry(0.27, 40);
    const spinner = latheAlongX([[0.72, 0], [0.66, 0.06], [0.56, 0.09]], 24);
    const exhaust = latheAlongX([[-0.7, 0.19], [-0.98, 0.1], [-1.05, 0]], 32);
    const pylon = (() => {
      const s = new Shape();
      s.moveTo(0.3, 0); s.lineTo(-0.9, 0); s.lineTo(-1.25, 0.42); s.lineTo(0.0, 0.42); s.closePath();
      const g = new ExtrudeGeometry(s, { depth: 0.07, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 1 });
      g.translate(0, 0, -0.035); return g;
    })();
    const belly = new SphereGeometry(1, 40, 20);
    const windowPane = new BoxGeometry(0.075, 0.1, 0.02);
    const cockpitPane = new BoxGeometry(0.2, 0.1, 0.02);
    // Panel line: a very thin open band just proud of the skin.
    const band = new CylinderGeometry(1, 1, 0.012, 72, 1, true);
    // Cyan accent: a narrow strip of a cylinder wall running the cabin length (both sides).
    const accent = new CylinderGeometry(0.629, 0.629, 5.7, 64, 1, true, 0, 0.022);
    const light = new SphereGeometry(0.05, 12, 12);
    const glow = new SphereGeometry(0.16, 12, 12);
    return { fuselage, wing, winglet, stab, fin, dorsal, nacelle, intakeRing, fan, spinner, exhaust, pylon, belly, windowPane, cockpitPane, band, accent, light, glow };
  }, []);
  useEffect(() => () => { Object.values(geo).forEach((g: BufferGeometry) => g.dispose()); }, [geo]);
  return geo;
}

function useMaterials() {
  const m = useMemo(() => ({
    skin: new MeshPhysicalMaterial({ color: '#2b3139', metalness: 0.55, roughness: 0.34, clearcoat: 0.6, clearcoatRoughness: 0.25 }),
    wing: new MeshPhysicalMaterial({ color: '#343b44', metalness: 0.5, roughness: 0.42, clearcoat: 0.3 }),
    nacelle: new MeshPhysicalMaterial({ color: '#22272e', metalness: 0.6, roughness: 0.3, clearcoat: 0.7 }),
    lip: new MeshStandardMaterial({ color: '#c9d2dc', metalness: 0.95, roughness: 0.18 }),
    dark: new MeshStandardMaterial({ color: '#07090c', metalness: 0.3, roughness: 0.6, side: DoubleSide }),
    glass: new MeshPhysicalMaterial({ color: '#0b1520', metalness: 0.1, roughness: 0.05, clearcoat: 1, emissive: new Color('#0e2a3d'), emissiveIntensity: 0.6 }),
    line: new MeshBasicMaterial({ color: '#0a0d11', transparent: true, opacity: 0.55, side: DoubleSide }),
    accent: new MeshBasicMaterial({ color: '#7FD1FF', side: DoubleSide, toneMapped: false }),
  }), []);
  useEffect(() => () => { Object.values(m).forEach((x: Material) => x.dispose()); }, [m]);
  return m;
}

/** Procedural reflections: three's RoomEnvironment through PMREM (no image files). */
function ProceduralEnvironment() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    return () => { scene.environment = null; env.dispose(); pmrem.dispose(); };
  }, [gl, scene]);
  return null;
}

/** Cabin window rows as one InstancedMesh (both sides). */
function CabinWindows({ geometry, material }: { geometry: BufferGeometry; material: Material }) {
  const ref = useRef<InstancedMesh>(null);
  const xs = useMemo(() => { const a: number[] = []; for (let x = 3.05; x > -2.6; x -= 0.22) if (Math.abs(x - 0.9) > 0.18) a.push(x); return a; }, []);
  useLayoutEffect(() => {
    const mesh = ref.current; if (!mesh) return;
    const o = new Object3D(); let i = 0;
    for (const side of [1, -1]) for (const x of xs) {
      const r = fuselageRadius(x) + 0.004; const y = 0.16;
      o.position.set(x, y, side * Math.sqrt(Math.max(0, r * r - y * y)));
      o.rotation.set(0, 0, 0); o.lookAt(x, y, side * 5); o.updateMatrix(); mesh.setMatrixAt(i++, o.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [xs]);
  return <instancedMesh ref={ref} args={[geometry, material, xs.length * 2]} />;
}

function NavLight({ position, color, geo, strobe = false, reduced, phase = 0 }: { position: [number, number, number]; color: string; geo: { light: BufferGeometry; glow: BufferGeometry }; strobe?: boolean; reduced: boolean; phase?: number }) {
  const glow = useRef<MeshBasicMaterial>(null);
  useFrame(({ clock }) => {
    if (!glow.current) return;
    if (reduced) { glow.current.opacity = 0.35; return; }
    if (strobe) {
      const t = (clock.elapsedTime + phase) % 1.2; // double flash every 1.2 s
      glow.current.opacity = t < 0.06 || (t > 0.16 && t < 0.22) ? 0.95 : 0.0;
    } else glow.current.opacity = 0.3 + 0.08 * Math.sin(clock.elapsedTime * 3 + phase);
  });
  return (
    <group position={position}>
      <mesh geometry={geo.light}><meshBasicMaterial color={color} toneMapped={false} /></mesh>
      <mesh geometry={geo.glow}><meshBasicMaterial ref={glow} color={color} transparent depthWrite={false} toneMapped={false} opacity={0.3} /></mesh>
    </group>
  );
}

function Airliner({ status, reduced, onSlow }: { status: ViewerStatus; reduced: boolean; onSlow?: () => void }) {
  const body = useRef<Group>(null);
  const beacon = useRef<MeshBasicMaterial>(null);
  const stats = useRef({ frames: 0, t0: performance.now(), worst: 0, last: performance.now(), total: 0, count: 0, judged: false });
  const g = useGeometries();
  const m = useMaterials();
  const toX: [number, number, number] = [0, 0, -Math.PI / 2];
  const bands = [3.6, 2.2, 0.0, -1.7, -3.1];

  useFrame((state, dt) => {
    const now = performance.now(); const s = stats.current;
    s.worst = Math.max(s.worst, now - s.last); s.last = now; s.frames++;
    // Adaptive quality: on very slow hardware (software GL, low-end GPUs) stop the continuous
    // loop after a couple of seconds of measurement so the page stays responsive.
    if (!s.judged) {
      s.total += dt * 1000; s.count++;
      if (s.count >= 180 || s.total >= 2500) {
        if (s.total / s.count > 80) { s.judged = true; onSlow?.(); }
        else if (s.count >= 180) s.judged = true;
      }
    }
    if (now - s.t0 >= 1000) {
      (window as unknown as { __aeroopt3d?: object }).__aeroopt3d = { fps: Math.round((s.frames * 1000) / (now - s.t0)), worstFrameMs: Math.round(s.worst * 10) / 10 };
      s.frames = 0; s.t0 = now; s.worst = 0;
    }
    const t = state.clock.elapsedTime;
    if (body.current && !reduced) {
      // Smooth, slow bank and climb: roll about the fuselage, gentle pitch and heave, slight yaw drift.
      const k = Math.min(1, dt * 2);
      const roll = Math.sin(t * 0.32) * 0.16;
      const pitch = 0.04 + Math.sin(t * 0.21 + 1.1) * 0.05;
      body.current.rotation.x += (roll - body.current.rotation.x) * k;
      body.current.rotation.z += (pitch - body.current.rotation.z) * k;
      body.current.rotation.y = Math.sin(t * 0.12) * 0.12;
      body.current.position.y = Math.sin(t * 0.21 + 1.1) * 0.12;
    }
    if (beacon.current) {
      const speed = status === 'solving' ? 7 : 2.2;
      beacon.current.opacity = reduced ? 0.8 : 0.25 + 0.7 * Math.max(0, Math.sin(t * speed));
    }
  });

  const wingSide = (side: 1 | -1) => (
    <group key={side} position={[WING.x, WING.y, side * WING.z]} rotation={[side * -WING.dihedral, 0, 0]}>
      <mesh geometry={g.wing} material={m.wing} rotation={[side * Math.PI / 2, 0, 0]} />
      {/* blended winglet, canted outboard */}
      <mesh geometry={g.winglet} material={m.wing} position={[leX(WING.span), 0.02, side * WING.span]} rotation={[side * -0.22, 0, 0]} />
      {/* engine on pylon at 38% span */}
      {(() => {
        const z = 1.9; const x = leX(z) + 0.95;
        return (
          <group position={[x, -0.62, side * z]}>
            <mesh geometry={g.pylon} material={m.wing} position={[0.15, 0.2, 0]} />
            <mesh geometry={g.nacelle} material={m.nacelle} rotation={toX} />
            <mesh geometry={g.intakeRing} material={m.lip} position={[0.76, 0, 0]} rotation={[0, Math.PI / 2, 0]} />
            <mesh geometry={g.fan} material={m.dark} position={[0.62, 0, 0]} rotation={[0, Math.PI / 2, 0]} />
            <mesh geometry={g.spinner} material={m.lip} rotation={toX} />
            <mesh geometry={g.exhaust} material={m.dark} rotation={toX} />
          </group>
        );
      })()}
      <NavLight geo={g} reduced={reduced} color={side === 1 ? '#3DDC97' : '#FF4D4D'} position={[leX(WING.span) - chord(WING.span) * 0.35, 0.05, side * (WING.span + 0.06)]} />
      <NavLight geo={g} reduced={reduced} strobe phase={side === 1 ? 0 : 0.03} color="#ffffff" position={[leX(WING.span) - chord(WING.span) * 0.9, 0.05, side * (WING.span + 0.04)]} />
    </group>
  );

  return (
    <group rotation={[0.2, -0.62, 0]} scale={0.6}>
      <group ref={body}>
        <mesh geometry={g.fuselage} material={m.skin} rotation={toX} />
        {/* panel lines */}
        {bands.map(x => { const r = fuselageRadius(x) + 0.004; return <mesh key={x} geometry={g.band} material={m.line} position={[x, 0, 0]} rotation={toX} scale={[r, 1, r]} />; })}
        {/* thin cyan accent line along the cabin, both sides */}
        <mesh geometry={g.accent} material={m.accent} position={[0.4, 0, 0]} rotation={toX} />
        <mesh geometry={g.accent} material={m.accent} position={[0.4, 0, 0]} rotation={[Math.PI, 0, -Math.PI / 2]} />
        <CabinWindows geometry={g.windowPane} material={m.glass} />
        {/* cockpit windshield: four panes wrapped around the nose */}
        {[-0.62, -0.22, 0.22, 0.62].map(a => {
          const x = 4.62; const r = fuselageRadius(x) - 0.02; const y = 0.3;
          const zr = Math.sqrt(Math.max(0, r * r - y * y));
          return <mesh key={a} geometry={g.cockpitPane} material={m.glass} position={[x, y, Math.sin(a) * zr]} rotation={[0, a * 1.2 + (a > 0 ? Math.PI / 2 : -Math.PI / 2) * 0.55, -0.35]} />;
        })}
        {/* belly fairing */}
        <mesh geometry={g.belly} material={m.skin} position={[0.5, -0.44, 0]} scale={[2.5, 0.32, 0.62]} />
        {wingSide(1)}
        {wingSide(-1)}
        {/* horizontal stabilisers with dihedral */}
        {([1, -1] as const).map(side => (
          <group key={side} position={[-3.95, 0.12, side * 0.2]} rotation={[side * -0.12, 0, 0]}>
            <mesh geometry={g.stab} material={m.wing} rotation={[side * Math.PI / 2, 0, 0]} />
          </group>
        ))}
        {/* vertical stabiliser + dorsal fillet */}
        <mesh geometry={g.fin} material={m.wing} position={[-3.4, 0.42, 0]} />
        <mesh geometry={g.dorsal} material={m.wing} position={[-2.4, 0.5, 0]} />
        {/* tail nav (white) and status beacons (top and belly) */}
        <NavLight geo={g} reduced={reduced} color="#ffffff" position={[-5.8, 0.02, 0]} />
        <mesh geometry={g.light} position={[0.3, 0.64, 0]} scale={1.3}><meshBasicMaterial ref={beacon} color={BEACON[status]} transparent toneMapped={false} /></mesh>
        <mesh geometry={g.light} position={[0.0, -0.78, 0]}><meshBasicMaterial color={BEACON[status]} toneMapped={false} /></mesh>
      </group>
    </group>
  );
}

export default function AirlinerScene({ status, reduced, mode }: { status: ViewerStatus; reduced: boolean; mode: 'hero' | 'callout' }) {
  // Measured each second in useFrame; true when frames are too slow to animate continuously.
  const [slow, setSlow] = useState(false);
  return (
    <Canvas
      className="airliner-canvas"
      dpr={slow ? 1 : [1, mode === 'hero' ? 1.5 : 1.25]}
      frameloop={reduced || slow ? 'demand' : 'always'}
      camera={{ position: [0, 1.0, 8.6], fov: mode === 'hero' ? 34 : 38 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
      aria-hidden
    >
      <ProceduralEnvironment />
      <hemisphereLight args={['#bfe6ff', '#3a2b1f', 0.35]} />
      {/* key light (warm, from the upper front) */}
      <directionalLight position={[6, 7, 5]} intensity={1.5} color="#fff4e6" />
      {/* rim lights from behind: cool cyan and a faint warm horizon kick */}
      <directionalLight position={[-7, 3, -6]} intensity={2.4} color="#7FD1FF" />
      <directionalLight position={[2, -3, -7]} intensity={0.8} color="#ffb27a" />
      <Airliner status={status} reduced={reduced} onSlow={() => setSlow(true)} />
    </Canvas>
  );
}
