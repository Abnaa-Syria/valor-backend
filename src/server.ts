import { createApp } from './app';
import { env } from './config/env';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';
import { startScheduler } from './jobs/scheduler';

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info(`VALOR API running on http://localhost:${env.PORT}/api`);
});

const stopScheduler = startScheduler();

async function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down`);
  stopScheduler();
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
