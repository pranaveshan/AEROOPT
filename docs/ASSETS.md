# Frontend assets and licences (v3 "Cinematic Flight Ops")

**Imagery: procedural, no external assets.** The v3 UI uses no photographs, video, 3D model files, HDRIs or textures.

| Asset | Source | Author | Licence | Notes |
|---|---|---|---|---|
| 3D airliner (`src/v3/three/AirlinerScene.tsx`) | Procedural: built at runtime from three.js Lathe, Extrude, Cylinder, Circle, Box and Sphere geometry | AeroOpt team | Project code | Generic twin-engine airliner, no specific manufacturer or type |
| Reflections | three.js `RoomEnvironment` (procedural scene) through `PMREMGenerator` at runtime | three.js authors | MIT | No HDR or image files |
| SVG airliner fallback (`src/v3/three/AircraftViewer.tsx`) | Hand-written SVG paths | AeroOpt team | Project code | Shown when WebGL is unavailable, on error, or with `?no3d` |
| Sky gradient, runway lines, hairlines | CSS gradients (`src/v3/styles/v3.css`) | AeroOpt team | Project code | |
| Lockup mark | Inline SVG path | AeroOpt team | Project code | Original mark, not derived from any brand |
| Barlow Condensed 500/600 (latin) | npm `@fontsource/barlow-condensed` 5.3.0, self-hosted by Vite | Jeremy Tribby | SIL Open Font License 1.1 | Display headings |
| Inter 400/500/600 (latin) | npm `@fontsource/inter` 5.3.0, self-hosted by Vite | The Inter Project Authors (Rasmus Andersson) | SIL Open Font License 1.1 | Body text |
| JetBrains Mono 400/500 (latin) | npm `@fontsource/jetbrains-mono` 5.3.0, self-hosted by Vite | JetBrains | SIL Open Font License 1.1 | IDs, times, data |
| Icons | npm `lucide-react` 0.468.0 (already a dependency) | Lucide contributors | ISC | |
| three.js | npm `three` 0.169.0 | three.js authors | MIT | Lazy 3D chunk only |
| @react-three/fiber | npm `@react-three/fiber` 9.1.2 | Poimandres | MIT | Lazy 3D chunk only |

No runtime CDN is used: the fonts and all code are bundled into `frontend/dist`.
Licence identifiers were read from each package's `package.json` and `LICENSE` file in `node_modules`.

The v2 "Lime" theme (`src/v2/`) is unchanged. Its CSS names Inter, Barlow Condensed and DM Mono but never loaded any font files, and that is still true: the self-hosted fonts ship only in the v3 chunk, so v2 renders with system fallbacks exactly as before.
