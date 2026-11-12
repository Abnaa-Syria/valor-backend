import { env } from '../config/env';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { closeDueBattles } from '../modules/battles/battles.service';
import { expireTickets, matchQueuedTickets } from '../modules/battles/matchmaking.service';
import { expireRematches } from '../modules/battles/rematch.service';

/**
 * Runs time-based work every JOBS_INTERVAL_SECONDS, inside the API process:
 *  - close battles whose voting time ended
 *  - expire (and refund) battle entries that found no opponent in time
 *  - retry matching for waiting entries
 *  - expire rematch requests that got no answer (refund)
 *  - delete idempotency keys older than a day
 *
 * Every step is safe to run on several servers at once (row locks + status checks).
 * If you run more than one API server, you can still set JOBS_ENABLED=false on all but one.
 */
export function startScheduler() {
  if (!env.JOBS_ENABLED) {
    logger.info('Background jobs disabled (JOBS_ENABLED=false)');
    return () => undefined;
  }

  let running = false;

  async function tick() {
    if (running) return;
    running = true;
    try {
      const closed = await closeDueBattles();
      const expired = await expireTickets();
      const matched = await matchQueuedTickets();
      const rematchesExpired = await expireRematches();
      await prisma.idempotencyKey.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } } });
      if (closed || expired || matched || rematchesExpired) {
        logger.info({ closed, expired, matched, rematchesExpired }, 'Background jobs ran');
      }
    } catch (err) {
      logger.error({ err }, 'Background jobs failed');
    } finally {
      running = false;
    }
  }

  const timer = setInterval(tick, env.JOBS_INTERVAL_SECONDS * 1000);
  void tick();
  logger.info(`Background jobs every ${env.JOBS_INTERVAL_SECONDS}s`);
  return () => clearInterval(timer);
}
