import { FastifyInstance } from 'fastify';
import { authenticateHook } from '../../middleware/auth.middleware';
import { dlqController } from './dlq.controller';

export async function adminRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticateHook);

  app.get('/admin/dlq', dlqController.inspect.bind(dlqController));
  app.post('/admin/dlq/replay', dlqController.replay.bind(dlqController));
  app.post('/admin/dlq/purge', dlqController.purge.bind(dlqController));

  // Diagnostic tool: PostgreSQL table bloat, dead tuples, and cache hit ratios (#763)
  app.get('/admin/db-health', async (_req, reply) => {
    const { prisma } = await import('../../lib/prisma');
    const { DbHealthService } = await import('../maintenance/db-health.service');
    const healthService = new DbHealthService(prisma);
    const report = await healthService.getHealthReport();
    return reply.send(report);
  });
}
