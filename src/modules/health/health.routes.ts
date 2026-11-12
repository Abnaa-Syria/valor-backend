import { Router } from 'express';
import { prisma } from '../../lib/prisma';

const router = Router();

router.get('/', async (_req, res) => {
  let database: 'up' | 'down' = 'up';
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    database = 'down';
  }
  const status = database === 'up' ? 'ok' : 'degraded';
  res.status(database === 'up' ? 200 : 503).json({ data: { status, database, time: new Date().toISOString() } });
});

export default router;
