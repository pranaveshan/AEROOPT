import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import AppV3 from '../v3/AppV3';
import { mockApi } from '../test/fixtures';

function renderAt(path: string) {
  window.history.pushState({}, '', path);
  return render(<AppV3 />);
}
const primaries = (c: HTMLElement) => c.querySelectorAll('.btn-primary');

describe('Showcase', () => {
  it('shows figures computed from the API and a single primary action', async () => {
    mockApi();
    const { container } = renderAt('/');
    expect(await screen.findByText('3/4')).toBeInTheDocument();
    expect(screen.getByText('5/6')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Every aircraft, crew and task/);
    expect(screen.getByText(/No run yet/)).toBeInTheDocument();
    expect(primaries(container)).toHaveLength(1);
    // no comparison run yet -> dash + prompt, not filler
    expect(screen.getByText(/Run a comparison in Benchmarks/)).toBeInTheDocument();
    // jsdom has no WebGL -> SVG fallback rendered
    expect(container.querySelector('.airliner-svg')).not.toBeNull();
  });

  it('shows dashes and an explanation when the API is down', async () => {
    mockApi([], { offline: true });
    renderAt('/');
    expect(await screen.findByText(/API is not reachable/)).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThan(3);
  });
});

describe('Console', () => {
  it('Dashboard runs the optimizer with the original payload', async () => {
    const fetchMock = mockApi([['POST', /\/schedule\/solve$/, { run_id: 'R1', status: 'FEASIBLE', solver: 'cp-sat', assignments: [], unassigned: {}, objective_components: {}, wall_time_seconds: 0.2, validation: { valid: true, errors: [] }, approval_required: true }]]);
    const { container } = renderAt('/console');
    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
    await screen.findByText('3/4');
    fireEvent.click(screen.getByRole('button', { name: 'Run optimizer' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([u, i]) => String(u).endsWith('/schedule/solve') && JSON.parse(String((i as RequestInit).body)).solver === 'cp-sat')).toBe(true));
    expect(await screen.findByRole('button', { name: 'Approve and apply' })).toBeInTheDocument();
    expect(primaries(container)).toHaveLength(1);
  });

  it('Fleet lists aircraft and opens the JSON editor', async () => {
    mockApi();
    renderAt('/console/fleet');
    expect(await screen.findByText('AC-101')).toBeInTheDocument();
    expect(screen.getByText('8 h')).toBeInTheDocument(); // 600 - 120 minutes
    fireEvent.click(screen.getByRole('button', { name: 'New aircraft' }));
    const dlg = await screen.findByRole('dialog');
    expect(within(dlg).getByLabelText('Record JSON')).toHaveDisplayValue(/AC-NEW/);
  });

  it('legacy /fleet redirects into the console', async () => {
    mockApi();
    renderAt('/fleet');
    expect(await screen.findByRole('heading', { level: 1, name: 'Fleet' })).toBeInTheDocument();
  });

  it('selecting a scenario switches every page into amber scenario mode', async () => {
    mockApi();
    renderAt('/console/scenarios');
    fireEvent.click(await screen.findByRole('button', { name: 'Select scenario Weathered morning' }));
    expect(await screen.findByRole('note', { name: 'Scenario mode' })).toHaveTextContent('Weathered morning');
    fireEvent.click(screen.getByRole('button', { name: 'Return to saved data' }));
    expect(await screen.findByText('Saved data')).toBeInTheDocument();
  });

  it('Settings exposes the v2/v3 theme switch', async () => {
    mockApi();
    renderAt('/console/settings');
    expect(await screen.findByRole('radio', { name: 'v3 Cinematic' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'v2 Lime' })).not.toBeChecked();
  });

  it.each(['/console/schedule', '/console/personnel', '/console/tasks', '/console/scenarios', '/console/analytics', '/console/benchmarks', '/console/audit', '/console/settings', '/console/about'])(
    '%s renders an h1 and at most one primary button', async path => {
      mockApi();
      const { container } = renderAt(path);
      await screen.findByRole('heading', { level: 1 });
      await waitFor(() => expect(container.querySelector('.skeleton')).toBeNull(), { timeout: 2000 }).catch(() => {});
      expect(primaries(container).length).toBeLessThanOrEqual(1);
    });
});
