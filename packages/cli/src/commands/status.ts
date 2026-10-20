import { Command } from 'commander';
import chalk from 'chalk';

export interface ClusterStatus {
  apiStatus: 'healthy' | 'degraded' | 'offline';
  databaseStatus: 'connected' | 'error' | 'unknown';
  redisStatus: 'connected' | 'error' | 'unknown';
  activeWatchers: number;
  latencyMs: number;
}

/**
 * Probes the backend cluster and parses health / metrics status.
 */
export async function probeClusterStatus(
  apiUrl: string,
  fetchFn: typeof fetch = fetch,
): Promise<ClusterStatus> {
  const start = Date.now();
  let apiStatus: 'healthy' | 'degraded' | 'offline' = 'offline';
  let databaseStatus: 'connected' | 'error' | 'unknown' = 'unknown';
  let redisStatus: 'connected' | 'error' | 'unknown' = 'unknown';
  let activeWatchers = 0;

  try {
    const healthRes = await fetchFn(`${apiUrl}/health`);
    if (!healthRes.ok) {
      return {
        apiStatus: 'degraded',
        databaseStatus: 'unknown',
        redisStatus: 'unknown',
        activeWatchers: 0,
        latencyMs: Date.now() - start,
      };
    }

    apiStatus = 'healthy';

    // Deep check
    try {
      const deepRes = await fetchFn(`${apiUrl}/health/deep`);
      if (deepRes.ok) {
        const deepData = (await deepRes.json()) as any;
        const checks = deepData.checks || deepData;
        databaseStatus = checks.postgres === 'ok' ? 'connected' : 'error';
        redisStatus = checks.redis === 'ok' ? 'connected' : 'error';
        if (databaseStatus === 'error' || redisStatus === 'error') {
          apiStatus = 'degraded';
        }
      }
    } catch {
      // Fallback if deep check is unexposed
    }

    // Stream/watcher count check
    try {
      const streamsRes = await fetchFn(`${apiUrl}/api/v1/streams`);
      if (streamsRes.ok) {
        const streamsData = (await streamsRes.json()) as any;
        if (Array.isArray(streamsData)) {
          activeWatchers = streamsData.filter(
            (s: any) => s.status === 'running' || s.status === 'active',
          ).length;
        } else if (typeof streamsData.total === 'number') {
          activeWatchers = streamsData.total;
        }
      }
    } catch {
      // Ignore stream endpoint errors
    }

    return {
      apiStatus,
      databaseStatus,
      redisStatus,
      activeWatchers,
      latencyMs: Date.now() - start,
    };
  } catch {
    return {
      apiStatus: 'offline',
      databaseStatus: 'unknown',
      redisStatus: 'unknown',
      activeWatchers: 0,
      latencyMs: Date.now() - start,
    };
  }
}

export function formatStatusTable(status: ClusterStatus): string {
  const statusIcon =
    status.apiStatus === 'healthy'
      ? chalk.green('● ONLINE')
      : status.apiStatus === 'degraded'
        ? chalk.yellow('▲ DEGRADED')
        : chalk.red('✖ OFFLINE');

  const dbIcon =
    status.databaseStatus === 'connected'
      ? chalk.green('CONNECTED')
      : status.databaseStatus === 'error'
        ? chalk.red('DISCONNECTED')
        : chalk.gray('UNKNOWN');

  const redisIcon =
    status.redisStatus === 'connected'
      ? chalk.green('CONNECTED')
      : status.redisStatus === 'error'
        ? chalk.red('DISCONNECTED')
        : chalk.gray('UNKNOWN');

  return `
┌────────────────────────────────────────────────────────┐
│               WATCHER CLUSTER STATUS PROBE             │
├───────────────────────────────┬────────────────────────┤
│ API Service                   │ \${statusIcon}
│ Database (PostgreSQL)         │ \${dbIcon}
│ Cache / Queue (Redis)         │ \${redisIcon}
│ Active Monitored Watchers     │ \${chalk.cyan(String(status.activeWatchers))}
│ Roundtrip Latency             │ \${chalk.cyan(status.latencyMs + ' ms')}
└───────────────────────────────┴────────────────────────┘
`;
}

export function registerStatusCommands(program: Command): void {
  program
    .command('status')
    .description('Probe watcher cluster health, database, Redis, and ingestion status')
    .action(async () => {
      const apiUrl = program.opts().apiUrl || 'http://localhost:3001';
      console.log(chalk.blue(`Probing cluster at \${apiUrl}...`));

      const status = await probeClusterStatus(apiUrl);
      console.log(formatStatusTable(status));

      if (status.apiStatus !== 'healthy') {
        console.error(
          chalk.red(
            `
Cluster health probe failed: API status is \${status.apiStatus.toUpperCase()}`,
          ),
        );
        process.exit(1);
      }
    });
}
