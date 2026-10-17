# Frontend v3: "Cinematic Flight Ops"

- Theme switch: Console → Settings → Theme (v3 Cinematic is the default; v2 Lime is the original UI). Stored in `localStorage.aeroopt_theme`; switching reloads the page so stylesheets never mix.
- Routes: `/` is the showcase; console pages are `/console`, `/console/{schedule,fleet,personnel,tasks,scenarios,analytics,benchmarks,audit,settings,about}`. Old paths (`/fleet`, `/mission`, …) redirect (see `src/routes.ts`). Both themes use the new paths.
- Data: `src/v3/data.tsx` makes the same API calls with the same payloads as v2. Data is kept while it revalidates. "Run optimizer" = `cp-sat`, "Run baseline" = `greedy`.
- Scenario mode: selecting a scenario on the Scenarios page is client-side state (sessionStorage). The API has no global active scenario, so other pages keep showing saved data under an amber banner.
- Showcase comparison numbers come from the last real `POST /analytics/compare-solvers` run in this browser (localStorage). Until one exists they show "—" with a prompt.
- 3D: `src/v3/three/` (lazy chunk, procedural). `?no3d` forces the SVG fallback. Reduced motion stops rotation and sets `frameloop="demand"`. The 3D hero is hidden below 600 px.
- Scripts: `npm run typecheck | lint | test | build | contrast`. `node scripts/screens.mjs <url> <outDir>` and `node scripts/extra-screens.mjs` run the Playwright screenshots, axe checks and 3D metrics (they need the backend on :8000 and `vite preview` on :5173).
