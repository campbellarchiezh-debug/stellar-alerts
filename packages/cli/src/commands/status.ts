import { Command } from 'commander';
import chalk from 'chalk';

export async function probeClusterStatus(apiUrl: string, fetchFn: typeof fetch = fetch) {
  const start = Date.now();
  try {
    const healthRes = await fetchFn(`${apiUrl}/health`);
    if (!healthRes.ok) {
      return { apiStatus: 'degraded', databaseStatus: 'unknown', redisStatus: 'unknown', activeWatchers: 0, latencyMs: Date.now() - start };
    }
    let databaseStatus = 'unknown';
    let redisStatus = 'unknown';
    try {
      const deepRes = await fetchFn(`${apiUrl}/health/deep`);
      if (deepRes.ok) {
        const deepData = (await deepRes.json()) as any;
        const checks = deepData.checks || deepData;
        databaseStatus = checks.postgres === 'ok' ? 'connected' : 'error';
        redisStatus = checks.redis === 'ok' ? 'connected' : 'error';
      }
    } catch {}
    return { apiStatus: 'healthy', databaseStatus, redisStatus, activeWatchers: 0, latencyMs: Date.now() - start };
  } catch {
    return { apiStatus: 'offline', databaseStatus: 'unknown', redisStatus: 'unknown', activeWatchers: 0, latencyMs: Date.now() - start };
  }
}

export function registerStatusCommands(program: Command): void {
  program
    .command('status')
    .description('Probe watcher cluster health, database, Redis, and ingestion status')
    .action(async () => {
      const apiUrl = program.opts().apiUrl || 'http://localhost:3001';
      console.log(chalk.blue(`Probing cluster at ${apiUrl}...`));
      const status = await probeClusterStatus(apiUrl);
      console.log(`Cluster Status: API=${status.apiStatus}, DB=${status.databaseStatus}, Redis=${status.redisStatus} (${status.latencyMs}ms)`);
      if (status.apiStatus !== 'healthy') process.exit(1);
    });
}
