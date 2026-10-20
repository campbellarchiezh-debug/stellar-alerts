import { describe, it, expect, vi } from 'vitest';
import { probeClusterStatus, formatStatusTable } from './status.js';

describe('Cluster Status Probe', () => {
  it('identifies healthy cluster with database and redis connected', async () => {
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith('/health')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'ok' }) });
      }
      if (url.endsWith('/health/deep')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ checks: { postgres: 'ok', redis: 'ok' } }),
        });
      }
      if (url.endsWith('/api/v1/streams')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([{ id: '1', status: 'running' }, { id: '2', status: 'running' }]),
        });
      }
      return Promise.reject(new Error('Unknown url'));
    });

    const status = await probeClusterStatus('http://localhost:3001', mockFetch as any);
    expect(status.apiStatus).toBe('healthy');
    expect(status.databaseStatus).toBe('connected');
    expect(status.redisStatus).toBe('connected');
    expect(status.activeWatchers).toBe(2);

    const table = formatStatusTable(status);
    expect(table).toContain('ONLINE');
    expect(table).toContain('CONNECTED');
  });

  it('detects degraded cluster when redis check fails', async () => {
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith('/health')) {
        return Promise.resolve({ ok: true });
      }
      if (url.endsWith('/health/deep')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ checks: { postgres: 'ok', redis: 'error' } }),
        });
      }
      return Promise.resolve({ ok: false });
    });

    const status = await probeClusterStatus('http://localhost:3001', mockFetch as any);
    expect(status.apiStatus).toBe('degraded');
    expect(status.databaseStatus).toBe('connected');
    expect(status.redisStatus).toBe('error');
  });

  it('detects offline backend when endpoint connection fails', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const status = await probeClusterStatus('http://localhost:3001', mockFetch as any);
    expect(status.apiStatus).toBe('offline');
    expect(status.databaseStatus).toBe('unknown');
  });
});
