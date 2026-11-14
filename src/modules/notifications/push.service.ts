import fs from 'node:fs';
import { z } from 'zod';
import type { App } from 'firebase-admin/app';
import { env } from '../../config/env';
import { logger } from '../../lib/logger';
import { prisma } from '../../lib/prisma';

/**
 * Push notifications through Firebase Cloud Messaging.
 *
 * Every in-app notification (see `notify`) is also pushed to the player's phones. `notify` runs inside
 * the event's transaction, so pushing from there could announce something that is then rolled back.
 * Instead a small loop sends notifications that are committed and not pushed yet (`pushedAt` null).
 *
 * Push is off until FIREBASE_SERVICE_ACCOUNT is set (the service-account JSON, or a path to it).
 */

export const deviceSchema = z.object({
  token: z.string().trim().min(20).max(255),
  platform: z.enum(['android', 'ios']),
});

export async function registerDevice(userId: string, input: z.infer<typeof deviceSchema>) {
  // A phone belongs to whoever signed in on it last.
  await prisma.deviceToken.upsert({
    where: { token: input.token },
    create: { userId, token: input.token, platform: input.platform },
    update: { userId, platform: input.platform },
  });
  return { registered: true, pushEnabled: Boolean(env.FIREBASE_SERVICE_ACCOUNT) };
}

export async function unregisterDevice(userId: string, token: string) {
  await prisma.deviceToken.deleteMany({ where: { userId, token } });
  return { registered: false };
}

let app: App | null | undefined;

async function firebase(): Promise<App | null> {
  if (app !== undefined) return app;
  const raw = env.FIREBASE_SERVICE_ACCOUNT?.trim();
  if (!raw) return (app = null);
  try {
    const json = raw.startsWith('{') ? raw : fs.readFileSync(raw, 'utf8');
    const { initializeApp, cert } = await import('firebase-admin/app');
    app = initializeApp({ credential: cert(JSON.parse(json)) }, 'valor-push');
    logger.info('Push notifications enabled (Firebase)');
  } catch (err) {
    logger.error({ err }, 'FIREBASE_SERVICE_ACCOUNT is invalid — push notifications are off');
    app = null;
  }
  return app;
}

/** Notifications older than this are not pushed (e.g. after the API was down for a while). */
const MAX_AGE_MS = 15 * 60 * 1000;

/** Sends committed, not-yet-pushed notifications. Returns how many were handled. */
export async function pushPending(): Promise<number> {
  const fb = await firebase();
  if (!fb) return 0;
  const { getMessaging } = await import('firebase-admin/messaging');

  const pending = await prisma.notification.findMany({
    where: { pushedAt: null },
    orderBy: { createdAt: 'asc' },
    take: 100,
    select: { id: true, userId: true, type: true, title: true, body: true, data: true, createdAt: true },
  });
  if (pending.length === 0) return 0;

  // Claim them first so two servers never push the same one.
  const claimed = await prisma.notification.updateMany({ where: { id: { in: pending.map((n) => n.id) }, pushedAt: null }, data: { pushedAt: new Date() } });
  if (claimed.count === 0) return 0;

  const fresh = pending.filter((n) => Date.now() - n.createdAt.getTime() < MAX_AGE_MS);
  const devices = await prisma.deviceToken.findMany({ where: { userId: { in: [...new Set(fresh.map((n) => n.userId))] } }, select: { userId: true, token: true } });
  const byUser = new Map<string, string[]>();
  for (const d of devices) byUser.set(d.userId, [...(byUser.get(d.userId) ?? []), d.token]);

  const unread = new Map<string, number>();
  const dead: string[] = [];
  for (const n of fresh) {
    const tokens = byUser.get(n.userId);
    if (!tokens?.length) continue;
    if (!unread.has(n.userId)) unread.set(n.userId, await prisma.notification.count({ where: { userId: n.userId, readAt: null } }));
    // FCM data values must be strings; the app uses them to open the right screen.
    const data: Record<string, string> = { notificationId: n.id, type: n.type };
    for (const [k, v] of Object.entries((n.data as Record<string, unknown> | null) ?? {})) if (v !== null && v !== undefined) data[k] = String(v);
    try {
      const res = await getMessaging(fb).sendEachForMulticast({
        tokens,
        notification: { title: n.title, body: n.body },
        data,
        android: { priority: 'high', notification: { sound: 'default' } },
        apns: { payload: { aps: { sound: 'default', badge: unread.get(n.userId) } } },
      });
      res.responses.forEach((r, i) => {
        const code = r.error?.code ?? '';
        if (code.includes('registration-token-not-registered') || code.includes('invalid-registration-token') || code.includes('invalid-argument')) dead.push(tokens[i]);
      });
    } catch (err) {
      logger.warn({ err, notificationId: n.id }, 'Push send failed');
    }
  }
  if (dead.length) await prisma.deviceToken.deleteMany({ where: { token: { in: dead } } });
  return claimed.count;
}

/** Runs pushPending every few seconds (only when push is configured). */
export function startPushLoop() {
  if (!env.FIREBASE_SERVICE_ACCOUNT) {
    logger.info('Push notifications off (FIREBASE_SERVICE_ACCOUNT not set)');
    return () => undefined;
  }
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await pushPending();
    } catch (err) {
      logger.error({ err }, 'Push loop failed');
    } finally {
      running = false;
    }
  }, env.PUSH_INTERVAL_SECONDS * 1000);
  return () => clearInterval(timer);
}
