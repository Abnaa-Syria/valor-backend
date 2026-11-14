import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { env } from '../../config/env';
import { prisma } from '../../lib/prisma';
import { signUserToken } from '../../lib/jwt';
import { randomCode, randomToken, sha256 } from '../../lib/crypto';
import { sendPasswordResetEmail } from '../../lib/mailer';
import { AppError, errors } from '../../utils/app-error';
import { assertActive } from '../../middlewares/user-auth';
import { getSetting } from '../settings/settings.service';
import { notify } from '../notifications/notifications.service';
import { readyWhere } from '../customization/customization.service';

const BCRYPT_ROUNDS = 12;
const RESET_TOKEN_MINUTES = 60;

export type ReferralResult = 'APPLIED' | 'INVALID' | 'NONE';

const authUserSelect = {
  id: true,
  username: true,
  email: true,
  avatarUrl: true,
  popularity: true,
  referralCode: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

async function issueTokens(userId: string) {
  const refreshToken = randomToken();
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: sha256(refreshToken),
      expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000),
    },
  });
  return { accessToken: signUserToken(userId), refreshToken };
}

async function generateReferralCode(tx: Prisma.TransactionClient) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode(8);
    const taken = await tx.user.findUnique({ where: { referralCode: code }, select: { id: true } });
    if (!taken) return code;
  }
  throw new Error('Could not generate a unique referral code');
}

export async function register(input: { username: string; email: string; password: string; referralCode?: string }) {
  const [emailTaken, usernameTaken] = await Promise.all([
    prisma.user.findUnique({ where: { email: input.email }, select: { id: true } }),
    prisma.user.findUnique({ where: { username: input.username }, select: { id: true } }),
  ]);
  if (emailTaken || usernameTaken) {
    throw new AppError(409, 'CONFLICT', 'Account already exists', {
      fields: [...(emailTaken ? ['email'] : []), ...(usernameTaken ? ['username'] : [])],
    });
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  const referralPoints = await getSetting('referralPopularityPoints');

  const { user, referral, inviterName } = await prisma.$transaction(async (tx) => {
    // Every player starts with the default frame, theme and avatar (Origin, VALOR Night, …).
    const defaults = await tx.cosmeticItem.findMany({ where: { isDefault: true, ...readyWhere } });
    const defaultFrame = defaults.find((item) => item.kind === 'FRAME');
    const defaultTheme = defaults.find((item) => item.kind === 'THEME');
    const defaultAvatar = defaults.find((item) => item.kind === 'AVATAR');

    const user = await tx.user.create({
      data: {
        username: input.username,
        email: input.email,
        passwordHash,
        referralCode: await generateReferralCode(tx),
        activeFrameId: defaultFrame?.id,
        activeThemeId: defaultTheme?.id,
        avatarUrl: defaultAvatar?.assetUrl,
        cosmetics: { create: defaults.map((item) => ({ itemId: item.id })) },
      },
      select: authUserSelect,
    });

    let referral: ReferralResult = 'NONE';
    let inviterName: string | null = null;
    if (input.referralCode) {
      const inviter = await tx.user.findUnique({
        where: { referralCode: input.referralCode },
        select: { id: true, status: true, username: true },
      });
      // An invalid or unusable code never blocks sign-up (design: 00h1 / 00i1).
      if (!inviter || inviter.status !== 'ACTIVE') {
        referral = 'INVALID';
      } else {
        referral = 'APPLIED';
        inviterName = inviter.username;
        await tx.referral.create({ data: { inviterId: inviter.id, inviteeId: user.id, pointsAwarded: referralPoints } });
        if (referralPoints > 0) {
          await tx.popularityEvent.create({
            data: { userId: inviter.id, amount: referralPoints, source: 'REFERRAL', refId: user.id },
          });
          await tx.user.update({ where: { id: inviter.id }, data: { popularity: { increment: referralPoints } } });
        }
        await notify(tx, inviter.id, 'FRIEND_JOINED', {
          title: 'A friend joined',
          body: `${user.username} joined VALOR with your invite link${referralPoints > 0 ? ` (+${referralPoints} popularity)` : ''}.`,
          data: { userId: user.id },
        });
      }
    }

    return { user, referral, inviterName };
  });

  // Account created screen (00i / 00i1): who invited you and what they received.
  return { user, referral, inviter: inviterName, referralPoints, tokens: await issueTokens(user.id) };
}

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  const valid = user?.passwordHash ? await bcrypt.compare(password, user.passwordHash) : false;
  if (!user || !valid) throw errors.unauthorized('Email or password is incorrect');
  assertActive(user.status);

  await prisma.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } });
  const profile = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: authUserSelect });
  return { user: profile, tokens: await issueTokens(user.id) };
}

const REUSE_GRACE_MS = 2 * 60 * 1000;

/** Rotates the refresh token. Reusing an old (already rotated) token signs out every session. */
export async function refresh(refreshToken: string) {
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: sha256(refreshToken) },
    include: { user: { select: { id: true, status: true } } },
  });
  if (!stored) throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Session expired, please log in again');

  if (stored.revokedAt) {
    // Grace window: the app was killed (or the network dropped) after we rotated this token but before it
    // saved the new one. A replay within 2 minutes is that, not theft — issue a fresh pair instead of
    // signing every session out.
    if (Date.now() - stored.revokedAt.getTime() < REUSE_GRACE_MS && stored.expiresAt > new Date()) {
      assertActive(stored.user.status);
      return issueTokens(stored.userId);
    }
    await prisma.refreshToken.updateMany({ where: { userId: stored.userId, revokedAt: null }, data: { revokedAt: new Date() } });
    throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Session expired, please log in again');
  }
  if (stored.expiresAt < new Date()) throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Session expired, please log in again');
  assertActive(stored.user.status);

  const revoked = await prisma.refreshToken.updateMany({
    where: { id: stored.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (revoked.count === 0) throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Session expired, please log in again');

  await prisma.user.update({ where: { id: stored.userId }, data: { lastSeenAt: new Date() } });
  return issueTokens(stored.userId);
}

export async function logout(refreshToken: string) {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: sha256(refreshToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Always succeeds, so the response never reveals whether an email is registered. */
export async function forgotPassword(email: string) {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, status: true, passwordHash: true } });
  if (!user || user.status === 'BANNED' || user.status === 'DELETED' || !user.passwordHash) return;

  const token = randomToken(32);
  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + RESET_TOKEN_MINUTES * 60 * 1000) },
  });
  await sendPasswordResetEmail(email, token);
}

export async function resetPassword(token: string, password: string) {
  const stored = await prisma.passwordResetToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!stored || stored.usedAt || stored.expiresAt < new Date()) {
    throw new AppError(400, 'INVALID_RESET_TOKEN', 'This reset link is invalid or has expired');
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  await prisma.$transaction([
    prisma.passwordResetToken.update({ where: { id: stored.id }, data: { usedAt: new Date() } }),
    prisma.user.update({ where: { id: stored.userId }, data: { passwordHash } }),
    // Signs out every device after a password change.
    prisma.refreshToken.updateMany({ where: { userId: stored.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
}

/** Public: who owns an invite code (sign-up 00h shows "Invited by {name}"). Unknown/unusable → 404. */
export async function lookupReferral(code: string) {
  const inviter = await prisma.user.findUnique({ where: { referralCode: code }, select: { username: true, status: true } });
  if (!inviter || inviter.status !== 'ACTIVE') throw errors.notFound('This invite link isn’t valid');
  return { username: inviter.username, referralPoints: await getSetting('referralPopularityPoints') };
}
