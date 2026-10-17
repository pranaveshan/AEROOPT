import { PageHeader, Panel } from '../ui';

export default function About() {
  return (
    <>
      <PageHeader kicker="Console · Reference" title="About and assumptions" lede="What AeroOpt does, how it decides, and where its limits are." />
      <div className="about-grid">
        <Panel kicker="Purpose" title="What it is">
          <p>AeroOpt is a scheduling prototype for civil aviation resources. It assigns aircraft and qualified personnel to tasks inside a 24 h planning horizon, respecting availability, maintenance windows, turnaround, duty limits, dependencies and a synthetic weather restriction.</p>
        </Panel>
        <Panel kicker="Method" title="How it decides">
          <ul className="plain-list">
            <li>Baseline: a deterministic greedy assignment, always available.</li>
            <li>Optimizer: an OR-Tools CP-SAT constraint model with a 5 s time limit.</li>
            <li>Every proposal is validated independently and saved only after explicit approval.</li>
            <li>Scenarios are isolated forks; saved data changes only when a scenario is applied.</li>
          </ul>
        </Panel>
        <Panel kicker="Boundary" title="Limits">
          <ul className="plain-list">
            <li>All data is fictional and synthetic.</li>
            <li>Not validated for real flight operations or any safety-critical use.</li>
            <li>Times are minutes from the horizon origin; there is no timezone conversion.</li>
            <li>A timed-out CP-SAT run reports UNKNOWN; that is not proof of infeasibility.</li>
          </ul>
        </Panel>
        <Panel kicker="Interface" title="Visuals">
          <p>The 3D airliner is procedural (built from geometric primitives at runtime). No photographs, video, model files or third-party textures are used. Fonts are open-licence and self-hosted.</p>
        </Panel>
      </div>
    </>
  );
}
