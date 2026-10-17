import { vi } from 'vitest';

export const dashboard = {
  synthetic: true, schedule_version: 'SEED-0',
  aircraft: { total: 4, serviceable: 3, grounded: 1 }, personnel: { total: 6, available: 5 },
  tasks: { total: 8, pending: 7, scheduled: 1, unassigned: 7, completed: 0, cancelled: 0 },
  completion_rate: 12.5, recent_run: null, latest_assignments: [],
};
export const aircraft = [
  { id: 'AC-101', type: 'Twin turboprop', capabilities: ['cargo'], home_facility: 'NORTH FIELD', status: 'serviceable', available_from: 0, available_until: 1440, max_flight_minutes: 600, used_flight_minutes: 120, turnaround_minutes: 30, maintenance: [[600, 660]] },
  { id: 'AC-102', type: 'Regional jet', capabilities: [], home_facility: 'SOUTH FIELD', status: 'grounded', available_from: 0, available_until: 1440, max_flight_minutes: 500, used_flight_minutes: 0, turnaround_minutes: 45, maintenance: [] },
];
export const crew = [{ id: 'CREW-1', role: 'Pilot', qualifications: ['ifr'], available_from: 0, available_until: 900, max_duty_minutes: 600, used_duty_minutes: 60, min_rest_minutes: 30 }];
export const tasks = [{ id: 'T-1', title: 'Line training', category: 'Training and evaluation', priority: 2, release: 0, earliest_start: 60, latest_finish: 300, duration: 90, capabilities: [], qualifications: [], dependencies: [], support_units: 1, status: 'pending' }];
export const schedule = [{ task_id: 'T-1', aircraft_id: 'AC-101', crew_id: 'CREW-1', start: 60, finish: 150 }];
export const scenarios = [{ id: 'SCN-1', name: 'Weathered morning', status: 'draft', version: 1 }];

type Route = [method: string, pattern: RegExp, body: unknown];
export function mockApi(overrides: Route[] = [], { offline = false } = {}) {
  const routes: Route[] = [
    ...overrides,
    ['GET', /\/dashboard$/, dashboard],
    ['GET', /\/aircraft(\?.*)?$/, aircraft],
    ['GET', /\/personnel(\?.*)?$/, crew],
    ['GET', /\/tasks$/, tasks],
    ['GET', /\/schedule$/, { assignments: schedule }],
    ['GET', /\/runs$/, []],
    ['GET', /\/audit$/, []],
    ['GET', /\/scenarios$/, { scenarios }],
    ['GET', /\/analytics\/benchmarks$/, { status: 'AVAILABLE', synthetic: true, message: 'Run the benchmark script.' }],
  ];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (offline) throw new TypeError('Failed to fetch');
    const method = init?.method ?? 'GET';
    const hit = routes.find(([m, re]) => m === method && re.test(url));
    if (!hit) return { ok: false, status: 404, json: async () => ({ detail: `No mock for ${method} ${url}` }) };
    const b = hit[2] as { __status?: number; detail?: unknown } | null;
    if (b && typeof b === 'object' && b.__status) return { ok: false, status: b.__status, json: async () => ({ detail: b.detail }) };
    return { ok: true, status: 200, json: async () => hit[2] };
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** Unsigned-but-well-formed token for client-side session decoding in tests. */
export function token(sub: string, role: string, ttl = 3600) {
  const raw = btoa(JSON.stringify({ sub, role, exp: Math.floor(Date.now() / 1000) + ttl })).replace(/=+$/, '');
  return `${raw}.testsig`;
}
