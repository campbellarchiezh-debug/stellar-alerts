import { describe, it, expect, vi } from 'vitest';
import { DbHealthService } from './db-health.service';

describe('DbHealthService', () => {
  it('computes dead tuple ratios and reports optimization recommendations', async () => {
    const mockPrisma = {
      $queryRaw: vi
        .fn()
        .mockResolvedValueOnce([
          {
            tableName: 'Payment',
            liveTuples: 1000,
            deadTuples: 400,
            lastVacuum: null,
            lastAutoVacuum: '2026-10-19T00:00:00Z',
          },
          {
            tableName: 'Wallet',
            liveTuples: 500,
            deadTuples: 10,
            lastVacuum: null,
            lastAutoVacuum: null,
          },
        ])
        .mockResolvedValueOnce([
          {
            heap_read: 100,
            heap_hit: 900,
            idx_read: 200,
            idx_hit: 600, // 75% hit ratio -> triggers recommendation
          },
        ]),
    };

    const service = new DbHealthService(mockPrisma as any);
    const report = await service.getHealthReport();

    expect(report.tables).toHaveLength(2);
    expect(report.tables[0].tableName).toBe('Payment');
    expect(report.tables[0].deadTupleRatio).toBeCloseTo(0.286, 2);

    expect(report.cache.tableCacheHitRatio).toBe(0.9);
    expect(report.cache.indexCacheHitRatio).toBe(0.75);

    // Verify recommendations trigger for high dead tuples & low index hit ratio
    expect(report.recommendations.some((r) => r.includes("VACUUM ANALYZE Payment"))).toBe(true);
    expect(report.recommendations.some((r) => r.includes("below 90% SLA"))).toBe(true);
  });

  it('reports optimal status when tables and caches are clean', async () => {
    const mockPrisma = {
      $queryRaw: vi
        .fn()
        .mockResolvedValueOnce([
          {
            tableName: 'Wallet',
            liveTuples: 1000,
            deadTuples: 5,
            lastVacuum: null,
            lastAutoVacuum: null,
          },
        ])
        .mockResolvedValueOnce([
          {
            heap_read: 10,
            heap_hit: 990,
            idx_read: 5,
            idx_hit: 995,
          },
        ]),
    };

    const service = new DbHealthService(mockPrisma as any);
    const report = await service.getHealthReport();

    expect(report.recommendations).toEqual([
      'Database table health and cache ratios are optimal',
    ]);
  });
});
