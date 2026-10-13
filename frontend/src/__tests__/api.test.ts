import { afterEach, describe, expect, it, vi } from 'vitest';
import { request } from '../api';

afterEach(() => vi.unstubAllGlobals());

describe('request API helper', () => {
  it('returns parsed JSON for successful responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok' }),
    }));
    await expect(request<{ status: string }>('/health')).resolves.toEqual({ status: 'ok' });
  });

  it('surfaces server validation errors instead of hiding them', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ detail: 'Invalid task window' }),
    }));
    await expect(request('/tasks', { method: 'POST' })).rejects.toThrow('Invalid task window');
  });

  it('includes the HTTP status when the error body is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => { throw new Error('not JSON'); },
    }));
    await expect(request('/health')).rejects.toThrow('Request failed (503)');
  });
});
