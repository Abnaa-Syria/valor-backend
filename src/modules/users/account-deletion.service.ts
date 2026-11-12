import bcrypt from 'bcryptjs';
import { prisma } from '../../lib/prisma';
import { storage } from '../../lib/storage';
import { logger } from '../../lib/logger';
import { AppError } from '../../utils/app-error';
import { refund } from '../credits/credits.service';
import { cancelBattle } from '../battles/battles.service';
import { IMAGES_PREFIX } from './image-upload';

/**
 * In-app account deletion (App Store / Google Play requirement, PDPL).
 *
 * What happens:
 * - Personal data is erased: username → "deleted_xxxx", email, password, photos, auth id.
 * - Live activity stops: waiting entries are cancelled, live battles with the player's clips are
 *   cancelled (the opponent and every voter are refunded), pending rematches are cancelled
 *   (the other player is refunded if they paid).
 * - Clips are removed. Video files are deleted, except clips that were part of a finished battle —
 *   the opponent's battle record still shows them, credited to the anonymised account.
 * - Comments are removed, likes, blocks, notifications, sessions and owned cosmetics are deleted.
 * - Kept for legal / accounting reasons, without personal data: purchases, the credit ledger,
 *   gift transactions and votes (anonymous, needed for battle results).
 */
export async function deleteAccount(userId: string, confirm: { password: string } | { byAdmin: true }) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.status === 'DELETED') throw new AppError(409, 'ACCOUNT_DELETED', 'This account was already deleted');
  if ('password' in confirm) {
    const valid = user.passwordHash ? await bcrypt.compare(confirm.password, user.passwordHash) : false;
    if (!valid) throw new AppError(400, 'WRONG_PASSWORD', 'Password is incorrect');
  }

  const filesToDelete: (string | null)[] = [];

  await prisma.$transaction(
    async (tx) => {
      // 1. Waiting entries: cancel (no refund — the account is going away).
      await tx.matchmakingTicket.updateMany({ where: { userId, status: 'QUEUED' }, data: { status: 'CANCELLED' } });

      // 2. Live battles with the player's clips: cancel and refund everyone else.
      const liveBattles = await tx.battle.findMany({
        where: { status: 'ACTIVE', OR: [{ clipA: { userId } }, { clipB: { userId } }] },
        select: { id: true },
      });
      for (const battle of liveBattles) await cancelBattle(battle.id, 'A player deleted their account', tx);

      // 3. Pending rematches: cancel; refund the challenger when it's the other player.
      const rematches = await tx.rematch.findMany({
        where: { status: 'PENDING', OR: [{ challengerId: userId }, { opponentId: userId }] },
      });
      for (const rematch of rematches) {
        await tx.rematch.update({ where: { id: rematch.id }, data: { status: 'CANCELLED', respondedAt: new Date() } });
        if (rematch.challengerId !== userId) {
          await refund(tx, {
            userId: rematch.challengerId,
            type: 'CHALLENGE',
            reason: 'MATCHMAKING_REFUND',
            refType: 'rematch',
            refId: rematch.id,
            note: 'The other player deleted their account',
          });
        }
      }

      // 4. Clips: remove; delete files unless the clip was in a finished battle.
      const clips = await tx.clip.findMany({
        where: { userId },
        select: {
          id: true,
          videoKey: true,
          thumbnailKey: true,
          _count: { select: { battlesAsA: { where: { status: 'CLOSED' } }, battlesAsB: { where: { status: 'CLOSED' } } } },
        },
      });
      for (const clip of clips) {
        if (clip._count.battlesAsA + clip._count.battlesAsB === 0) filesToDelete.push(clip.videoKey, clip.thumbnailKey);
      }
      await tx.clip.updateMany({ where: { userId, status: { not: 'REMOVED' } }, data: { status: 'REMOVED', removedAt: new Date() } });

      // 5. Comments and likes on other players' clips, keeping their counters right.
      const comments = await tx.comment.groupBy({ by: ['clipId'], where: { userId, status: 'VISIBLE' }, _count: { _all: true } });
      for (const row of comments) {
        await tx.clip.update({ where: { id: row.clipId }, data: { commentsCount: { decrement: row._count._all } } });
      }
      await tx.comment.updateMany({ where: { userId, status: 'VISIBLE' }, data: { status: 'REMOVED' } });

      const likes = await tx.clipLike.findMany({ where: { userId }, select: { clipId: true } });
      for (const like of likes) await tx.clip.update({ where: { id: like.clipId }, data: { likesCount: { decrement: 1 } } });
      await tx.clipLike.deleteMany({ where: { userId } });

      // 6. Everything personal that has no legal reason to stay.
      await tx.userBlock.deleteMany({ where: { OR: [{ blockerId: userId }, { blockedId: userId }] } });
      await tx.notification.deleteMany({ where: { userId } });
      await tx.refreshToken.deleteMany({ where: { userId } });
      await tx.passwordResetToken.deleteMany({ where: { userId } });
      await tx.idempotencyKey.deleteMany({ where: { userId } });
      await tx.userCosmetic.deleteMany({ where: { userId } });

      // 7. Anonymise the account row (kept so purchases, ledger and battle history stay consistent).
      const suffix = userId.slice(-8);
      // Only photos the player uploaded (images/…); a ready-made avatar (catalog/…) is shared.
      for (const url of [user.avatarUrl, user.bannerUrl]) {
        const key = storage.keyFromUrl(url);
        if (key?.startsWith(`${IMAGES_PREFIX}/`)) filesToDelete.push(key);
      }
      await tx.user.update({
        where: { id: userId },
        data: {
          status: 'DELETED',
          deletedAt: new Date(),
          username: `deleted_${suffix}`,
          email: `deleted+${userId}@deleted.invalid`,
          passwordHash: null,
          authUid: null,
          avatarUrl: null,
          bannerUrl: null,
          activeFrameId: null,
          activeThemeId: null,
          hideReferralCount: true,
        },
      });
    },
    { timeout: 60_000 },
  );

  // Files go last: if the transaction failed, nothing was deleted.
  for (const key of filesToDelete) await storage.remove(key);
  logger.info({ userId }, 'Account deleted');
}
