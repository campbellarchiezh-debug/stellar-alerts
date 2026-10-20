import { PrismaClient } from '@prisma/client';

export interface TableTupleHealth {
  tableName: string;
  liveTuples: number;
  deadTuples: number;
  deadTupleRatio: number; // 0.0 - 1.0
  lastVacuum: string | null;
  lastAutoVacuum: string | null;
}

export interface CacheEfficiency {
  tableCacheHitRatio: number; // 0.0 - 1.0
  indexCacheHitRatio: number; // 0.0 - 1.0
}

export interface DbHealthReport {
  timestamp: string;
  tables: TableTupleHealth[];
  cache: CacheEfficiency;
  recommendations: string[];
}

export class DbHealthService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Evaluates table bloat, dead tuples, and buffer cache ratios from PostgreSQL stats.
   */
  public async getHealthReport(): Promise<DbHealthReport> {
    const rawTables = await this.prisma.$queryRaw<any[]>`
      SELECT
        relname as "tableName",
        n_live_tup as "liveTuples",
        n_dead_tup as "deadTuples",
        last_vacuum as "lastVacuum",
        last_autovacuum as "lastAutoVacuum"
      FROM pg_stat_user_tables
      ORDER BY n_dead_tup DESC;
    `;

    const rawCache = await this.prisma.$queryRaw<any[]>`
      SELECT
        sum(heap_blks_read) as heap_read,
        sum(heap_blks_hit) as heap_hit,
        sum(idx_blks_read) as idx_read,
        sum(idx_blks_hit) as idx_hit
      FROM pg_statio_user_tables;
    `;

    const tables: TableTupleHealth[] = (rawTables || []).map((t) => {
      const live = Number(t.liveTuples) || 0;
      const dead = Number(t.deadTuples) || 0;
      const total = live + dead;
      const ratio = total > 0 ? dead / total : 0;
      return {
        tableName: String(t.tableName),
        liveTuples: live,
        deadTuples: dead,
        deadTupleRatio: Math.round(ratio * 1000) / 1000,
        lastVacuum: t.lastVacuum ? new Date(t.lastVacuum).toISOString() : null,
        lastAutoVacuum: t.lastAutoVacuum ? new Date(t.lastAutoVacuum).toISOString() : null,
      };
    });

    const cacheRow = rawCache?.[0] || {};
    const heapRead = Number(cacheRow.heap_read) || 0;
    const heapHit = Number(cacheRow.heap_hit) || 0;
    const idxRead = Number(cacheRow.idx_read) || 0;
    const idxHit = Number(cacheRow.idx_hit) || 0;

    const tableHitRatio =
      heapRead + heapHit > 0 ? heapHit / (heapRead + heapHit) : 1.0;
    const idxHitRatio =
      idxRead + idxHit > 0 ? idxHit / (idxRead + idxHit) : 1.0;

    const cache: CacheEfficiency = {
      tableCacheHitRatio: Math.round(tableHitRatio * 1000) / 1000,
      indexCacheHitRatio: Math.round(idxHitRatio * 1000) / 1000,
    };

    const recommendations: string[] = [];

    // Analyze table recommendations
    for (const tbl of tables) {
      if (tbl.deadTupleRatio > 0.2 && tbl.deadTuples > 500) {
        recommendations.push(
          `High dead tuple ratio (${(tbl.deadTupleRatio * 100).toFixed(1)}%) in '${tbl.tableName}': recommend executing 'VACUUM ANALYZE ${tbl.tableName}'`,
        );
      }
    }

    if (cache.indexCacheHitRatio < 0.9) {
      recommendations.push(
        `Index cache hit ratio (${(cache.indexCacheHitRatio * 100).toFixed(1)}%) is below 90% SLA: recommend evaluating shared_buffers or reindexing bloated tables`,
      );
    }

    if (recommendations.length === 0) {
      recommendations.push('Database table health and cache ratios are optimal');
    }

    return {
      timestamp: new Date().toISOString(),
      tables,
      cache,
      recommendations,
    };
  }
}
